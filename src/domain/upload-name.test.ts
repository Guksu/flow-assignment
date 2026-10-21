import { describe, expect, it } from "vitest";
import { parseUploadName } from "./upload-name";

// 설계 4.1 표 + 테스트를 쓰며 찾은 화면 속임(안 보이는 글자, 위험 N21)과 이모지 거부. 사례 출처는 위험 목록 N1~N22

describe("parseUploadName — 확장자 읽기", () => {
  it.each([
    ["report.PDF", "pdf", null], // N1 대소문자
    ["보고서.HWP", "hwp", null],
    ["file.exe.txt", "txt", "exe.txt"], // N2 이중 확장자
    ["photo.jpg.exe", "exe", "jpg.exe"],
    ["naver.com.png", "png", "com.png"], // N2 고정 com에 걸리지 않음
    ["a.tar.gz", "gz", "tar.gz"], // N3 복합
    ["atar.gz", "gz", null], // N3 점 경계 — 문자열 끝부분 일치가 아님
    ["file..exe", "exe", null], // 마지막 두 단 중 하나가 비면 복합 아님
    [".env", "env", null], // N4 점으로 시작
    [".exe", "exe", null],
    [".tar.gz", "gz", "tar.gz"],
    ["Makefile", null, null], // N5 확장자 없음
    ["evil.exe.", "exe", null], // N6 끝 점·공백
    ["evil.exe ", "exe", null],
    ["evil.exe. . .", "exe", null],
    ["evil.exe\uFF0E", "exe", null], // N19 전각 마침표 — NFKC를 먼저
    ["evil.exe\u3000", "exe", null], // N19 전각 공백
    ["evil.exe\u00A0", "exe", null], // N19 줄바꿈 없는 공백
    ["\uFF45\uFF56\uFF49\uFF4C.\uFF45\uFF58\uFF45", "exe", null], // N7 전각 evil.exe
    ["evil\uFF0Eexe", "exe", null], // 가운데 전각 마침표도 점으로 본다(보수적)
    ["evil\u2024exe", "exe", null], // 한 점 리더(U+2024)도 NFKC로 점
    ["evil.vb\u017F", "vbs", null], // 긴 s(U+017F)는 NFKC로 s
    ["..\\evil.exe", "exe", null], // N11 경로
    ["C:\\fakepath\\a.exe", "exe", null],
    ["../../a.exe", "exe", null],
    ["\u00A9회사소개.pdf", "pdf", null], // ©는 글자 모양 기호라 허용
    ["제품\u2122.pdf", "pdf", null], // ™도 허용
  ])("%j → 단일 %j, 복합 %j", (raw, single, compound) => {
    expect(parseUploadName(raw)).toMatchObject({ ok: true, single, compound });
  });

  it("닮은 글자(러시아 \u{435})는 바꾸지 않는다 — 막지 않고 문서로만 남긴 한계", () => {
    expect(parseUploadName("evil.\u0435xe")).toMatchObject({ ok: true, single: "\u0435xe" });
  });

  it("화면용 이름은 경로를 뗀 원래 이름을 NFC로 (N9 macOS 한글 자모 분리)", () => {
    const nfd = "한글.txt".normalize("NFD");
    expect(parseUploadName(`..\\${nfd}`)).toMatchObject({ ok: true, displayName: "한글.txt" });
    expect(parseUploadName("Report.PDF")).toMatchObject({ ok: true, displayName: "Report.PDF" });
  });
});

describe("parseUploadName — 거부", () => {
  it.each([
    ["", "NAME_EMPTY"], // N14
    [".", "NAME_EMPTY"],
    ["..", "NAME_EMPTY"],
    ["...", "NAME_EMPTY"], // 끝 점을 지우면 빈 이름
    ["   ", "NAME_EMPTY"],
    ["uploads/", "NAME_EMPTY"], // 경로를 떼면 빈 이름
  ])("%j → %s", (raw, code) => {
    expect(parseUploadName(raw)).toEqual({ ok: false, code });
  });

  it.each([
    ["invoice\u202Efdp.exe", "RLO — 화면에 invoiceexe.pdf로 보임 (N8)"],
    ["evil.exe\u0000.jpg", "널 바이트 (N8)"],
    ["a\tb.txt", "탭"],
    ["evil.exe\u200E", "LRM — 처음 설계 목록에서 빠짐"],
    ["evil.exe\u200F", "RLM — 처음 설계 목록에서 빠짐"],
    ["evil.exe\u061C", "ALM — 처음 설계 목록에서 빠짐"],
    ["evil.ex\u00ADe", "soft hyphen — 화면엔 evil.exe"],
    ["evil.ex\u200Be", "zero width space — 화면엔 evil.exe"],
    ["evil.e\u2060xe", "word joiner"],
    ["evil.exe\uFEFF", "BOM"],
    ["evil.exe\u{E0041}", "태그 문자"],
    ["evil.exe\u2028", "줄 구분자"],
    ["evil.ex\u3164e", "한글 채움 문자(\u{3164})"],
    ["evil.ex\uFE00e", "변형 선택자"],
    ["a\u200Cb.txt", "ZWNJ — 이모지·특정 문자용이지만 안 보이는 글자라 거부"],
  ])("%j → NAME_CONTROL_CHAR (%s)", (raw) => {
    expect(parseUploadName(raw)).toEqual({ ok: false, code: "NAME_CONTROL_CHAR" });
  });

  it.each([
    ["\u{1F600}.txt", "\u{1F600}"],
    ["\u{1F469}\u200D\u{1F4BB}.txt", "\u{1F469}\u{200D}\u{1F4BB} — 안 보이는 ZWJ보다 이모지로 먼저 안내"],
    ["\u2764\uFE0F.txt", "\u{2764}\u{FE0F} — 이모지 모양 선택자"],
    ["\u{1F1F0}\u{1F1F7}.pdf", "\u{1F1F0}\u{1F1F7} — 국기"],
    ["1\uFE0F\u20E3.txt", "1\u{FE0F}\u{20E3} — 키캡"],
    ["\u{1F525}최종 기획안.pptx", "\u{1F525} — 정상 파일도 막히는 비용"],
    ["\u2705 확인완료.xlsx", "✅ — 정상 파일도 막히는 비용"],
  ])("%j → NAME_EMOJI (%s)", (raw) => {
    expect(parseUploadName(raw)).toEqual({ ok: false, code: "NAME_EMOJI" });
  });

  it("하트 경계: 글자 모양 \u{2764}(U+2764)는 통과, 이모지 모양 선택자가 붙은 \u{2764}\u{FE0F}(U+2764 U+FE0F)는 거부", () => {
    expect(parseUploadName("\u2764사랑.jpg")).toMatchObject({ ok: true, single: "jpg" });
    expect(parseUploadName("\u2764\uFE0F사랑.jpg")).toEqual({ ok: false, code: "NAME_EMOJI" });
  });

  it.each([
    "evil.exe::$DATA", // N12 NTFS 대체 데이터 스트림
    "a<b>.txt",
    'a"b.txt',
    "a|b.txt",
    "what?.txt",
    "a*.txt",
  ])("%j → NAME_FORBIDDEN_CHAR", (raw) => {
    expect(parseUploadName(raw)).toEqual({ ok: false, code: "NAME_FORBIDDEN_CHAR" });
  });

  it("NFC 기준 255자까지 허용하고 256자부터 거부 (N10 — 바이트가 아니라 글자 수)", () => {
    const ok = `${"가".repeat(251)}.txt`; // 255자, UTF-8로는 757바이트
    expect(parseUploadName(ok)).toMatchObject({ ok: true, single: "txt" });
    expect(parseUploadName(ok.normalize("NFD"))).toMatchObject({ ok: true, single: "txt" });
    expect(parseUploadName(`${"가".repeat(252)}.txt`)).toEqual({ ok: false, code: "NAME_TOO_LONG" });
  });
});
