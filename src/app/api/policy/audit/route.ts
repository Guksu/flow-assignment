// GET /api/policy/audit?limit=20 — 최근 변경 이력. 한 번에 읽는 양을 1~50건으로 묶는다
import { startRequest } from "@/server/api";
import { listAudit } from "@/server/policy-repo";

export async function GET(request: Request) {
  const api = startRequest();
  const asked = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), 50) : 20;
  try {
    return api.ok({ items: await listAudit(limit) });
  } catch (error) {
    return api.serverError(error);
  }
}
