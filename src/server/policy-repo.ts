// 정책·이력 DB 접근 (설계 2.2, 6장). 바꾸는 함수는 모두 한 트랜잭션 + 잠금 하나로 줄을 세우고,
// 같은 트랜잭션에서 이력을 남긴다. 커스텀 입력은 화면과 같은 순수 함수로 다시 검사한다(서버가 최종 판단).
import type { PoolClient } from "pg";
import { type CustomExtensionError, normalizeCustomExtension } from "@/domain/custom-extension";
import { pool } from "./db";

export const CUSTOM_LIMIT = 200;

export type AuditAction = "fixed_blocked" | "fixed_unblocked" | "custom_added" | "custom_removed" | "policy_reset";
export type FixedItem = { ext: string; blocked: boolean };
export type CustomItem = { ext: string; createdAt: string };
export type PolicySnapshot = { fixed: FixedItem[]; custom: CustomItem[] };
export type AuditItem = { id: string; occurredAt: string; action: AuditAction; ext: string | null };

type InputError = Exclude<CustomExtensionError, "FIXED_EXTENSION">;
export type AddCustomResult =
  | { ok: true; ext: string; createdAt: string; customCount: number }
  | { ok: false; code: "INVALID_EXTENSION"; reason: InputError }
  | { ok: false; code: "FIXED_EXTENSION" | "DUPLICATE_EXTENSION" | "CUSTOM_LIMIT_REACHED" };

// 트랜잭션 단위 잠금이라 커밋·롤백 때 풀린다. Neon 풀러(트랜잭션 모드)에서도 쓸 수 있는 종류 (설계 6장)
async function withPolicyLock<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('policy'))");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const audit = (client: PoolClient, action: AuditAction, ext: string | null, requestId: string, detail = {}) =>
  client.query("INSERT INTO policy_audit_log (action, ext, detail, request_id) VALUES ($1, $2, $3, $4)", [
    action,
    ext,
    JSON.stringify(detail),
    requestId,
  ]);

type Queryable = Pick<PoolClient, "query">;

async function selectPolicy(db: Queryable): Promise<PolicySnapshot> {
  const fixed = await db.query<FixedItem>("SELECT ext, blocked FROM fixed_extension ORDER BY sort_order");
  const custom = await db.query<{ ext: string; created_at: Date }>(
    "SELECT ext, created_at FROM custom_extension ORDER BY created_at, id",
  );
  return {
    fixed: fixed.rows,
    custom: custom.rows.map((r) => ({ ext: r.ext, createdAt: r.created_at.toISOString() })),
  };
}

export const readPolicy = () => selectPolicy(pool);

export function setFixedBlocked(ext: string, blocked: boolean, requestId: string) {
  return withPolicyLock(async (client) => {
    const current = await client.query<{ blocked: boolean }>("SELECT blocked FROM fixed_extension WHERE ext = $1", [ext]);
    if (current.rowCount === 0) return { ok: false as const, code: "UNKNOWN_FIXED_EXTENSION" as const };
    // 원하는 상태를 받으므로 같으면 아무것도 바꾸지 않는다 (위험 P10)
    if (current.rows[0].blocked === blocked) return { ok: true as const, ext, blocked, changed: false };
    await client.query("UPDATE fixed_extension SET blocked = $2, updated_at = now() WHERE ext = $1", [ext, blocked]);
    await audit(client, blocked ? "fixed_blocked" : "fixed_unblocked", ext, requestId);
    return { ok: true as const, ext, blocked, changed: true };
  });
}

export function addCustom(raw: string, requestId: string): Promise<AddCustomResult> {
  return withPolicyLock(async (client) => {
    // 고정 목록의 출처는 fixed_extension 하나 (설계 2.2)
    const fixed = await client.query<{ ext: string }>("SELECT ext FROM fixed_extension");
    const input = normalizeCustomExtension(
      raw,
      fixed.rows.map((r) => r.ext),
    );
    if (!input.ok) {
      return input.reason === "FIXED_EXTENSION"
        ? { ok: false, code: "FIXED_EXTENSION" }
        : { ok: false, code: "INVALID_EXTENSION", reason: input.reason };
    }
    const count = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM custom_extension");
    // 잠금 안에서 세므로 동시 요청이 와도 200개를 넘지 않는다 (위험 P5)
    if (count.rows[0].n >= CUSTOM_LIMIT) return { ok: false, code: "CUSTOM_LIMIT_REACHED" };
    const inserted = await client.query<{ created_at: Date }>(
      "INSERT INTO custom_extension (ext) VALUES ($1) ON CONFLICT (ext) DO NOTHING RETURNING created_at",
      [input.ext],
    );
    if (inserted.rowCount === 0) return { ok: false, code: "DUPLICATE_EXTENSION" };
    await audit(client, "custom_added", input.ext, requestId);
    return {
      ok: true,
      ext: input.ext,
      createdAt: inserted.rows[0].created_at.toISOString(),
      customCount: count.rows[0].n + 1,
    };
  });
}

export async function removeCustom(raw: string, requestId: string) {
  // 지울 때는 고정 목록과 비교할 필요가 없다 — 형식만 맞추고, 없으면 지워진 것이 없을 뿐
  const input = normalizeCustomExtension(raw, []);
  if (!input.ok) return { ok: false as const, code: "INVALID_EXTENSION" as const, reason: input.reason };
  return withPolicyLock(async (client) => {
    const deleted = await client.query("DELETE FROM custom_extension WHERE ext = $1", [input.ext]);
    if (deleted.rowCount === 0) return { ok: true as const, removed: false };
    await audit(client, "custom_removed", input.ext, requestId);
    return { ok: true as const, removed: true };
  });
}

export function resetPolicy(requestId: string) {
  return withPolicyLock(async (client) => {
    const before = await selectPolicy(client);
    const fixedBlocked = before.fixed.filter((f) => f.blocked).map((f) => f.ext);
    const custom = before.custom.map((c) => c.ext);
    if (fixedBlocked.length === 0 && custom.length === 0) return { changed: false, policy: before };

    await client.query("UPDATE fixed_extension SET blocked = false, updated_at = now() WHERE blocked");
    await client.query("DELETE FROM custom_extension");
    // 초기화는 한 건으로 남기고 직전 상태를 detail에 담는다 (설계 5.3)
    await audit(client, "policy_reset", null, requestId, { fixed_blocked: fixedBlocked, custom });
    return { changed: true, policy: await selectPolicy(client) };
  });
}

export async function listAudit(limit: number): Promise<AuditItem[]> {
  const { rows } = await pool.query<{ id: string; occurred_at: Date; action: AuditAction; ext: string | null }>(
    "SELECT id, occurred_at, action, ext FROM policy_audit_log ORDER BY occurred_at DESC, id DESC LIMIT $1",
    [limit],
  );
  return rows.map((r) => ({ id: String(r.id), occurredAt: r.occurred_at.toISOString(), action: r.action, ext: r.ext }));
}
