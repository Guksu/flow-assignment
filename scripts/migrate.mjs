// 마이그레이션 실행기 (설계 2.5, 5.5): migrations/*.sql 중 아직 적용하지 않은 것을 이름 순으로, 한 트랜잭션에서 적용한다.
// 배포 빌드(vercel-build)와 로컬에서 같은 스크립트를 쓴다. 풀러를 거치지 않는 직접 연결(DATABASE_URL_UNPOOLED)을 먼저 쓴다.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pendingMigrations } from "./migrate-lib.mjs";

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("migrate: DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(import.meta.dirname, "..", "migrations");
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql"));
const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");
  // 배포 두 개가 동시에 빌드돼도 한쪽만 적용하게 잠근다(트랜잭션 단위라 커밋·롤백 때 풀린다)
  await client.query("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const pending = pendingMigrations(
    files,
    rows.map((row) => row.version),
  );
  for (const file of pending) {
    await client.query(await readFile(path.join(dir, file), "utf8"));
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    console.log(`migrate: applied ${file}`);
  }
  await client.query("COMMIT");
  console.log(pending.length > 0 ? `migrate: ${pending.length} applied` : "migrate: up to date");
} catch (error) {
  await client.query("ROLLBACK");
  // 원본 오류 객체에는 접속 정보가 섞일 수 있어 메시지만 남긴다 (위험 G6)
  console.error(`migrate: failed — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
