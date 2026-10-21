// GET /api/policy — 정책 전체 (설계 8장)
import { policyBody, startRequest } from "@/server/api";
import { readPolicy } from "@/server/policy-repo";

export async function GET() {
  const api = startRequest();
  try {
    return api.ok(policyBody(await readPolicy()));
  } catch (error) {
    return api.serverError(error);
  }
}
