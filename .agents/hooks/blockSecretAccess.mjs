#!/usr/bin/env node
// PreToolUse 훅 (matcher: Bash) — 시크릿 파일에 접근하는 셸 명령을 차단한다 (절대 규칙 6).
// permissions.deny의 Read(...) 패턴은 Read 도구만 막는다 — `cat .env`·`grep KEY .env` 같은
// Bash 경유 읽기는 deny로 막히지 않으므로 이 훅이 그 우회 경로를 닫는다.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// permissions.deny 패턴(.env / .env.* / credentials* / *.pem / secrets/**)과 짝을 맞춘다.
// 시크릿이 아닌 관례적 예시 파일(.env.example 등)은 허용한다.
const ENV_EXAMPLE = /\.(?:example|sample|template|dist)(?:\.|$)/;

export const referencesSecret = (command) => {
  const tokens = command.split(/[\s;|&()<>'"`]+/).filter(Boolean);
  return tokens.some((token) => {
    const path = token.replace(/^[\w-]+=/, ''); // FOO=./key.pem, --file=.env 형태의 값 추출
    if (/(?:^|\/)secrets\//.test(path)) return true;
    const base = path.split('/').pop() ?? '';
    if (/^\.env(?:\..+)?$/.test(base)) return !ENV_EXAMPLE.test(base);
    return /^credentials/i.test(base) || /\.pem$/.test(base);
  });
};

// 심링크 경로 호출 시 ESM URL(realpath) ↔ argv[1](원문) 불일치로 fail-open이 되지 않게
// 양쪽을 realpath로 정규화해 비교한다.
const toRealPath = (p) => { try { return realpathSync(p); } catch { return p; } };
const isDirectRun = process.argv[1] != null
  && toRealPath(process.argv[1]) === toRealPath(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { tool_input } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (referencesSecret(tool_input?.command ?? '')) {
    console.error(
      '차단됨: 시크릿 파일(.env·credentials·*.pem·secrets/)은 읽지도 기록하지도 않습니다. 설정값이 필요하면 키 이름만 언급하세요.',
    );
    process.exit(2);
  }
}
