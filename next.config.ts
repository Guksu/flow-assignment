import type { NextConfig } from "next";

// 보안 헤더 (설계 2.4, 위험 D9): 다른 사이트의 iframe에 넣지 못하게, 내용 형식 추측 금지, 리퍼러 최소화.
// cacheComponents는 켜지 않는다 — Route Handler는 기본적으로 캐시하지 않고, 그 동작만으로 설명이 되게 둔다(위험 D16).
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
