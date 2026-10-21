// API 응답 도우미 (설계 8장). 모든 응답에 캐시 금지, 오류는 { error: { code, message, details } } 한 모양.
import { MAX_EXTENSION_LENGTH } from "@/domain/custom-extension";
import { POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { CUSTOM_LIMIT, type PolicySnapshot } from "./policy-repo";

const NO_STORE = { "Cache-Control": "no-store" };

export const ok = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export const noContent = () => new Response(null, { status: 204, headers: NO_STORE });

export const fail = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  Response.json({ error: { code, message, ...(details && { details }) } }, { status, headers: NO_STORE });

// 정책 API의 본문은 짧은 JSON 객체뿐이라 1KB를 넘으면 읽지 않는다
const MAX_BODY_BYTES = 1024;

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const invalidBody = () => fail(400, "INVALID_BODY", POLICY_ERROR_MESSAGES.INVALID_BODY);

// 자세한 원인은 서버 로그에만, 응답은 정해 둔 문구만 (위험 U13). 오류 객체 전체에는 접속 정보가 섞일 수 있어 메시지만 남긴다
// 연결 거부(AggregateError)처럼 message가 비는 오류도 있어 code·이름으로 채운다
export function serverError(requestId: string, error: unknown) {
  const cause = error instanceof Error ? error.message || (error as { code?: string }).code || error.name : "unknown error";
  console.error(`[${requestId}]`, cause);
  return fail(503, "SERVER_ERROR", POLICY_ERROR_MESSAGES.SERVER_ERROR);
}

// 정책 전체 응답 (GET /api/policy, POST /api/policy/reset). 화면은 한도·길이를 이 값으로 쓴다
export const policyBody = (policy: PolicySnapshot) => ({
  ...policy,
  customCount: policy.custom.length,
  customLimit: CUSTOM_LIMIT,
  maxLength: MAX_EXTENSION_LENGTH,
});
