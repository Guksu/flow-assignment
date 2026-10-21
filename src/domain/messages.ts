// 오류 코드 → 방문자에게 보여 줄 문구. 화면과 API가 같은 문구를 쓴다 (위험 X7).

import type { CustomExtensionError } from "./custom-extension";
import type { ExtensionSource } from "./policy";
import type { NameErrorCode } from "./upload-name";

export const NAME_ERROR_MESSAGES: Record<NameErrorCode, string> = {
  NAME_EMPTY: "파일 이름이 비어 있습니다.",
  NAME_CONTROL_CHAR: "파일 이름에 보이지 않는 문자가 있습니다. 이름을 바꿔 다시 올려 주세요.",
  NAME_EMOJI: "파일 이름에 이모지를 쓸 수 없습니다. 이모지를 빼고 이름을 바꿔 다시 올려 주세요.",
  NAME_FORBIDDEN_CHAR: '파일 이름에 쓸 수 없는 문자(< > : " | ? *)가 있습니다.',
  NAME_TOO_LONG: "파일 이름은 255자까지 쓸 수 있습니다.",
};

export const CUSTOM_EXTENSION_MESSAGES: Record<CustomExtensionError, string> = {
  EMPTY: "확장자를 입력해 주세요.",
  TOO_LONG: "확장자는 20자까지 입력할 수 있습니다.",
  WILDCARD: "별표(*) 없이 확장자만 입력해 주세요. 예: sh",
  INVALID_CHAR: "확장자는 영문과 숫자만 쓸 수 있습니다.",
  INVALID_FORMAT: "점은 확장자 사이에 하나만 쓸 수 있습니다. 예: tar.gz",
  TOO_MANY_SEGMENTS: "확장자는 두 단까지 입력할 수 있습니다. 예: tar.gz",
  FIXED_EXTENSION: "고정 확장자입니다. 위 고정 확장자 목록에서 체크해 주세요.",
};

// 정책 API 오류 (설계 8장). 커스텀 입력 오류는 위 CUSTOM_EXTENSION_MESSAGES를 그대로 쓴다
export const POLICY_ERROR_MESSAGES = {
  INVALID_BODY: "요청 형식이 올바르지 않습니다.",
  BODY_TOO_LARGE: "요청 본문이 너무 큽니다.",
  UNKNOWN_FIXED_EXTENSION: "없는 고정 확장자입니다.",
  DUPLICATE_EXTENSION: "이미 추가된 확장자입니다.",
  CUSTOM_LIMIT_REACHED: "커스텀 확장자는 200개까지 추가할 수 있습니다. 쓰지 않는 확장자를 지우거나 기본값으로 초기화해 주세요.",
  SERVER_ERROR: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요.",
} as const;

// 업로드 API 오류 (설계 8장). 이름 오류는 NAME_ERROR_MESSAGES, 차단은 blockedMessage를 쓴다
export const UPLOAD_ERROR_MESSAGES = {
  INVALID_REQUEST: "파일 하나를 골라 올려 주세요.",
  FILE_TOO_LARGE: "파일은 4MiB까지 올릴 수 있습니다.",
  DAILY_LIMIT_REACHED: "오늘 저장할 수 있는 업로드 50건을 모두 썼습니다. 내일 다시 시도해 주세요. 차단 확장자 시험은 계속할 수 있습니다.",
  STORAGE_ERROR: "파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

// 화면 오류 문구. 서버 오류(5xx)일 때만 요청 번호를 짧게 붙인다 — 서버 로그·이력의 번호와 같아 문의를 받으면 찾을 수 있다 (위험 O2).
// 중복·형식 오류처럼 방문자가 고칠 수 있는 오류에 번호가 붙으면 시스템 장애처럼 보여서 붙이지 않는다
export function errorText(message: string, status: number, requestId: string | null): string {
  return status >= 500 && requestId ? `${message} (오류 번호 ${requestId.slice(0, 8)})` : message;
}

export function blockedMessage(matched: string, source: ExtensionSource): string {
  return `업로드할 수 없는 확장자입니다: ${matched} (${source === "fixed" ? "고정" : "커스텀"} 확장자)`;
}
