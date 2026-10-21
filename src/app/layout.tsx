import type { Metadata } from "next";
// 한국어 UI 글꼴 한 벌(Pretendard, SIL OFL 1.1). 쓰는 글자만 내려받는 분할 파일
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "파일 확장자 차단",
  description: "확장자 차단 정책을 관리하고 업로드에서 강제하는 과제",
  // 공개 데모라 검색 노출을 막는다 (위험 D7)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
