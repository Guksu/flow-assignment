// DB 테스트는 개발용 로컬 DB를 같이 쓰고 데이터를 지운다(설계 문답 #35).
// 주소가 실수로 운영 DB(Neon)를 가리켜도 지우지 않게, 로컬 주소가 아니면 시작하지 않는다.

export const LOCAL_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/flow";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertLocalDatabase(url: string | undefined): string {
  if (!url) throw new Error("DB 테스트에 쓸 DB 주소가 없습니다.");
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`DB 테스트는 데이터를 지우므로 로컬 DB에서만 돌립니다. 지금 주소의 호스트: ${host}`);
  }
  return url;
}

// TEST_DATABASE_URL로 바꿀 수 있지만 로컬 주소만 허용한다. 셸의 DATABASE_URL은 일부러 보지 않는다.
export const testDatabaseUrl = () => assertLocalDatabase(process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL);
