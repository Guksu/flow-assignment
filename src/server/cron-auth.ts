// 크론 인증: Vercel Cron은 CRON_SECRET이 있으면 Authorization: Bearer <값>을 붙여 부른다 (설계 8장)
import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  // 비밀값 설정이 빠지거나 짧으면 무엇이 와도 거부한다 — 설정 실수로 열리지 않게
  if (!secret || secret.length < MIN_SECRET_LENGTH || !header) return false;
  // 같은 길이의 해시로 바꿔 비교한다. 비교 시간이 앞부분이 얼마나 맞는지에 따라 달라지지 않게
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
