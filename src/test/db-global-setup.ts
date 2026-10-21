// DB 테스트 묶음을 시작하기 전에 로컬 DB에 마이그레이션을 적용한다(배포 빌드와 같은 실행기).
import { execFileSync } from "node:child_process";
import { testDatabaseUrl } from "./local-db";

export default function setup() {
  const url = testDatabaseUrl();
  try {
    execFileSync(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: "" },
      stdio: "pipe",
    });
  } catch {
    throw new Error("로컬 DB에 마이그레이션을 적용하지 못했습니다. `pnpm db:up`으로 DB를 켠 뒤 다시 실행해 주세요.");
  }
}
