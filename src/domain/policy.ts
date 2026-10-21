// 업로드를 막을지 판단 (설계 4.2). 차단 목록 = 고정 중 체크된 것 + 커스텀 전부.

export type ExtensionSource = "fixed" | "custom";

export type BlockPolicy = { fixedBlocked: readonly string[]; custom: readonly string[] };

export type UploadDecision =
  | { blocked: false }
  | { blocked: true; matched: string; source: ExtensionSource };

export function decideUpload(
  name: { single: string | null; compound: string | null },
  policy: BlockPolicy,
): UploadDecision {
  // 복합을 먼저 본다 — 둘 다 걸리면 더 구체적인 규칙(tar.gz)을 사유로 보여 준다
  for (const ext of [name.compound, name.single]) {
    if (ext === null) continue;
    if (policy.fixedBlocked.includes(ext)) return { blocked: true, matched: ext, source: "fixed" };
    if (policy.custom.includes(ext)) return { blocked: true, matched: ext, source: "custom" };
  }
  return { blocked: false };
}
