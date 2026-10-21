import { PolicyPanel } from "./policy-panel";
import { UploadPanel } from "./upload-panel";

export default function Home() {
  return (
    <main>
      <h1>파일 확장자 차단</h1>
      <PolicyPanel />
      <UploadPanel />
      <p className="muted">
        상태 확인: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
