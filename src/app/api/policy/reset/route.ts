// POST /api/policy/reset — 기본값으로 초기화 (고정 전부 해제, 커스텀 전부 삭제, 위험 D3·D14)
import { ok, policyBody, serverError } from "@/server/api";
import { resetPolicy } from "@/server/policy-repo";

export async function POST() {
  const requestId = crypto.randomUUID();
  try {
    const { policy } = await resetPolicy(requestId);
    return ok(policyBody(policy));
  } catch (error) {
    return serverError(requestId, error);
  }
}
