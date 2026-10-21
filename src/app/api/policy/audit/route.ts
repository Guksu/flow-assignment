// GET /api/policy/audit?limit=20 — 최근 변경 이력. 한 번에 읽는 양을 1~50건으로 묶는다
import { ok, serverError } from "@/server/api";
import { listAudit } from "@/server/policy-repo";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const asked = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), 50) : 20;
  try {
    return ok({ items: await listAudit(limit) });
  } catch (error) {
    return serverError(requestId, error);
  }
}
