// DELETE /api/policy/custom/{ext} — 커스텀 확장자 삭제. 없어도 204 (멱등, 위험 P11)
import { CUSTOM_EXTENSION_MESSAGES } from "@/domain/messages";
import { startRequest } from "@/server/api";
import { removeCustom } from "@/server/policy-repo";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/policy/custom/[ext]">) {
  const api = startRequest();
  const { ext } = await params;
  try {
    const result = await removeCustom(ext, api.requestId);
    if (!result.ok) return api.fail(400, result.code, CUSTOM_EXTENSION_MESSAGES[result.reason], { reason: result.reason });
    return api.noContent();
  } catch (error) {
    return api.serverError(error);
  }
}
