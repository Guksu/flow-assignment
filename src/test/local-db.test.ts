import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "./local-db";

describe("DB 테스트가 운영 DB를 지우지 않게 막는 장치", () => {
  it.each([
    "postgres://postgres:postgres@localhost:5432/flow",
    "postgres://postgres:postgres@127.0.0.1:5432/flow",
    "postgres://postgres:postgres@[::1]:5432/flow",
  ])("로컬 주소는 허용: %s", (url) => {
    expect(assertLocalDatabase(url)).toBe(url);
  });

  it.each([
    "postgres://user:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    "postgres://user:pw@db.example.com:5432/flow",
    "postgres://user:pw@localhost.example.com/flow", // 이름에 localhost가 들어 있어도 로컬이 아님
  ])("로컬이 아니면 거부: %s", (url) => {
    expect(() => assertLocalDatabase(url)).toThrow("로컬 DB에서만");
  });

  it("주소가 없으면 거부", () => {
    expect(() => assertLocalDatabase(undefined)).toThrow();
  });
});
