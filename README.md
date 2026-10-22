# 파일 확장자 차단 — flow 과제

확장자 차단 정책을 관리하고, 그 정책을 서버가 실제 업로드에서 강제하는 프로젝트입니다.

- 배포: https://flow-assignment-puce.vercel.app
- 상태 확인: https://flow-assignment-puce.vercel.app/api/health

## 핵심 판단

1. 파일 이름은 정규화(NFKC → 소문자 → 끝 점·공백 제거)한 뒤 마지막 점 뒤로 판정합니다. 복합 확장자는 점 경계에서 최대 두 단까지, 정확히 같을 때만 막습니다. 확장자를 숨길 수 있는 안 보이는 글자가 든 이름은 거부합니다. 이모지가 든 이름도 거부하는데, 이모지는 확장자를 숨기지 못하므로 이유가 다릅니다. 사내 도구에서는 드물다고 제가 판단했고("사내 도구"는 과제 원문에 없는 제 가정), 그 대가로 이모지가 붙은 정상 파일 이름도 막힙니다. 판정은 순수 함수 하나이고, 서버가 강제하며 화면은 같은 함수로 안내만 합니다.
2. 파일 내용(시그니처)은 검사하지 않습니다. 대신 업로드 파일을 비공개로 저장하고 내려받을 수 없게 해서, 확장자를 위장한 파일이 실행되거나 퍼질 경로를 두지 않았습니다.
3. 고정 확장자와 커스텀 확장자는 테이블을 나눴습니다. 둘이 겹치지 않는 규칙과 확장자 형식은 DB 트리거·CHECK로도 막고, 커스텀 200개 제한은 잠금으로 직렬화했습니다. 잠금이 없으면 동시 요청에서 201개가 되는 것을 실측으로 확인했습니다.
4. 업로드는 이름·정책 판정을 크기보다 우선합니다. 큰 실행 파일도 "크기 초과"가 아니라 "차단"으로 알리고 기록하기 위해서입니다. 다만 서버가 본문을 받은 요청에서만 그렇고, 그 경계를 문서와 화면에 적었습니다.
5. 인증 없이 누구나 정책을 바꿀 수 있는 공개 배포라서, 기본값 초기화, 고칠 수 없는 변경 이력, 하루 저장 50건 상한을 두었습니다. 범위는 "마감 안에 동작을 확실히 하고, 내가 면접에서 설명할 수 있는가"를 기준으로 잘랐습니다.

## 문서 읽는 순서

1. [CONSIDERATIONS.md](CONSIDERATIONS.md) — 무엇을 왜 막았는지. 가장 깊이 다룬 위험 다섯 가지와 과제 고려사항별 판단
2. [PROMPT_LOG.md](PROMPT_LOG.md) — AI를 어떻게 썼는지. 제 입력이 방향을 바꾼 순간과 회고
3. [설계 문서](docs/design/2026-10-21-file-extension-policy.md) — 구현의 정본. 결정 표, 판정 규칙, 스키마, 흐름, 문답 기록, AI 오류 노트
4. 근거 자료 — [요구사항 분석](docs/analysis/01-requirements.md), [위험 목록](docs/analysis/02-risks.md), [스택 비교](docs/analysis/03-stack.md), [AI 작업 점검표](docs/ai-checklist.md), [작업 기록](docs/history/)

## 바로 해 보기

1. 배포 주소에서 고정 확장자 `exe`를 체크합니다.
2. 오른쪽 업로드 시험에 `Setup.EXE` 같은 파일을 올리면 "차단됨"과 걸린 확장자가 보입니다.
3. 화면을 거치지 않아도 서버가 막습니다.

```bash
echo test > Setup.EXE
curl -s -F "file=@Setup.EXE" https://flow-assignment-puce.vercel.app/api/uploads
```

`422 EXTENSION_BLOCKED`와 걸린 확장자(`"matched": "exe"`, `"source": "fixed"`)가 옵니다. 시험한 뒤에는 "기본값으로 초기화"로 되돌려 주세요.

## 구조

```text
src/domain/   순수 함수 — 파일 이름 해석, 커스텀 입력 정규화, 정책 판정, 업로드 판정 순서, 문구
src/server/   DB 연결, 정책·이력(잠금 트랜잭션), 업로드 처리, 저장소(Vercel Blob / 메모리), 정리
src/app/api/  Route Handler (아래 API)
src/app/      화면 하나: 확장자 정책 | 업로드 시험
src/ui/       화면 패턴(확인 창, 진행 버튼, 스켈레톤, 끌어다 놓기)과 디자인 토큰
migrations/   SQL 마이그레이션 — 스키마의 정본
```

배포는 Vercel Hobby(함수 지역 싱가포르) + Neon PostgreSQL(싱가포르, 풀링 연결) + Vercel Blob 비공개 스토어입니다. 정리 크론은 매일 KST 04:00~05:00 사이에 돕니다(Hobby 크론은 정한 시각부터 1시간 안에 실행).

## 로컬 실행

필요한 것: Node.js 22, pnpm 10, Docker

```bash
pnpm install
pnpm db:up                     # 로컬 Postgres 17 (docker compose)
cp .env.example .env.local     # 로컬 전용 접속 정보
pnpm migrate                   # migrations/*.sql 적용
pnpm dev                       # http://localhost:3000
```

상태 확인: `curl http://localhost:3000/api/health` → `{"ok":true,"db":"ok",...}`

로컬에서는 업로드 파일을 메모리에 저장합니다. 서버를 다시 켜면 파일은 사라지고 시도 기록만 DB에 남습니다.

## 검증

`pnpm test`는 DB 없이 도는 테스트와 로컬 DB가 필요한 테스트를 함께 돌립니다. DB 테스트는 개발용 로컬 DB(`pnpm db:up`)를 같이 쓰고 데이터를 지웁니다. 그래서 DB 주소가 로컬이 아니면 시작하지 않습니다.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## 테이블 스키마

정본은 [migrations/](migrations/)의 SQL이고, 설계 문서 5장에 컬럼마다 이유를 적었습니다.

### `fixed_extension` — 고정 확장자 7개와 현재 상태

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `ext` | `varchar(20)` | PK, `CHECK (ext ~ '^[a-z0-9]+(\.[a-z0-9]+)?$')` |
| `blocked` | `boolean` | NOT NULL, 기본 `false`(과제: 기본 해제) |
| `sort_order` | `smallint` | NOT NULL, UNIQUE (화면 순서) |
| `updated_at` | `timestamptz` | NOT NULL, 기본 `now()` |

초기 행은 `bat, cmd, com, cpl, exe, scr, js`이고, 마이그레이션을 다시 돌려도 체크 상태는 유지됩니다(`ON CONFLICT DO NOTHING`).

### `custom_extension` — 커스텀 확장자 (최대 200개)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `bigint` | PK, `GENERATED ALWAYS AS IDENTITY` |
| `ext` | `varchar(20)` | NOT NULL, UNIQUE, 형식 CHECK(위와 같음 — 정규화된 값만) |
| `created_at` | `timestamptz` | NOT NULL, 기본 `now()` |

- 트리거 `custom_extension_not_fixed` / `fixed_extension_not_custom`: 고정과 커스텀이 겹치면 거부합니다(양방향).
- 200개 제한은 제약이 아니라, 정책 쓰기 전체를 한 줄로 세우는 잠금(`pg_advisory_xact_lock`) 안에서 셉니다.

### `policy_audit_log` — 정책 변경 이력 (추가 전용, 30일)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `bigint` | PK, `GENERATED ALWAYS AS IDENTITY` |
| `occurred_at` | `timestamptz` | NOT NULL, 기본 `now()` |
| `action` | `text` | NOT NULL, `fixed_blocked` / `fixed_unblocked` / `custom_added` / `custom_removed` / `policy_reset` |
| `ext` | `varchar(20)` | 초기화만 NULL (`CHECK ((action = 'policy_reset') = (ext IS NULL))`) |
| `detail` | `jsonb` | NOT NULL, 기본 `{}` (초기화 직전 상태 등) |
| `request_id` | `uuid` | NOT NULL (응답 헤더 `X-Request-Id`·서버 로그와 같은 번호) |

- 인덱스: `policy_audit_log_occurred_at_idx (occurred_at DESC)`
- 트리거: 수정·TRUNCATE는 언제나 거부, 삭제는 30일이 지난 행만 허용합니다.

### `upload_attempt` — 업로드 시도 (저장·차단·거부 모두, 24시간)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `uuid` | PK, 기본 `gen_random_uuid()` |
| `status` | `text` | NOT NULL, `stored` / `blocked` / `rejected` |
| `reason_code` | `text` | 차단·거부 사유 코드 (`stored`면 NULL) |
| `original_name` | `varchar(255)` | 표시용 이름. 이름이 잘못된 시도는 NULL |
| `ext` | `varchar(20)` | 해석한 확장자 |
| `matched_rule` | `varchar(20)` | 차단에 걸린 정책 항목 (`blocked`일 때만) |
| `matched_source` | `text` | `fixed` / `custom` (`matched_rule`과 함께) |
| `size_bytes` | `integer` | NOT NULL, 0 이상, `stored`면 4,194,304(4MiB) 이하 |
| `blob_pathname` | `text` | UNIQUE, `stored`일 때만 (`uploads/<uuid>`) |
| `created_at` | `timestamptz` | NOT NULL, 기본 `now()` |
| `expires_at` | `timestamptz` | NOT NULL, `created_at`보다 뒤 (24시간) |

- 인덱스: `upload_attempt_expires_idx (expires_at)` — 정리, `upload_attempt_stored_idx (created_at) WHERE status = 'stored'` — 하루 저장 수
- 상태와 컬럼의 짝(저장이면 경로 있음, 차단이면 걸린 규칙 있음 등)을 CHECK로 묶었습니다.

마이그레이션 실행기는 적용한 파일을 `schema_migrations(version text PK, applied_at timestamptz NOT NULL DEFAULT now())`에 남깁니다.

## API

모든 응답에 `Cache-Control: no-store`와 `X-Request-Id`가 붙습니다. 오류는 `{ "error": { "code", "message", "requestId", "details" } }` 형식이고, `message`는 화면에 그대로 보이는 문구입니다.

| 메서드·경로 | 성공 | 주요 실패 |
| --- | --- | --- |
| `GET /api/policy` | 200 고정·커스텀 목록, 개수, 상한 | 503 |
| `PUT /api/policy/fixed/{ext}` `{ blocked }` | 200 | 400, 404 |
| `POST /api/policy/custom` `{ ext }` | 201 | 400 형식, 409 고정 확장자·중복·200개 |
| `DELETE /api/policy/custom/{ext}` | 204 (없어도) | 400 |
| `POST /api/policy/reset` | 200 정책 전체 | — |
| `GET /api/policy/audit?limit=20` | 200 최근 이력 | — |
| `POST /api/uploads` (multipart `file`) | 201 | 400 요청·이름, 413 크기, 422 차단, 429 하루 50건, 503 저장 실패 |
| `GET /api/health` | 200 DB 왕복 시간 | 503 |
| `GET /api/cron/cleanup` (`Bearer CRON_SECRET`) | 200 삭제 건수 | 401 |

자세한 요청·응답과 오류 코드는 설계 문서 8장에 있습니다.
