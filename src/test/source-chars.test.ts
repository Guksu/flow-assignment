// 소스와 문서에 보이지 않는 글자를 그대로 넣지 않는다 (AI 오류 E18).
// 보이지 않는 글자나 방향 제어 문자는 리뷰에서 보이지 않은 채 코드의 뜻을 바꿀 수 있다(Trojan Source).
// 테스트에 쓰는 특수 글자는 \u{...}로 적는다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const WHITESPACE = new Set(["\t", "\n", "\r"]);
// 문서의 이모지(예: 사람+노트북, 빨간 하트)는 이음 글자(U+200D)·이모지 모양 선택자(U+FE0F)를 담고 있어 이 둘만 허용한다
const EMOJI_PARTS = new Set(["\u{200D}", "\u{FE0F}"]);

function findInvisible(file: string, allowed: Set<string>) {
  const found: string[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const ch of line) {
        if (INVISIBLE.test(ch) && !WHITESPACE.has(ch) && !allowed.has(ch)) {
          found.push(`${file}:${i + 1} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
        }
      }
    });
  return found;
}

describe("보이지 않는 글자 금지", () => {
  it("소스·마이그레이션·설정에는 하나도 없다", () => {
    const files = [
      ...["src", "scripts", "migrations"].flatMap(walk),
      "next.config.ts",
      "vitest.config.ts",
      "eslint.config.mjs",
    ].filter((f) => /\.(ts|tsx|mjs|sql)$/.test(f));
    expect(files.flatMap((f) => findInvisible(f, new Set()))).toEqual([]);
  });

  it("문서에는 이모지 구성 글자 말고는 없다", () => {
    const files = ["README.md", "PROMPT_LOG.md", ...walk("docs")].filter((f) => f.endsWith(".md") && existsSync(f));
    expect(files.flatMap((f) => findInvisible(f, EMOJI_PARTS))).toEqual([]);
  });
});
