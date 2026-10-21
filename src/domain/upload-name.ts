// 업로드 파일 이름 → 판정용 확장자 (설계 4.1). 브라우저와 서버가 같이 쓰므로 Node 모듈을 쓰지 않는다.

export type NameErrorCode =
  | "NAME_EMPTY"
  | "NAME_CONTROL_CHAR"
  | "NAME_EMOJI"
  | "NAME_FORBIDDEN_CHAR"
  | "NAME_TOO_LONG";

export type ParsedUploadName =
  | { ok: true; displayName: string; single: string | null; compound: string | null }
  | { ok: false; code: NameErrorCode };

export const MAX_NAME_LENGTH = 255;

// 이모지: 기본이 이모지 모양인 글자, 이모지 모양 선택자(U+FE0F), 키캡(U+20E3).
// ©·™·®처럼 기본이 글자 모양인 기호는 허용한다
const EMOJI = /[\p{Emoji_Presentation}️⃣]/u;
// 안 보이는 글자: 제어·서식 문자, 줄·문단 구분자, 유니코드가 "보이지 않음"으로 지정한 글자
// (Default_Ignorable_Code_Point — soft hyphen, zero width 문자, 한글 채움 문자, 변형 선택자, 태그 문자 등)
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
// Windows가 파일 이름에 금지하는 문자. 경로 구분자(/ \)는 앞에서 떼어 낸다
const FORBIDDEN = /[<>:"|?*]/;

export function parseUploadName(raw: string): ParsedUploadName {
  const base = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
  if (base === "") return { ok: false, code: "NAME_EMPTY" };
  // 이모지를 먼저 본다 — 👩‍💻에는 안 보이는 ZWJ가 들어 있지만 안내는 이모지가 맞다
  if (EMOJI.test(base)) return { ok: false, code: "NAME_EMOJI" };
  if (INVISIBLE.test(base)) return { ok: false, code: "NAME_CONTROL_CHAR" };
  if (FORBIDDEN.test(base)) return { ok: false, code: "NAME_FORBIDDEN_CHAR" };

  const displayName = base.normalize("NFC");
  if ([...displayName].length > MAX_NAME_LENGTH) return { ok: false, code: "NAME_TOO_LONG" };

  // 판정용 이름: NFKC를 먼저 해야 전각 마침표·공백이 끝 점·공백 제거에 걸린다 (위험 N19)
  const normalized = base.normalize("NFKC").toLowerCase().replace(/[ .]+$/, "");
  if (normalized === "") return { ok: false, code: "NAME_EMPTY" };

  const parts = normalized.split(".");
  if (parts.length < 2) return { ok: true, displayName, single: null, compound: null };
  const single = parts[parts.length - 1];
  const before = parts[parts.length - 2];
  // 복합은 점이 두 개 이상이고 마지막 두 단이 모두 있을 때만 (a.tar.gz → tar.gz, .env·file..exe → 없음)
  const compound = parts.length >= 3 && before !== "" ? `${before}.${single}` : null;
  return { ok: true, displayName, single, compound };
}
