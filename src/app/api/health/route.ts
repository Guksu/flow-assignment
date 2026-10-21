import { pool } from "@/server/db";

// 상태 확인 (설계 2.4, 위험 D10): DB 왕복까지 확인한다. dbMs는 첫 요청 지연(Neon 깨어남 + 첫 연결)을 재는 데 쓴다.
// Route Handler는 기본적으로 캐시되지 않지만, CDN·브라우저 캐시도 막으려고 no-store를 명시한다.
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: "ok", dbMs: Date.now() - started }, { headers: noStore });
  } catch (error) {
    // 접속 문자열이 섞일 수 있는 원본 오류는 응답에 싣지 않는다 (위험 U13·G6)
    console.error(
      JSON.stringify({ event: "health_db_error", message: error instanceof Error ? error.message : "unknown" }),
    );
    return Response.json({ ok: false, db: "error" }, { status: 503, headers: noStore });
  }
}
