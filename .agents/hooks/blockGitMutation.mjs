#!/usr/bin/env node
// PreToolUse(Bash)의 Git 명령 패턴 검사. 등록된 도구 경로만 검사하며 승인 판독기는 아니다.
// switch와 일반 worktree 생성·조회는 허용한다. commit·push는 allowCommitPush가 true일 때 허용한다.
// 이력 재작성·강제·삭제 옵션은 차단한다. 간접 메시지는 blockAttribution을 선택한 경우만 제한한다.
// requireHistoryDoc은 push할 변경에 기록 파일이 있는지 확인하며 내용 품질을 판정하지 않는다.
// 설정 생략 시 기존 정책을 유지한다. 새 minimal 설치는 requireHistoryDoc: false를 명시한다.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 서브커맨드 앞의 전역 플래그를 건너뛴 뒤 판정한다. -C <path>·-c <k=v>·--git-dir <path>처럼
// 값을 별도 인자로 받는 플래그를 놓치면 `git -C /repo commit` 같은 우회가 생긴다.
const GIT_GLOBAL_FLAGS =
  /(?:-[cC]\s+\S+\s+|--(?:git-dir|work-tree|namespace|exec-path)\s+\S+\s+|-\S+\s+)*/;
const gitSubcommand = (alternatives) =>
  new RegExp(String.raw`\bgit\s+` + GIT_GLOBAL_FLAGS.source + String.raw`(?:${alternatives})\b`);
// commit·push를 제외한 변경 명령 — commit·push 예외(allowCommitPush)에서도 이 목록은 항상 차단이다.
const MUTATION_CORE = String.raw`merge|rebase|reset|revert|cherry-pick|tag|stash|checkout|restore|clean|am|apply|branch\s+(?:-[dDmM]|--delete)`;
const GIT_MUTATION = gitSubcommand(String.raw`commit|push|${MUTATION_CORE}`);
const GIT_MUTATION_EXCEPT_COMMIT_PUSH = gitSubcommand(MUTATION_CORE);
// 차단 범위 원칙: 변경 명령만 막는다. status·diff·log·show·blame 같은 읽기 명령은
// 에이전트의 작업 파악에 필요하므로 허용한다. add(스테이징)도 가역적이라 허용한다.
//
// switch 예외 (v1.9.0, 사용자 승인): 순수 브랜치 전환(`git switch <b>`·`git switch -c <b>`)은
// 요청된 구현 범위에서 수행하도록 허용한다 — switch는 커밋·푸시와 달리 작업 내용을
// 파괴하지 않고, 로컬 변경과 충돌하면 git이 스스로 거부한다. 단 작업 내용을 버리거나(-f/-C/
// --discard-changes) 워킹트리를 비우거나(--orphan) 보호 브랜치 가드를 무력화하는
// (-d/--detach — detached HEAD에서는 branchGuard가 비활성) 플래그는 계속 차단한다.
// checkout은 파일 복원(git checkout -- <path>) 기능이 있어 전체 차단을 유지하고, 같은 이유로
// 워킹트리를 파괴하는 현대적 등가 명령 restore·clean도 차단한다.
// 꼬리 캡처는 명령 구분자와 개행에서 끊는다 — 개행을 포함하면 멀티라인 명령의 다음 줄
// 플래그가 switch 인자로 오인된다. /g로 전체를 훑는다 — `switch -c a && switch -f b`처럼
// 한 명령 안의 두 번째 switch도 검사해야 한다.
const subcommandWithTail = (name) =>
  new RegExp(String.raw`\bgit\s+` + GIT_GLOBAL_FLAGS.source + name + String.raw`\b([^&|;\n]*)`, 'g');
const GIT_SWITCH = subcommandWithTail('switch');
const GIT_COMMIT = subcommandWithTail('commit');
const GIT_PUSH = subcommandWithTail('push');
const GIT_WORKTREE = subcommandWithTail('worktree');
// 조회·일반 생성만 허용한다. 삭제·이동·정리·잠금·강제 생성은 기존처럼 차단한다.
const isUnsafeWorktree = command => [...command.matchAll(GIT_WORKTREE)].some(({ 1: tail }) => {
  const parts = tail.trim().split(/\s+/).map(token => token.replace(/^["']+|["']+$/g, ''));
  if (parts[0] === 'list') return false;
  return parts[0] !== 'add' || tailHasFlag(tail, /^--(?:force|detach|orphan)(?:=|$)/, /[fBd]/);
});

// git parse-options는 단축 옵션의 번들(-fc = -f -c)과 값 붙임(-Cmain = -C main)을 허용하고,
// 셸은 따옴표를 벗겨 전달한다("-f" → -f). 정규식 한 줄로는 이 형태들을 놓치므로 토큰 단위로
// 검사한다. 단축 클러스터에 금지 문자가 보이면 차단 — -cf(f라는 브랜치 생성) 같은 드문 오탐은
// 감수한다(가드는 fail-closed가 원칙).
const tailHasFlag = (tail, longFlag, shortLetters) =>
  tail
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^["']+|["']+$/g, ''))
    .some(
      (token) =>
        longFlag.test(token) || (/^-[^-]/.test(token) && shortLetters.test(token.slice(1))),
    );

const DESTRUCTIVE_SWITCH_LONG = /^--(?:force(?:-create)?|discard-changes|orphan|detach)(?:=|$)/;
const isDestructiveSwitchTail = (tail) => tailHasFlag(tail, DESTRUCTIVE_SWITCH_LONG, /[fCd]/);

// commit 예외에서도 계속 차단하는 형태: --amend(히스토리 재작성)와 선택적 작성자 검사에서만 제한할 간접 메시지 플래그(-F/--file·-t/--template·-c/-C/--reuse-message 계열·
// --fixup/--squash). blockAttribution이 켜진 경우에만 간접 메시지를 차단한다.
const UNSAFE_COMMIT_LONG = /^--(?:amend|fixup|squash)(?:=|$)/;
const INDIRECT_COMMIT_LONG = /^--(?:file|template|reuse-message|reedit-message)(?:=|$)/;
const INDIRECT_COMMIT_SHORT = /[FCct]/;
// push 예외에서도 계속 차단: force 계열(원격 히스토리 덮어쓰기)·delete(원격 브랜치 삭제)·
// mirror·prune. 일반 push(-u 포함)만 허용한다.
const UNSAFE_PUSH_LONG = /^--(?:force(?:-with-lease|-if-includes)?|delete|mirror|prune)(?:=|$)/;
const UNSAFE_PUSH_SHORT = /[fd]/;

// 선택 정책(blockAttribution): 커밋 메시지의 Claude 작성 표기를 제한한다. 표준 footer 형태만 잡는다 —
// 단순 "claude" 단어는 정상 메시지에 나올 수 있으므로 표기 패턴만 차단한다(오탐 방지).
export const CLAUDE_ATTRIBUTION =
  /co-authored-by:[^\n]*\bclaude\b|generated with[^\n]*\bclaude\b|\bclaude-session:|noreply@anthropic\.com/i;

export const isGitMutation = (command) => {
  if (GIT_MUTATION.test(command) || isUnsafeWorktree(command)) return true;
  return [...command.matchAll(GIT_SWITCH)].some((switchMatch) =>
    isDestructiveSwitchTail(switchMatch[1]),
  );
};

// 기록 게이트 — PR 하나당 docs/history/ 문서 하나(history 스킬). base...HEAD 변경 경로에
// 기록 문서가 없으면 그 push는 기록되지 않은 작업을 올리는 것이다.
export const HISTORY_DIR = 'docs/history/';
export const hasHistoryChange = (changedPaths) =>
  changedPaths.some((path) => path.startsWith(HISTORY_DIR) && path.endsWith('.md'));

// 판정 결과를 사유와 함께 돌려준다 — CLI가 사유별 안내 메시지를 낸다.
// rule: 'mutation' | 'attribution' | 'commit-flags' | 'push-flags' | 'history-missing'
// historyChanged: true(기록 있음) | false(없음) | null(판정 불가 — 게이트를 통과시킨다.
// base 브랜치를 못 찾는 환경에서 push를 막으면 가드가 아니라 고장이다)
export const judgeGitCommand = (
  command,
  { allowCommitPush = false, requireHistoryDoc = false, historyChanged = null, blockAttribution = false } = {},
) => {
  if (!allowCommitPush) {
    return isGitMutation(command) ? { blocked: true, rule: 'mutation' } : { blocked: false };
  }
  if (GIT_MUTATION_EXCEPT_COMMIT_PUSH.test(command) || isUnsafeWorktree(command)) return { blocked: true, rule: 'mutation' };
  if ([...command.matchAll(GIT_SWITCH)].some((m) => isDestructiveSwitchTail(m[1]))) {
    return { blocked: true, rule: 'mutation' };
  }
  const commits = [...command.matchAll(GIT_COMMIT)];
  if (commits.length > 0) {
    // 표기 검사는 명령 전체를 본다 — heredoc 메시지 본문은 개행을 포함해 꼬리 캡처 밖에 있다.
    if (blockAttribution && CLAUDE_ATTRIBUTION.test(command)) return { blocked: true, rule: 'attribution' };
    if (commits.some((m) => tailHasFlag(m[1], UNSAFE_COMMIT_LONG, /$^/) ||
        (blockAttribution && tailHasFlag(m[1], INDIRECT_COMMIT_LONG, INDIRECT_COMMIT_SHORT)))) {
      return { blocked: true, rule: 'commit-flags' };
    }
  }
  const pushes = [...command.matchAll(GIT_PUSH)];
  if (pushes.length > 0) {
    if (pushes.some((m) => tailHasFlag(m[1], UNSAFE_PUSH_LONG, UNSAFE_PUSH_SHORT))) {
      return { blocked: true, rule: 'push-flags' };
    }
    if (requireHistoryDoc && historyChanged === false) {
      return { blocked: true, rule: 'history-missing' };
    }
  }
  return { blocked: false };
};

// base...HEAD 사이에 변경된 경로 목록. base를 못 찾거나 git 호출이 실패하면 null을 돌려
// 게이트를 통과시킨다 — 기록 게이트는 문서 위생 장치이므로, 판정 불가를 차단으로 처리하면
// git 환경이 다른 곳에서 push 자체가 막힌다(시크릿·변경 명령 가드의 fail-closed와 다른 성격).
const DEFAULT_HISTORY_BASES = ['origin/dev', 'dev', 'origin/main', 'main', 'origin/master', 'master'];
// cwd: 훅 입력의 프로젝트 경로. 앱이 훅 프로세스를 프로젝트 루트에서 실행한다고 가정하지 않는다.
const changedPathsSinceBase = (configuredBase, cwd) => {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const candidates = configuredBase ? [configuredBase] : DEFAULT_HISTORY_BASES;
    for (const base of candidates) {
      if (base === currentBranch || base === `origin/${currentBranch}`) continue;
      try {
        git(['rev-parse', '--verify', '--quiet', base]);
      } catch {
        continue;
      }
      return git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);
    }
  } catch {
    // git이 없거나 저장소가 아니다 — 판정하지 않는다
  }
  return null;
};

// 심링크 경로로 호출되면 ESM 모듈 URL은 realpath로 해석되고 argv[1]은 원문 그대로라
// 단순 문자열 비교는 어긋난다 — 그러면 훅이 아무것도 안 하고 exit 0(fail-open)이 된다.
// 양쪽을 realpath로 정규화해 비교한다.
const toRealPath = (p) => { try { return realpathSync(p); } catch { return p; } };
const isDirectRun = process.argv[1] != null
  && toRealPath(process.argv[1]) === toRealPath(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const command = input.tool_input?.command ?? '';
  const projectDir = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  const configPath = join(dirname(fileURLToPath(import.meta.url)), 'blockGitMutation.config.json');
  let config = {};
  let configNote = '';
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (error) {
      // 가드 훅은 설정 오류에 fail-closed — 예외를 끄고 기본 차단으로 동작한다.
      configNote = ` (blockGitMutation.config.json 파싱 실패: ${error.message} — commit·push 예외 비활성)`;
    }
  }
  const allowCommitPush = config.allowCommitPush === true;
  // 기록 게이트는 commit·push 예외를 켠 하네스의 기본값이다 — 명시적으로 false일 때만 끈다.
  const requireHistoryDoc = allowCommitPush && config.requireHistoryDoc !== false;
  const changedPaths = requireHistoryDoc ? changedPathsSinceBase(config.historyBase, projectDir) : null;

  const verdict = judgeGitCommand(command, {
    allowCommitPush,
    blockAttribution: config.blockAttribution === true,
    requireHistoryDoc,
    historyChanged: changedPaths === null ? null : hasHistoryChange(changedPaths),
  });
  if (verdict.blocked) {
    const messages = {
      mutation: allowCommitPush
        ? 'commit·push 외의 git 변경 작업(merge·rebase·reset·checkout 등)은 여전히 사용자 전담입니다. 변경 요약을 보고하고 사용자에게 안내하세요.'
        : 'git 변경 작업은 사용자 전담입니다. 현재 프로젝트 설정에서 commit·push가 차단되어 있습니다. 앱 권한과 별개인 팀 설정을 안내하세요. ' +
          '요청된 구현에 필요한 브랜치 전환은 git switch(-c)로 진행하세요 — force/discard 플래그는 허용되지 않습니다. ' +
          '사용자가 커밋·PR 업로드를 명시 요청했다면 pr 스킬을 따르세요 — blockGitMutation.config.json의 allowCommitPush 옵트인이 필요합니다.',
      attribution:
        '커밋 메시지에 Claude 작성 표기(Co-Authored-By: Claude·Generated with Claude Code·Claude-Session 등)가 있습니다. ' +
        '프로젝트의 blockAttribution 정책에 맞게 메시지를 수정하세요 (pr 스킬).',
      'commit-flags':
        '이력 재작성(--amend/--fixup/--squash) 또는 작성자 검사 정책에서 확인할 수 없는 간접 메시지입니다. blockAttribution이 켜져 있으면 -m으로 메시지를 전달하세요.',
      'push-flags':
        'force/delete push는 허용되지 않습니다 — 일반 push(-u 포함)만 가능합니다. 히스토리 재작성·원격 브랜치 삭제가 필요하면 사용자에게 안내하세요.',
      'history-missing':
        '이 브랜치에 작업 기록이 없습니다 — PR 하나당 docs/history/ 문서 하나가 필요합니다. ' +
        'history 스킬로 docs/history/{YYYY-MM-DD}-{slug}.md를 작성(또는 갱신)해 커밋한 뒤 다시 push하세요.',
    };
    console.error(`차단됨: ${messages[verdict.rule]}${configNote}`);
    process.exit(2);
  }
}
