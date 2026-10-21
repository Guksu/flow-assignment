import { describe, expect, it } from "vitest";
import {
  blockedMessage,
  CUSTOM_EXTENSION_MESSAGES,
  errorText,
  NAME_ERROR_MESSAGES,
  POLICY_ERROR_MESSAGES,
} from "./messages";

// 위험 X7 — 화면과 API가 같은 코드에서 같은 문구를 만든다
describe("오류 안내 문구", () => {
  it.each(Object.entries({ ...NAME_ERROR_MESSAGES, ...CUSTOM_EXTENSION_MESSAGES, ...POLICY_ERROR_MESSAGES }))(
    "%s에 문구가 있다",
    (_code, message) => {
      expect(message.trim()).not.toBe("");
    },
  );

  it("이모지 거부 문구는 방문자가 할 일을 알려 준다", () => {
    expect(NAME_ERROR_MESSAGES.NAME_EMOJI).toContain("이모지를 빼고 이름을 바꿔 다시 올려 주세요");
  });

  it("차단 안내에 걸린 확장자와 출처를 넣는다", () => {
    expect(blockedMessage("tar.gz", "custom")).toContain("tar.gz");
    expect(blockedMessage("tar.gz", "custom")).toContain("커스텀");
    expect(blockedMessage("exe", "fixed")).toContain("고정");
  });
});

describe("화면 오류 문구의 오류 번호", () => {
  const id = "f7d5c5e8-2f4f-4d89-a041-9ee1bef59017";

  it("서버 오류(5xx)일 때만 요청 번호를 짧게 붙인다", () => {
    expect(errorText(POLICY_ERROR_MESSAGES.SERVER_ERROR, 503, id)).toBe(
      `${POLICY_ERROR_MESSAGES.SERVER_ERROR} (오류 번호 f7d5c5e8)`,
    );
  });

  it.each([400, 404, 409, 413])("방문자가 고칠 수 있는 오류(%i)에는 붙이지 않는다", (status) => {
    expect(errorText(POLICY_ERROR_MESSAGES.DUPLICATE_EXTENSION, status, id)).toBe(POLICY_ERROR_MESSAGES.DUPLICATE_EXTENSION);
  });

  it("번호가 없으면 문구만", () => {
    expect(errorText(POLICY_ERROR_MESSAGES.SERVER_ERROR, 503, null)).toBe(POLICY_ERROR_MESSAGES.SERVER_ERROR);
  });
});
