// GET /api/policy — 정책 전체 (설계 8장)
import { ok, policyBody, serverError } from "@/server/api";
import { readPolicy } from "@/server/policy-repo";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    return ok(policyBody(await readPolicy()));
  } catch (error) {
    return serverError(requestId, error);
  }
}
