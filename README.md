# 파일 확장자 차단 · 업로드

고정·커스텀 확장자를 차단 목록으로 관리하고, 파일을 올릴 때 서버가 이 정책을 적용하는 과제입니다. 정책은 DB에 저장되며 새로고침해도 유지됩니다.

[배포 사이트](https://flow-assignment-puce.vercel.app) · [DB 연결 상태](https://flow-assignment-puce.vercel.app/api/health)

## 핵심 판단

1. 확장자 판정은 서버가 강제합니다. 화면도 같은 순수 함수를 사용해 업로드 전에 결과를 안내합니다.
2. 이름을 정규화한 뒤 마지막 확장자를 비교합니다. `tar.gz` 같은 복합 항목은 점으로 구분한 마지막 두 단이 정확히 일치할 때만 차단합니다.
3. 파일 내용은 검사하지 않습니다. 파일은 무작위 경로에 비공개로 저장하며, 실행·미리보기·다운로드 기능은 제공하지 않습니다.
4. 커스텀 200개 제한은 DB 잠금 안에서 확인합니다. 로컬 동시 요청 시험에서 잠금이 없으면 201개가 되는 경우를 재현했습니다.
5. 평가자가 바로 시험할 수 있도록 로그인 없이 정책을 편집하게 했습니다. 방문자 간 간섭은 허용하며, 변경 이력과 초기화를 제공합니다. 정상 파일 저장은 전체 방문자를 합쳐 하루 50건까지입니다.

## 문서 읽는 순서

1. [고려사항](CONSIDERATIONS.md) — 주요 위험, 구현한 대응, 남겨 둔 한계
2. [AI 활용 기록](PROMPT_LOG.md) — 실제 입력과 그에 따라 바뀐 판단, 사용한 도구, 회고
3. [설계 문서](docs/design/2026-10-21-file-extension-policy.md) — 판정 규칙, 스키마, API, 결정 이력

분석 근거는 [요구사항](docs/analysis/01-requirements.md)·[위험 목록](docs/analysis/02-risks.md)·[스택 비교](docs/analysis/03-stack.md)에, 단계별 검증 결과는 [작업 기록](docs/history/)에 있습니다.

## 바로 해 보기

1. 배포 주소에서 고정 확장자 `exe`를 체크합니다.
2. 오른쪽 업로드 시험에 `Setup.EXE` 같은 파일을 올리면 "차단됨"과 걸린 확장자가 보입니다.
3. 화면을 거치지 않아도 서버가 막습니다.

```bash
echo test > Setup.EXE
curl -s -F "file=@Setup.EXE" https://flow-assignment-puce.vercel.app/api/uploads
```

`422 EXTENSION_BLOCKED`와 걸린 확장자(`"matched": "exe"`, `"source": "fixed"`)가 옵니다. `exe`만 차단 중이라면 `sample.txt`는 저장됩니다. 파일은 한 번에 하나, 4MiB까지입니다. 다른 방문자도 같은 정책을 바꿀 수 있으므로 예상과 다르면 현재 정책을 확인해 주세요. "기본값으로 초기화"는 고정 항목을 모두 해제하고 커스텀 항목을 삭제합니다.

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
- 200개 제한은 정책 변경을 순서대로 처리하는 잠금(`pg_advisory_xact_lock`) 안에서 개수를 확인해 적용합니다.

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
- 트리거: 수정·TRUNCATE는 거부, 삭제는 30일이 지난 행만 허용합니다. 앱 경로 기준이고, 테이블 주인 권한이면 트리거를 끌 수 있습니다(CONSIDERATIONS "실제 서비스로 넓힌다면").

### `upload_attempt` — 업로드 시도 (저장·차단·거부, 24시간 후 정리 대상)

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

만료된 시도와 파일은 하루 한 번 크론에서 정리합니다. 마이그레이션 실행기는 적용 이력을 `schema_migrations(version text PK, applied_at timestamptz NOT NULL DEFAULT now())`에 남깁니다.

## API

앱이 반환하는 API 응답에 `Cache-Control: no-store`와 `X-Request-Id`가 붙습니다. 오류는 `{ "error": { "code", "message", "requestId", "details" } }` 형식이고, `message`는 화면에 그대로 보이는 문구입니다. 상세 명세는 설계 문서 8장에 있습니다.

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
