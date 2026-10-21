// PUT /api/policy/fixed/{ext} — 고정 확장자 체크·해제. 본문은 원하는 상태 { blocked } (위험 P10)
import { POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { readJsonObject, startRequest } from "@/server/api";
import { setFixedBlocked } from "@/server/policy-repo";

export async function PUT(request: Request, { params }: RouteContext<"/api/policy/fixed/[ext]">) {
  const api = startRequest();
  const { ext } = await params;
  const body = await readJsonObject(request);
  if (!body.ok) return api.bodyError(body.reason);
  if (typeof body.value.blocked !== "boolean") return api.bodyError("INVALID");
  try {
    const result = await setFixedBlocked(ext, body.value.blocked, api.requestId);
    if (!result.ok) return api.fail(404, result.code, POLICY_ERROR_MESSAGES.UNKNOWN_FIXED_EXTENSION);
    return api.ok({ ext: result.ext, blocked: result.blocked, changed: result.changed });
  } catch (error) {
    return api.serverError(error);
  }
}
