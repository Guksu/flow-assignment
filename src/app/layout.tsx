import type { Metadata } from "next";
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
