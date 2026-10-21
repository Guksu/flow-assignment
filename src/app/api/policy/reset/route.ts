// POST /api/policy/reset — 기본값으로 초기화 (고정 전부 해제, 커스텀 전부 삭제, 위험 D3·D14)
import { policyBody, startRequest } from "@/server/api";
import { resetPolicy } from "@/server/policy-repo";

export async function POST() {
  const api = startRequest();
  try {
    const { policy } = await resetPolicy(api.requestId);
    return api.ok(policyBody(policy));
  } catch (error) {
    return api.serverError(error);
  }
}
