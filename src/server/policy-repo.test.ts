import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditSince, insertCustomDirectly, lastAuditId, resetPolicyTables } from "@/test/db-helpers";
import { pool } from "./db";
import {
  addCustom,
  CUSTOM_LIMIT,
  listAudit,
  readPolicy,
  removeCustom,
  resetPolicy,
  setFixedBlocked,
} from "./policy-repo";

const RID = "00000000-0000-4000-8000-000000000000";

// 앱 검사를 건너뛰고 DB에 직접 넣었을 때 DB가 거부하는지 (마지막 방어선, 설계 5장)
const sqlError = (sql: string, params: unknown[] = []) =>
  pool.query(sql, params).then(
    () => null,
    (e: { code?: string }) => e.code,
  );

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  await resetPolicyTables();
});
afterAll(() => pool.end());

describe("DB 제약과 트리거 (앱을 거치지 않은 직접 쓰기)", () => {
  it("고정 확장자 7개가 화면 순서대로 들어 있고, 기본은 모두 해제 (과제: 기본 unCheck)", async () => {
    const { fixed } = await readPolicy();
    expect(fixed).toEqual(["bat", "cmd", "com", "cpl", "exe", "scr", "js"].map((ext) => ({ ext, blocked: false })));
  });

  it("시드를 다시 실행해도 체크 상태를 덮지 않는다 (위험 P9 — 재배포)", async () => {
    await pool.query("UPDATE fixed_extension SET blocked = true WHERE ext = 'exe'");
    await pool.query(
      "INSERT INTO fixed_extension (ext, sort_order) VALUES ('bat',1),('cmd',2),('com',3),('cpl',4),('exe',5),('scr',6),('js',7) ON CONFLICT (ext) DO NOTHING",
    );
    const { fixed } = await readPolicy();
    expect(fixed.find((f) => f.ext === "exe")?.blocked).toBe(true);
  });

  it.each(["SH", "tar..gz", "a.b.c", ".sh", "s h", ""])("정규화되지 않은 값 %j는 CHECK가 거부 (위험 P1)", async (ext) => {
    expect(await sqlError("INSERT INTO custom_extension (ext) VALUES ($1)", [ext])).toBe("23514");
  });

  it("같은 커스텀 확장자 두 번은 UNIQUE가 거부 (위험 P3)", async () => {
    await insertCustomDirectly(["sh"]);
    expect(await sqlError("INSERT INTO custom_extension (ext) VALUES ('sh')")).toBe("23505");
  });

  it("커스텀에 고정 확장자를 넣으면 트리거가 거부 (위험 P2)", async () => {
    expect(await sqlError("INSERT INTO custom_extension (ext) VALUES ('exe')")).toBe("23514");
  });

  it("반대 방향: 커스텀에 있는 확장자를 고정 목록에 더하면 트리거가 거부", async () => {
    await insertCustomDirectly(["zip"]);
    expect(await sqlError("INSERT INTO fixed_extension (ext, sort_order) VALUES ('zip', 99)")).toBe("23514");
  });

  it("이력은 고칠 수도, 30일 안에 지울 수도, 통째로 비울 수도 없다 (위험 P7)", async () => {
    await setFixedBlocked("exe", true, RID);
    const id = await lastAuditId();
    expect(await sqlError("UPDATE policy_audit_log SET ext = 'bat' WHERE id = $1", [id])).not.toBeNull();
    expect(await sqlError("DELETE FROM policy_audit_log WHERE id = $1", [id])).not.toBeNull();
    expect(await sqlError("TRUNCATE policy_audit_log")).not.toBeNull();
  });

  it("30일 지난 이력은 지울 수 있다 (정리 크론)", async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO policy_audit_log (occurred_at, action, ext, request_id) VALUES (now() - interval '31 days', 'custom_added', 'old', $1) RETURNING id",
      [RID],
    );
    expect(await sqlError("DELETE FROM policy_audit_log WHERE id = $1", [rows[0].id])).toBeNull();
  });
});

describe("고정 확장자 체크", () => {
  it("원하는 상태를 보내고, 바뀌었을 때만 이력을 남긴다 (위험 P10)", async () => {
    const before = await lastAuditId();
    expect(await setFixedBlocked("exe", true, RID)).toEqual({ ok: true, ext: "exe", blocked: true, changed: true });
    expect(await setFixedBlocked("exe", true, RID)).toEqual({ ok: true, ext: "exe", blocked: true, changed: false });
    expect(await auditSince(before)).toEqual([{ action: "fixed_blocked", ext: "exe", detail: {} }]);
  });

  it("없는 고정 확장자", async () => {
    expect(await setFixedBlocked("zip", true, RID)).toEqual({ ok: false, code: "UNKNOWN_FIXED_EXTENSION" });
  });
});

describe("커스텀 확장자 추가·삭제", () => {
  it("서버도 같은 함수로 정규화하고 이력을 남긴다", async () => {
    const before = await lastAuditId();
    const added = await addCustom(" .SH ", RID);
    expect(added).toMatchObject({ ok: true, ext: "sh", customCount: 1 });
    expect(await auditSince(before)).toEqual([{ action: "custom_added", ext: "sh", detail: {} }]);
  });

  it.each([
    ["exe", { ok: false, code: "FIXED_EXTENSION" }],
    ["ｅｘｅ", { ok: false, code: "FIXED_EXTENSION" }], // 화면 검사를 건너뛴 직접 요청도 같은 결과
    ["*.exe", { ok: false, code: "INVALID_EXTENSION", reason: "WILDCARD" }],
    ["pkg.tar.zst", { ok: false, code: "INVALID_EXTENSION", reason: "TOO_MANY_SEGMENTS" }],
  ])("%j → %j", async (raw, result) => {
    expect(await addCustom(raw, RID)).toEqual(result);
  });

  it("이미 있는 확장자", async () => {
    await addCustom("sh", RID);
    expect(await addCustom("SH", RID)).toEqual({ ok: false, code: "DUPLICATE_EXTENSION" });
  });

  it(`${CUSTOM_LIMIT - 1}개에서 동시에 두 건을 추가하면 한 건만 성공한다 (위험 P5, AI 오류 E6)`, async () => {
    await insertCustomDirectly(Array.from({ length: CUSTOM_LIMIT - 1 }, (_, i) => `x${i}`));
    const results = await Promise.all([addCustom("aa", RID), addCustom("bb", RID)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: "CUSTOM_LIMIT_REACHED" }]);
    expect((await readPolicy()).custom).toHaveLength(CUSTOM_LIMIT);
  });

  it("삭제는 멱등이고, 실제로 지웠을 때만 이력을 남긴다 (위험 P11)", async () => {
    await addCustom("sh", RID);
    const before = await lastAuditId();
    expect(await removeCustom("SH", RID)).toEqual({ ok: true, removed: true });
    expect(await removeCustom("sh", RID)).toEqual({ ok: true, removed: false });
    expect(await auditSince(before)).toEqual([{ action: "custom_removed", ext: "sh", detail: {} }]);
  });

  it("삭제 입력도 검사한다", async () => {
    expect(await removeCustom("*", RID)).toEqual({ ok: false, code: "INVALID_EXTENSION", reason: "WILDCARD" });
  });
});

describe("기본값으로 초기화", () => {
  it("고정은 모두 해제, 커스텀은 모두 삭제하고 직전 상태를 이력 한 건에 남긴다", async () => {
    await setFixedBlocked("exe", true, RID);
    await addCustom("sh", RID);
    await addCustom("tar.gz", RID);
    const before = await lastAuditId();

    const { changed, policy } = await resetPolicy(RID);
    expect(changed).toBe(true);
    expect(policy.fixed.every((f) => !f.blocked)).toBe(true);
    expect(policy.custom).toEqual([]);
    expect(await auditSince(before)).toEqual([
      { action: "policy_reset", ext: null, detail: { fixed_blocked: ["exe"], custom: ["sh", "tar.gz"] } },
    ]);
  });

  it("이미 기본값이면 이력을 남기지 않는다", async () => {
    const before = await lastAuditId();
    expect((await resetPolicy(RID)).changed).toBe(false);
    expect(await auditSince(before)).toEqual([]);
  });
});

describe("이력 조회", () => {
  it("최근 것부터, 요청한 개수만큼", async () => {
    await addCustom("sh", RID);
    await addCustom("zip", RID);
    const items = await listAudit(2);
    expect(items.map((i) => [i.action, i.ext])).toEqual([
      ["custom_added", "zip"],
      ["custom_added", "sh"],
    ]);
  });
});
