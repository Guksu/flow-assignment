// PUT /api/policy/fixed/{ext} — 고정 확장자 체크·해제. 본문은 원하는 상태 { blocked } (위험 P10)
import { POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { fail, invalidBody, ok, readJsonObject, serverError } from "@/server/api";
import { setFixedBlocked } from "@/server/policy-repo";

export async function PUT(request: Request, { params }: RouteContext<"/api/policy/fixed/[ext]">) {
  const requestId = crypto.randomUUID();
  const { ext } = await params;
  const body = await readJsonObject(request);
  if (!body || typeof body.blocked !== "boolean") return invalidBody();
  try {
    const result = await setFixedBlocked(ext, body.blocked, requestId);
    if (!result.ok) return fail(404, result.code, POLICY_ERROR_MESSAGES.UNKNOWN_FIXED_EXTENSION);
    return ok({ ext: result.ext, blocked: result.blocked, changed: result.changed });
  } catch (error) {
    return serverError(requestId, error);
  }
}
