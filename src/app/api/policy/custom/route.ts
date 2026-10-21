// POST /api/policy/custom — 커스텀 확장자 추가. 화면 검사와 상관없이 서버가 같은 함수로 다시 검사한다 (위험 U1)
import { CUSTOM_EXTENSION_MESSAGES, POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { fail, invalidBody, ok, readJsonObject, serverError } from "@/server/api";
import { addCustom } from "@/server/policy-repo";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = await readJsonObject(request);
  if (!body || typeof body.ext !== "string") return invalidBody();
  try {
    const result = await addCustom(body.ext, requestId);
    if (result.ok) return ok({ ext: result.ext, createdAt: result.createdAt, customCount: result.customCount }, 201);
    switch (result.code) {
      case "INVALID_EXTENSION":
        return fail(400, result.code, CUSTOM_EXTENSION_MESSAGES[result.reason], { reason: result.reason });
      case "FIXED_EXTENSION":
        return fail(409, result.code, CUSTOM_EXTENSION_MESSAGES.FIXED_EXTENSION);
      default:
        return fail(409, result.code, POLICY_ERROR_MESSAGES[result.code]);
    }
  } catch (error) {
    return serverError(requestId, error);
  }
}
