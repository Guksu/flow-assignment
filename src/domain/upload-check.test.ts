import { describe, expect, it } from "vitest";
import { checkUpload } from "./upload-check";
import { MAX_FILE_BYTES } from "./upload-name";

// 업로드 판정: 이름→정책 묶음과 크기 묶음을 따로 판정하고, 사유는 이름·정책을 우선한다 (설계 6장, 문답 #39)
const policy = { fixedBlocked: ["exe"], custom: ["tar.gz"] };
const BIG = MAX_FILE_BYTES + 1;

describe("checkUpload", () => {
  it("모두 통과하면 해석한 이름을 돌려준다", () => {
    expect(checkUpload("report.pdf", 10, policy)).toMatchObject({ ok: true, name: { displayName: "report.pdf", single: "pdf" } });
  });

  it.each([
    ["Setup.EXE", 10],
    ["Setup.EXE", BIG], // 크기도 넘지만 차단이 먼저 — 큰 실행 파일도 시도 기록에 "차단"으로 남는다
  ])("%j(%i바이트) → 차단", (name, size) => {
    expect(checkUpload(name, size, policy)).toMatchObject({ ok: false, code: "EXTENSION_BLOCKED", matched: "exe", source: "fixed" });
  });

  it("복합 확장자 차단도 크기보다 먼저", () => {
    expect(checkUpload("backup.tar.gz", BIG, policy)).toMatchObject({ ok: false, code: "EXTENSION_BLOCKED", matched: "tar.gz" });
  });

  it("이름 오류는 정책·크기보다 먼저 — 확장자를 믿을 수 없다", () => {
    expect(checkUpload("evil.ex\u{200B}e", BIG, policy)).toEqual({ ok: false, code: "NAME_CONTROL_CHAR" });
  });

  it("이름·정책을 통과했을 때만 크기 사유", () => {
    expect(checkUpload("big.pdf", BIG, policy)).toMatchObject({ ok: false, code: "FILE_TOO_LARGE", name: { single: "pdf" } });
  });

  it("4MiB 정확히는 허용", () => {
    expect(checkUpload("edge.pdf", MAX_FILE_BYTES, policy)).toMatchObject({ ok: true });
  });
});
