import { describe, expect, it } from "vitest";
import { decideUpload } from "./policy";
import { parseUploadName } from "./upload-name";

// 설계 4.2. 차단 목록 = 고정 중 체크된 것 + 커스텀 전부
const policy = { fixedBlocked: ["exe", "bat"], custom: ["sh", "tar.gz", "exe.txt"] };

describe("decideUpload", () => {
  it.each([
    [{ single: "exe", compound: null }, { blocked: true, matched: "exe", source: "fixed" }],
    [{ single: "exe", compound: "jpg.exe" }, { blocked: true, matched: "exe", source: "fixed" }],
    [{ single: "sh", compound: null }, { blocked: true, matched: "sh", source: "custom" }],
    [{ single: "gz", compound: "tar.gz" }, { blocked: true, matched: "tar.gz", source: "custom" }],
    [{ single: "txt", compound: "exe.txt" }, { blocked: true, matched: "exe.txt", source: "custom" }],
    [{ single: "cmd", compound: null }, { blocked: false }], // 고정이지만 체크 안 됨
    [{ single: "gz", compound: null }, { blocked: false }], // atar.gz
    [{ single: "png", compound: "com.png" }, { blocked: false }],
    [{ single: null, compound: null }, { blocked: false }], // 확장자 없음
  ])("%j → %j", (name, decision) => {
    expect(decideUpload(name, policy)).toEqual(decision);
  });

  it("복합과 단일이 둘 다 걸리면 더 구체적인 복합을 사유로", () => {
    const both = { fixedBlocked: [], custom: ["gz", "tar.gz"] };
    expect(decideUpload({ single: "gz", compound: "tar.gz" }, both)).toEqual({
      blocked: true,
      matched: "tar.gz",
      source: "custom",
    });
  });
});

describe("파일 이름부터 판정까지", () => {
  it.each([
    ["Setup.EXE", "exe"],
    ["evil.exe\u{FF0E}", "exe"],
    ["backup.TAR.GZ", "tar.gz"],
    ["run.sh ", "sh"],
  ])("%j는 막힌다 (%s)", (raw, matched) => {
    const name = parseUploadName(raw);
    if (!name.ok) throw new Error(`해석 실패: ${name.code}`);
    expect(decideUpload(name, policy)).toMatchObject({ blocked: true, matched });
  });

  it.each(["atar.gz", "report.pdf", "naver.com.png", "Makefile"])("%j는 통과한다", (raw) => {
    const name = parseUploadName(raw);
    if (!name.ok) throw new Error(`해석 실패: ${name.code}`);
    expect(decideUpload(name, policy)).toEqual({ blocked: false });
  });
});
