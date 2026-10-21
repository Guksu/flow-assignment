// API 응답 도우미 (설계 8장). 모든 응답에 캐시 금지, 오류는 { error: { code, message, requestId, details } } 한 모양.
// 요청마다 번호 하나를 정해 응답 헤더 X-Request-Id·오류 본문·서버 로그·이력 행에 같은 번호를 쓴다 (위험 O2).
import { MAX_EXTENSION_LENGTH } from "@/domain/custom-extension";
import { POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { CUSTOM_LIMIT, type PolicySnapshot } from "./policy-repo";

// 정책 API의 본문은 짧은 JSON 객체뿐이다
const MAX_BODY_BYTES = 1024;

export type JsonBody = { ok: true; value: Record<string, unknown> } | { ok: false; reason: "TOO_LARGE" | "INVALID" };

export async function readJsonObject(request: Request): Promise<JsonBody> {
  // Content-Length가 1KB를 넘으면 본문을 읽지 않고 거부한다
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, reason: "TOO_LARGE" };
  // 헤더가 없거나 실제와 다를 수 있어 읽은 뒤에도 크기를 다시 잰다. 이 경우는 플랫폼 상한(4.5MB)까지 읽는다
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, reason: "TOO_LARGE" };
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, reason: "INVALID" };
  } catch {
    return { ok: false, reason: "INVALID" };
  }
}

export function startRequest() {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };

  const fail = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
    Response.json({ error: { code, message, requestId, ...(details && { details }) } }, { status, headers });

  return {
    requestId,
    ok: (body: unknown, status = 200) => Response.json(body, { status, headers }),
    noContent: () => new Response(null, { status: 204, headers }),
    fail,
    bodyError: (reason: "TOO_LARGE" | "INVALID") =>
      reason === "TOO_LARGE"
        ? fail(413, "BODY_TOO_LARGE", POLICY_ERROR_MESSAGES.BODY_TOO_LARGE)
        : fail(400, "INVALID_BODY", POLICY_ERROR_MESSAGES.INVALID_BODY),
    // 자세한 원인은 서버 로그에만, 응답은 정해 둔 문구만 (위험 U13).
    // 오류 객체 전체에는 접속 정보가 섞일 수 있어 메시지만 남기고, 연결 거부처럼 message가 비면 code·이름으로 채운다
    serverError: (error: unknown) => {
      const cause = error instanceof Error ? error.message || (error as { code?: string }).code || error.name : "unknown error";
      console.error(JSON.stringify({ event: "server_error", requestId, cause }));
      return fail(503, "SERVER_ERROR", POLICY_ERROR_MESSAGES.SERVER_ERROR);
    },
  };
}

// 정책 전체 응답 (GET /api/policy, POST /api/policy/reset). 화면은 한도·길이를 이 값으로 쓴다
export const policyBody = (policy: PolicySnapshot) => ({
  ...policy,
  customCount: policy.custom.length,
  customLimit: CUSTOM_LIMIT,
  maxLength: MAX_EXTENSION_LENGTH,
});
