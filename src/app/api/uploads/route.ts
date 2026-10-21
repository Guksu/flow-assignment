// POST /api/uploads — 파일 하나를 받아 서버가 정책으로 판정하고 허용되면 비공개 저장소에 저장한다 (설계 6·8장)
import { blockedMessage, NAME_ERROR_MESSAGES, UPLOAD_ERROR_MESSAGES } from "@/domain/messages";
import { startRequest } from "@/server/api";
import { getStorage } from "@/server/storage";
import { handleUpload, MAX_FILE_BYTES, recordOversized, type UploadResult } from "@/server/uploads";

// multipart 머리말·경계 문자열 여유. 요청이 이보다 크면 파일이 4MiB를 넘을 수밖에 없다
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;

type Api = ReturnType<typeof startRequest>;

function respond(api: Api, { code, attempt }: UploadResult) {
  if (code === null) return api.ok({ attempt }, 201);
  const extra = { attempt };
  switch (code) {
    case "FILE_TOO_LARGE":
      return api.fail(413, code, UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE, undefined, extra);
    case "EXTENSION_BLOCKED": {
      const matched = attempt.matchedRule ?? "";
      const source = attempt.matchedSource ?? "custom";
      return api.fail(422, code, blockedMessage(matched, source), { matched, source }, extra);
    }
    case "DAILY_LIMIT_REACHED":
      return api.fail(429, code, UPLOAD_ERROR_MESSAGES.DAILY_LIMIT_REACHED, undefined, extra);
    case "STORAGE_ERROR":
      return api.fail(503, code, UPLOAD_ERROR_MESSAGES.STORAGE_ERROR, undefined, extra);
    default:
      return api.fail(400, code, NAME_ERROR_MESSAGES[code], undefined, extra);
  }
}

export async function POST(request: Request) {
  const api = startRequest();
  try {
    // 요청 크기가 상한을 넘으면 본문을 읽지 않고 거부한다. 시도는 이름 없이 기록한다
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
      return respond(api, await recordOversized(declared, api.requestId));
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return api.fail(400, "INVALID_REQUEST", UPLOAD_ERROR_MESSAGES.INVALID_REQUEST);
    }
    // 파일 필드가 정확히 하나가 아니면 시도로 보지 않는다 (설계 5.4)
    const files = form.getAll("file");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File)) {
      return api.fail(400, "INVALID_REQUEST", UPLOAD_ERROR_MESSAGES.INVALID_REQUEST);
    }
    const input = { name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) };
    return respond(api, await handleUpload(input, getStorage(), api.requestId));
  } catch (error) {
    return api.serverError(error);
  }
}
