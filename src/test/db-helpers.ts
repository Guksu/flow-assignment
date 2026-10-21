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

// 업로드 시도는 이력과 달리 지울 수 있다(24시간 보관 표)
export async function resetUploadTables() {
  assertLocalDatabase(process.env.DATABASE_URL);
  await pool.query("DELETE FROM upload_attempt");
}

// 오늘(KST) 0시 기준으로 minutesFromMidnight분 뒤에 저장된 시도를 n건 넣는다 (음수면 어제)
export async function insertStoredAttempts(n: number, minutesFromMidnight = 1) {
  await pool.query(
    `INSERT INTO upload_attempt (status, size_bytes, blob_pathname, created_at, expires_at)
     SELECT 'stored', 1, 'uploads/seed-' || gen_random_uuid(), t, t + interval '24 hours'
     FROM (SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
                  + make_interval(mins => $2) AS t) s, generate_series(1, $1)`,
    [n, minutesFromMidnight],
  );
}
