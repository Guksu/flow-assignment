import type { MetadataRoute } from "next";

// 공개 데모라 크롤러가 업로드 폼을 찾지 않게 한다 (위험 D7)
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
