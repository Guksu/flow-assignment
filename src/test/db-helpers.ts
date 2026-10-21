// DB 테스트 공용 도우미. 개발용 DB를 같이 쓰므로 정책을 기본값으로 되돌리고 시작한다.
// 이력은 추가 전용(30일 안 삭제·TRUNCATE 거부)이라 지우지 않고, 테스트 전 마지막 id 이후만 본다.
import { pool } from "@/server/db";
import { assertLocalDatabase } from "./local-db";

export async function resetPolicyTables() {
  assertLocalDatabase(process.env.DATABASE_URL);
  await pool.query("DELETE FROM custom_extension");
  await pool.query("UPDATE fixed_extension SET blocked = false WHERE blocked");
}

export async function lastAuditId(): Promise<number> {
  const { rows } = await pool.query<{ id: string | null }>("SELECT max(id) AS id FROM policy_audit_log");
  return Number(rows[0].id ?? 0);
}

export async function auditSince(id: number) {
  const { rows } = await pool.query<{ action: string; ext: string | null; detail: unknown }>(
    "SELECT action, ext, detail FROM policy_audit_log WHERE id > $1 ORDER BY id",
    [id],
  );
  return rows;
}

export async function insertCustomDirectly(exts: string[]) {
  await pool.query("INSERT INTO custom_extension (ext) SELECT unnest($1::text[])", [exts]);
}
