// 정리 (크론 하루 1회, 설계 6장). 몇 번을 돌려도 결과가 같다 (위험 U8·U9·P13)
import { pool } from "./db";
import type { FileStorage } from "./storage";

export async function cleanupExpired(storage: FileStorage, batch = 500) {
  const { rows } = await pool.query<{ id: string; blob_pathname: string | null }>(
    "SELECT id, blob_pathname FROM upload_attempt WHERE expires_at < now() ORDER BY expires_at LIMIT $1",
    [batch],
  );
  const pathnames = rows.flatMap((r) => (r.blob_pathname ? [r.blob_pathname] : []));
  // 파일을 먼저 지운다. 여기서 실패하면 행이 남아 다음 실행에서 다시 시도한다
  await storage.remove(pathnames);
  const deleted =
    rows.length === 0
      ? 0
      : ((await pool.query("DELETE FROM upload_attempt WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id)])).rowCount ?? 0);
  // 이력은 30일 지난 것만 지울 수 있다(트리거가 허용하는 범위)
  const audit = (await pool.query("DELETE FROM policy_audit_log WHERE occurred_at < now() - interval '30 days'")).rowCount ?? 0;
  return { attempts: deleted, files: pathnames.length, audit };
}
