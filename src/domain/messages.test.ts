import { describe, expect, it } from "vitest";
import { blockedMessage, CUSTOM_EXTENSION_MESSAGES, NAME_ERROR_MESSAGES } from "./messages";

// 위험 X7 — 화면과 API가 같은 코드에서 같은 문구를 만든다
describe("오류 안내 문구", () => {
  it.each(Object.entries({ ...NAME_ERROR_MESSAGES, ...CUSTOM_EXTENSION_MESSAGES }))(
    "%s에 문구가 있다",
    (_code, message) => {
      expect(message.trim()).not.toBe("");
    },
  );

  it("차단 안내에 걸린 확장자와 출처를 넣는다", () => {
    expect(blockedMessage("tar.gz", "custom")).toContain("tar.gz");
    expect(blockedMessage("tar.gz", "custom")).toContain("커스텀");
    expect(blockedMessage("exe", "fixed")).toContain("고정");
  });
});
