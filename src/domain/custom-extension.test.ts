import { describe, expect, it } from "vitest";
import { normalizeCustomExtension } from "./custom-extension";

// 설계 4.3 표. 고정 목록은 과제 원문의 7개
const FIXED = ["bat", "cmd", "com", "cpl", "exe", "scr", "js"];

describe("normalizeCustomExtension — 받아들이는 입력", () => {
  it.each([
    ["sh", "sh"],
    [" .SH ", "sh"], // 앞뒤 공백, 앞쪽 점, 대문자
    ["..sh", "sh"],
    ["\u{FF0E}sh", "sh"], // 전각 마침표로 시작 — NFKC를 먼저 해야 앞쪽 점 제거에 걸림 (AI 오류 E12)
    ["TAR.GZ", "tar.gz"],
    ["\u{FF0E}\u{FF0E}tar.gz", "tar.gz"],
    ["exe.txt", "exe.txt"], // 고정 확장자와 같지 않은 복합은 허용
    ["㎉", "kcal"], // ㎉ — NFKC로 글자가 늘어남
    ["a".repeat(20), "a".repeat(20)],
  ])("%j → %j", (raw, ext) => {
    expect(normalizeCustomExtension(raw, FIXED)).toEqual({ ok: true, ext });
  });
});

describe("normalizeCustomExtension — 거부", () => {
  it.each([
    ["exe", "FIXED_EXTENSION"], // 문답 #3 — 고정 쪽으로 안내
    ["\u{FF45}\u{FF58}\u{FF45}", "FIXED_EXTENSION"], // 전각 exe
    ["JS", "FIXED_EXTENSION"],
    ["pkg.tar.zst", "TOO_MANY_SEGMENTS"], // 복합은 두 단까지
    ["tar..gz", "INVALID_FORMAT"],
    ["tar.", "INVALID_FORMAT"],
    ["*.exe", "WILDCARD"],
    ["*", "WILDCARD"],
    ["한글", "INVALID_CHAR"],
    ["s h", "INVALID_CHAR"],
    ["sh!", "INVALID_CHAR"],
    ["ex\u{200B}e", "INVALID_CHAR"], // 안 보이는 글자
    ["\u{1F600}", "INVALID_CHAR"], // 이모지
    ["", "EMPTY"],
    ["...", "EMPTY"],
    ["   ", "EMPTY"],
    ["a".repeat(21), "TOO_LONG"], // 원문 21자
    ["㎉".repeat(6), "TOO_LONG"], // 원문 6자지만 NFKC 뒤 24자
  ])("%j → %s", (raw, reason) => {
    expect(normalizeCustomExtension(raw, FIXED)).toEqual({ ok: false, reason });
  });
});
