import { PolicyPanel } from "./policy-panel";
import { UploadPanel } from "./upload-panel";

// 화면 하나: 정책 관리(왼쪽) | 업로드 시험(오른쪽). 좁은 화면은 위아래 한 열 (설계 7장)
export default function Home() {
  return (
    <main className="page">
      <header className="page-head">
        <h1>파일 확장자 차단</h1>
        <p>체크하거나 추가한 확장자는 업로드할 때 서버가 막아요. 업로드 시험에서 파일을 올려 바로 확인할 수 있어요.</p>
      </header>
      <div className="columns">
        <PolicyPanel />
        <UploadPanel />
      </div>
      <footer className="page-foot">
        <a href="https://github.com/Guksu/flow-assignment">소스 코드와 설계 문서 (GitHub)</a>
      </footer>
    </main>
  );
}
