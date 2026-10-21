import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

// 함수 인스턴스마다 풀 하나 (설계 2.5, 위험 O4).
// 배포에서는 Neon 풀링 연결 문자열(-pooler, PgBouncer 트랜잭션 모드)을 쓰므로 세션 단위 기능은 쓰지 않는다.
// attachDatabasePool은 Vercel이 함수를 멈추기 전에 쉬는 연결을 정리하게 한다. Vercel 밖에서는 아무 일도 하지 않는다.
const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (!globalForPool.pgPool) {
  attachDatabasePool(pool);
  globalForPool.pgPool = pool; // 개발 서버가 모듈을 다시 읽어도 풀을 새로 만들지 않게
}
