// DELETE /api/policy/custom/{ext} — 커스텀 확장자 삭제. 없어도 204 (멱등, 위험 P11)
import { CUSTOM_EXTENSION_MESSAGES } from "@/domain/messages";
import { fail, noContent, serverError } from "@/server/api";
import { removeCustom } from "@/server/policy-repo";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/policy/custom/[ext]">) {
  const requestId = crypto.randomUUID();
  const { ext } = await params;
  try {
    const result = await removeCustom(ext, requestId);
    if (!result.ok) return fail(400, result.code, CUSTOM_EXTENSION_MESSAGES[result.reason], { reason: result.reason });
    return noContent();
  } catch (error) {
    return serverError(requestId, error);
  }
}
