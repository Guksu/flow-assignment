// 업로드 처리 (설계 6장): 이름 → 정책 / 크기 판정(이름·정책 우선) → 하루 총량 확인·예약 → 저장.
// 시도는 결과와 상관없이 모두 기록한다(문답 #23). 판정은 브라우저와 같은 순수 함수로 서버가 다시 한다 (위험 U1).
import type { PoolClient } from "pg";
import type { ExtensionSource } from "@/domain/policy";
import { checkUpload } from "@/domain/upload-check";
import type { ParsedUploadName } from "@/domain/upload-name";
import { MAX_FILE_BYTES, type NameErrorCode } from "@/domain/upload-name";
import { pool } from "./db";
import { readPolicy } from "./policy-repo";
import type { FileStorage } from "./storage";

export { MAX_FILE_BYTES };
type ParsedName = Extract<ParsedUploadName, { ok: true }>;
export const DAILY_LIMIT = 50; // 하루 저장 총량, KST 자정 경계 (문답 #16·#25)

export type UploadCode = NameErrorCode | "FILE_TOO_LARGE" | "EXTENSION_BLOCKED" | "DAILY_LIMIT_REACHED" | "STORAGE_ERROR";
export type UploadStatus = "stored" | "blocked" | "rejected";
export type UploadAttempt = {
  id: string;
  status: UploadStatus;
  reasonCode: string | null;
  name: string | null;
  ext: string | null;
  matchedRule: string | null;
  matchedSource: ExtensionSource | null;
  sizeBytes: number;
  createdAt: string;
};
export type UploadResult = { code: UploadCode | null; attempt: UploadAttempt };
export type UploadInput = { name: string; size: number; read: () => Promise<Uint8Array> };

type AttemptValues = {
  status: UploadStatus;
  reasonCode: string | null;
  name: string | null;
  ext: string | null;
  sizeBytes: number;
  matchedRule?: string;
  matchedSource?: ExtensionSource;
};
type AttemptRow = {
  id: string;
  status: UploadStatus;
  reason_code: string | null;
  original_name: string | null;
  ext: string | null;
  matched_rule: string | null;
  matched_source: ExtensionSource | null;
  size_bytes: number;
  created_at: Date;
};

const DB_EXT = /^[a-z0-9]{1,20}$/; // upload_attempt.ext 형식. 밖이면 NULL로 둔다 (설계 5.4)
const TODAY_KST = "(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')";

const toAttempt = (r: AttemptRow): UploadAttempt => ({
  id: r.id,
  status: r.status,
  reasonCode: r.reason_code,
  name: r.original_name,
  ext: r.ext,
  matchedRule: r.matched_rule,
  matchedSource: r.matched_source,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at.toISOString(),
});

async function insertAttempt(db: Pick<PoolClient, "query">, v: AttemptValues): Promise<UploadAttempt> {
  const id = crypto.randomUUID();
  const { rows } = await db.query<AttemptRow>(
    `INSERT INTO upload_attempt
       (id, status, reason_code, original_name, ext, matched_rule, matched_source, size_bytes, blob_pathname, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '24 hours')
     RETURNING *`,
    [
      id,
      v.status,
      v.reasonCode,
      v.name,
      v.ext,
      v.matchedRule ?? null,
      v.matchedSource ?? null,
      v.sizeBytes,
      // 원래 이름·확장자 없이 무작위 경로만 (위험 U4)
      v.status === "stored" ? `uploads/${id}` : null,
    ],
  );
  return toAttempt(rows[0]);
}

// 시도 행에 남길 이름과 확장자. 확장자가 DB 형식 밖이면 NULL (설계 5.4)
const describe = (name: ParsedName, sizeBytes: number) => ({
  name: name.displayName,
  ext: name.single && DB_EXT.test(name.single) ? name.single : null,
  sizeBytes,
});

// 판정 로그는 결과·사유·확장자·크기만. 원래 이름은 남기지 않는다 (위험 O2·D13)
function finish(requestId: string, attempt: UploadAttempt, code: UploadCode | null): UploadResult {
  console.info(
    JSON.stringify({
      event: "upload_attempt",
      requestId,
      status: attempt.status,
      reason: attempt.reasonCode,
      ext: attempt.ext,
      size: attempt.sizeBytes,
    }),
  );
  return { code, attempt };
}

// 요청 크기만 보고 거부한 경우 — 본문을 읽지 않아 이름을 모른다
export async function recordOversized(size: number, requestId: string): Promise<UploadResult> {
  const attempt = await insertAttempt(pool, {
    status: "rejected",
    reasonCode: "FILE_TOO_LARGE",
    name: null,
    ext: null,
    sizeBytes: size,
  });
  return finish(requestId, attempt, "FILE_TOO_LARGE");
}

export async function handleUpload(input: UploadInput, storage: FileStorage, requestId: string): Promise<UploadResult> {
  // 1~3. 이름 → 정책 / 크기를 따로 판정하고 이름·정책 사유를 우선한다(문답 #39). 정책은 요청마다 최신으로 읽는다.
  // 판정에는 이름과 크기만 쓰고 내용은 쓰지 않는다(본문은 라우트의 request.formData()가 이미 받은 상태).
  // 파일 바이트(input.read)는 판정을 통과한 뒤에만 꺼낸다
  const policy = await readPolicy();
  const check = checkUpload(input.name, input.size, {
    fixedBlocked: policy.fixed.filter((f) => f.blocked).map((f) => f.ext),
    custom: policy.custom.map((c) => c.ext),
  });
  if (!check.ok) {
    switch (check.code) {
      case "EXTENSION_BLOCKED": {
        const attempt = await insertAttempt(pool, {
          ...describe(check.name, input.size),
          status: "blocked",
          reasonCode: check.code,
          matchedRule: check.matched,
          matchedSource: check.source,
        });
        return finish(requestId, attempt, check.code);
      }
      case "FILE_TOO_LARGE": {
        const attempt = await insertAttempt(pool, { ...describe(check.name, input.size), status: "rejected", reasonCode: check.code });
        return finish(requestId, attempt, check.code);
      }
      default: {
        // 이름이 잘못된 시도는 이름을 저장하지 않는다
        const attempt = await insertAttempt(pool, { name: null, ext: null, sizeBytes: input.size, status: "rejected", reasonCode: check.code });
        return finish(requestId, attempt, check.code);
      }
    }
  }
  const base = describe(check.name, input.size);

  // 4. 하루 총량 — 잠금 안에서 오늘 저장된 수를 세고, 저장할 행을 먼저 기록(예약)한다
  const body = await input.read();
  const client = await pool.connect();
  let reserved: UploadAttempt;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('upload'))");
    const today = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM upload_attempt WHERE status = 'stored' AND created_at >= ${TODAY_KST}`,
    );
    const full = today.rows[0].n >= DAILY_LIMIT;
    reserved = await insertAttempt(
      client,
      full ? { ...base, status: "rejected", reasonCode: "DAILY_LIMIT_REACHED" } : { ...base, status: "stored", reasonCode: null },
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (reserved.status === "rejected") return finish(requestId, reserved, "DAILY_LIMIT_REACHED");

  // 5. 저장 — 실패하면 행을 거부로 바꾸고 그 경로 삭제를 한 번 시도한다. 행을 먼저 썼으므로 저장소에만 남는 파일은 없다
  const pathname = `uploads/${reserved.id}`;
  try {
    await storage.put(pathname, body);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "storage_error", requestId, cause: error instanceof Error ? error.message : "unknown" }),
    );
    const { rows } = await pool.query<AttemptRow>(
      "UPDATE upload_attempt SET status = 'rejected', reason_code = 'STORAGE_ERROR', blob_pathname = NULL WHERE id = $1 RETURNING *",
      [reserved.id],
    );
    await storage.remove([pathname]).catch(() => {});
    return finish(requestId, toAttempt(rows[0]), "STORAGE_ERROR");
  }
  return finish(requestId, reserved, null);
}
