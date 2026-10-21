import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const SECRET = "0123456789abcdef0123";

describe("크론 인증 (CRON_SECRET Bearer)", () => {
  it("맞는 비밀값이면 허용", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["헤더 없음", null],
    ["틀린 값", "Bearer wrong-secret-value-000"],
    ["Bearer 없이 값만", SECRET],
    ["앞부분만 같음", `Bearer ${SECRET.slice(0, 10)}`],
  ])("%s → 거부", (_case, header) => {
    expect(isAuthorizedCron(header, SECRET)).toBe(false);
  });

  it.each([
    ["비밀값 설정 없음", undefined],
    ["비밀값이 16자 미만", "short"],
  ])("%s → 무엇이 와도 거부 (설정이 빠지면 열리지 않게)", (_case, secret) => {
    expect(isAuthorizedCron("Bearer ", secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret ?? ""}`, secret)).toBe(false);
  });
});
