// 커스텀 확장자 입력 검사 (설계 4.3). 결과 형식은 DB CHECK `^[a-z0-9]+(\.[a-z0-9]+)?$`와 같다.

export type CustomExtensionError =
  | "EMPTY"
  | "TOO_LONG"
  | "WILDCARD"
  | "INVALID_CHAR"
  | "INVALID_FORMAT"
  | "TOO_MANY_SEGMENTS"
  | "FIXED_EXTENSION";

export type NormalizedCustomExtension =
  | { ok: true; ext: string }
  | { ok: false; reason: CustomExtensionError };

export const MAX_EXTENSION_LENGTH = 20;

const fail = (reason: CustomExtensionError): NormalizedCustomExtension => ({ ok: false, reason });

export function normalizeCustomExtension(
  raw: string,
  fixedExtensions: readonly string[],
): NormalizedCustomExtension {
  if ([...raw].length > MAX_EXTENSION_LENGTH) return fail("TOO_LONG");
  // NFKC를 먼저 해야 전각 마침표(．sh)가 앞쪽 점 제거에 걸린다 (AI 오류 E12)
  const ext = raw.normalize("NFKC").trim().toLowerCase().replace(/^\.+/, "");
  if (ext === "") return fail("EMPTY");
  if (ext.includes("*")) return fail("WILDCARD");
  if (/[^a-z0-9.]/.test(ext)) return fail("INVALID_CHAR");

  const parts = ext.split(".");
  if (parts.includes("")) return fail("INVALID_FORMAT");
  if (parts.length > 2) return fail("TOO_MANY_SEGMENTS");
  // ㎉ → kcal처럼 NFKC가 글자를 늘릴 수 있어 결과 길이도 본다
  if (ext.length > MAX_EXTENSION_LENGTH) return fail("TOO_LONG");
  // 고정 확장자는 체크 여부와 상관없이 커스텀으로 받지 않는다 (문답 #3)
  if (fixedExtensions.includes(ext)) return fail("FIXED_EXTENSION");
  return { ok: true, ext };
}
