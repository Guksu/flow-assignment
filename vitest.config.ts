import path from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./src/test/local-db";

// 두 묶음: DB 없이 도는 테스트(unit)와 로컬 DB가 필요한 테스트(db).
// DB가 꺼져 있어도 unit 묶음은 돈다. db 묶음은 개발용 로컬 DB를 같이 쓰고, 로컬 주소가 아니면 시작하지 않는다.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/domain/**/*.test.ts", "src/test/**/*.test.ts", "scripts/**/*.test.mjs"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/server/**/*.test.ts", "src/app/**/*.test.ts"],
          globalSetup: ["src/test/db-global-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl(), DATABASE_URL_UNPOOLED: "" },
          fileParallelism: false, // 같은 DB를 쓰므로 파일을 하나씩
        },
      },
    ],
  },
});
