// 제출 문서 점검 (docs/writing-guide.md "제출 전 점검").
// 사용법: node scripts/check-docs.mjs [파일 ...]   — 파일을 주지 않으면 제출 문서 네 개를 본다.
// [초안]·"사용자"·"확인 필요"가 남아 있으면 실패(종료 코드 1). 굵은 글씨와 본문 속 ID 참조는 개수만 알리고 기준을 넘으면 경고한다.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const DESIGN_DIR = "docs/design";
const defaults = [
  "README.md",
  "CONSIDERATIONS.md",
  "PROMPT_LOG.md",
  ...(existsSync(DESIGN_DIR)
    ? readdirSync(DESIGN_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => `${DESIGN_DIR}/${f}`)
    : []),
];
const files = process.argv.length > 2 ? process.argv.slice(2) : defaults;

const MUST_BE_ZERO = ["[초안]", "사용자", "확인 필요"];
const BOLD = /\*\*[^*\n]+?\*\*/g;
// 위험·질문·문답·오류 등 이 저장소에서 쓰는 ID: R-A3, D13, N8, Q4, H2, S1, E12, A10, P9, C1-2, #23
const ID = /(?<![\w-])(?:R-[AB]\d{1,2}|C\d-\d|[DNUPXOGVHQSEAP]\d{1,2}|#\d{1,3})(?![\w])/g;

let failed = false;
const rows = [];

for (const file of files) {
  if (!existsSync(file)) {
    rows.push({ file, note: "없음" });
    continue;
  }
  const lines = readFileSync(file, "utf8").split("\n");
  const isDesign = file.startsWith(DESIGN_DIR);
  const markers = Object.fromEntries(MUST_BE_ZERO.map((m) => [m, []]));
  let bold = 0;
  let proseIds = 0;
  let tableIds = 0;
  let inCode = false;

  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) inCode = !inCode;
    for (const m of MUST_BE_ZERO) if (line.includes(m)) markers[m].push(i + 1);
    if (inCode) return;
    bold += (line.match(BOLD) ?? []).length;
    const ids = (line.match(ID) ?? []).length;
    if (line.trimStart().startsWith("|")) tableIds += ids;
    else proseIds += ids;
  });

  const boldLimit = isDesign ? 10 : 5;
  const warnings = [];
  if (bold > boldLimit) warnings.push(`굵은 글씨 ${bold} > ${boldLimit}`);
  if (proseIds > 5) warnings.push(`본문 ID ${proseIds} > 5`);
  const leftovers = MUST_BE_ZERO.filter((m) => markers[m].length > 0).map(
    (m) => `${m} ${markers[m].length}곳(${markers[m].slice(0, 5).join(", ")}${markers[m].length > 5 ? ", …" : ""}행)`,
  );
  if (leftovers.length > 0) failed = true;
  rows.push({ file, lines: lines.length, bold, proseIds, tableIds, leftovers, warnings });
}

for (const r of rows) {
  if (r.note) {
    console.log(`- ${r.file}: ${r.note}`);
    continue;
  }
  console.log(`- ${r.file}: ${r.lines}줄, 굵은 글씨 ${r.bold}, ID 참조 본문 ${r.proseIds} / 표 ${r.tableIds}`);
  for (const l of r.leftovers) console.log(`    실패: ${l}`);
  for (const w of r.warnings) console.log(`    경고: ${w}`);
}
console.log(failed ? "\n결과: 실패 — 남은 [초안]·\"사용자\"·\"확인 필요\"를 고친다" : "\n결과: 통과");
process.exitCode = failed ? 1 : 0;
