// GET /api/cron/cleanup — Vercel Cron 하루 1회. 만료된 업로드 시도·파일, 30일 지난 이력을 지운다 (설계 6장)
import { startRequest } from "@/server/api";
import { cleanupExpired } from "@/server/cleanup";
import { isAuthorizedCron } from "@/server/cron-auth";
import { getStorage } from "@/server/storage";

export async function GET(request: Request) {
  const api = startRequest();
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return api.fail(401, "UNAUTHORIZED", "인증이 필요합니다.");
  }
  try {
    const result = await cleanupExpired(getStorage());
    console.info(JSON.stringify({ event: "cleanup", requestId: api.requestId, ...result }));
    return api.ok(result);
  } catch (error) {
    return api.serverError(error);
  }
}
