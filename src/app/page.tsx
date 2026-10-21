import { PolicyPanel } from "./policy-panel";

export default function Home() {
  return (
    <main>
      <h1>파일 확장자 차단</h1>
      <PolicyPanel />
      <p className="muted">
        업로드 시험은 다음 단계에서 이 아래에 들어옵니다. 상태 확인: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
