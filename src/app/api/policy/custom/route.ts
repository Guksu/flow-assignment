// POST /api/policy/custom — 커스텀 확장자 추가. 화면 검사와 상관없이 서버가 같은 함수로 다시 검사한다 (위험 U1)
import { CUSTOM_EXTENSION_MESSAGES, POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { readJsonObject, startRequest } from "@/server/api";
import { addCustom } from "@/server/policy-repo";

export async function POST(request: Request) {
  const api = startRequest();
  const body = await readJsonObject(request);
  if (!body.ok) return api.bodyError(body.reason);
  if (typeof body.value.ext !== "string") return api.bodyError("INVALID");
  try {
    const result = await addCustom(body.value.ext, api.requestId);
    if (result.ok) return api.ok({ ext: result.ext, createdAt: result.createdAt, customCount: result.customCount }, 201);
    switch (result.code) {
      case "INVALID_EXTENSION":
        return api.fail(400, result.code, CUSTOM_EXTENSION_MESSAGES[result.reason], { reason: result.reason });
      case "FIXED_EXTENSION":
        return api.fail(409, result.code, CUSTOM_EXTENSION_MESSAGES.FIXED_EXTENSION);
      default:
        return api.fail(409, result.code, POLICY_ERROR_MESSAGES[result.code]);
    }
  } catch (error) {
    return api.serverError(error);
  }
}
