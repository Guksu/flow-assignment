# 뼈대와 1일차 배포

| 항목 | 내용 |
|------|------|
| 날짜 | 2026-10-21 |
| 브랜치 | `chore/skeleton` |
| PR | 생성 후 링크 추가 |
| 관련 경로 | `package.json`, `next.config.ts`, `vercel.json`, `src/app/**`, `src/server/db.ts`, `scripts/migrate*.mjs`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml` |

## 1. 개요

빈 화면 + DB 연결 상태로 배포할 수 있는 뼈대를 만들었다. 기능 코드는 없다. 배포 위험(빌드, DB 접속, 지역, 첫 요청 지연)을 먼저 확인하는 것이 목적이다(설계 11장 순서 1). Vercel·Neon 설정은 사용자가 CLI 로그인만 하고, 서브에이전트 두 개가 병렬로 실행했다.

## 2. 작업 내용

- Next.js 16.4 App Router + TypeScript 5 + ESLint 10 + Vitest 5. `create-next-app` 결과에서 설정만 가져오고 `cacheComponents`는 껐다 — Route Handler 기본 동작(캐시 안 함)만으로 설명되게(위험 D16)
- `src/server/db.ts` — `pg` 풀 + `attachDatabasePool`(Vercel 밖에서는 아무 일도 안 함을 패키지 소스로 확인)
- `src/app/api/health/route.ts` — `SELECT 1`, `dbMs`로 DB 왕복 시간, `no-store`, 실패하면 503(원본 오류는 응답에 싣지 않음)
- `next.config.ts` — 보안 헤더 3종(위험 D9), `src/app/robots.ts` + `noindex` 메타(위험 D7)
- `scripts/migrate.mjs` + `migrate-lib.mjs` — 아직 안 된 `migrations/NNN_*.sql`을 한 트랜잭션에서, advisory lock으로 동시 빌드를 막고 적용. 이름 규칙 위반·적용된 파일 사라짐·순서 꼬임이면 멈춘다. 배포 빌드(`vercel-build`)에서 실행
- `vercel.json` — 함수 지역 `sin1`, 빌드 명령 `pnpm run vercel-build`
- `docker-compose.yml`(로컬 Postgres 17), `.env.example`(로컬 전용 값), `.github/workflows/ci.yml`(Postgres 서비스 컨테이너로 typecheck·lint·migrate·test)
- 하네스 검증 명령 연결: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## 3. 검증 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| 타입 | `pnpm typecheck` (`next typegen && tsc --noEmit`) | 통과 |
| 린트 | `pnpm lint` | 8개 파일, 오류 0 |
| 테스트 | `pnpm test` | 5개 통과 (마이그레이션 순서 규칙) |
| 마이그레이션 | 로컬 Docker DB에 두 번 실행 | 두 번 모두 `up to date`, `schema_migrations` 생성 |
| 빌드 | `pnpm build` | 통과. `/api/health`만 동적, 나머지 정적 |
| 실행 | `pnpm start` 후 `curl` | `/api/health` 200 `{"ok":true,"db":"ok"}`, 보안 헤더 3종·`no-store` 확인, `robots.txt` Disallow, `noindex` 메타 / DB를 멈추면 503 `{"ok":false,"db":"error"}` |
| 배포 | 미리보기·운영 배포 | 서브에이전트 설정이 끝난 뒤 확인 |

## 4. main의 Vercel 빌드 실패 (NEXT_NO_VERSION)

설계 PR(#5)을 머지한 뒤 `main`(d3f7afa)의 Vercel 운영 빌드가 실패했다. 사용자가 Vercel 로그의 오류를 전달했다.

```text
Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
Error: [NEXT_NO_VERSION] No Next.js version detected. ...
```

- 원인: Vercel 프로젝트를 GitHub 저장소에 연결한 뒤로 문서만 바뀐 push도 빌드된다. 그런데 `main`에는 아직 `package.json`이 없다(이 뼈대 브랜치가 머지 전). 빌드 로그도 `npm install`이 "up to date"로 끝난 뒤 Next.js 버전을 못 찾았다. 설계 PR 브랜치(98e5069)의 미리보기 빌드도 같은 이유로 실패했다
- `package.json`은 문제없음: `next` 16.4.2가 `dependencies`에 있다. Vercel 프로젝트 설정도 Root Directory `.`, 프레임워크 Next.js, Production·Preview에 `DATABASE_URL`·`DATABASE_URL_UNPOOLED`·`CRON_SECRET` 등록(이름만 확인)
- 조치: 이 PR을 머지하면 `main`에 `package.json`이 생겨 해소된다. 이 브랜치의 미리보기 빌드로 먼저 확인한다
- 참고: 프로젝트 설정의 Node.js 버전은 24.x지만 `package.json`의 `engines`(22.x)가 우선한다. 함수 지역 기본값은 iad1이고 `vercel.json`의 `sin1`이 덮는다 — 배포 뒤 `x-vercel-id`로 확인

## 5. 확인 필요 · 후속

- 배포 뒤 확인: 함수 지역(`x-vercel-id`), 5분 이상 쉰 뒤 첫 `/api/health`의 `dbMs`, 미리보기 빌드에서 마이그레이션이 preview DB 브랜치에 적용되는지
- PROMPT_LOG 항목(환경 설정 라운드)은 다음 PR에서 추가한다 — 이 브랜치는 설계 PR 머지 전 `main`에서 갈라져, 여기서 고치면 다시 쓴 PROMPT_LOG와 충돌한다

## 6. 주의사항

- 로컬 `pnpm migrate`는 `.env.local`을 읽는다. `.env.local`에 운영 DB 주소를 두면 로컬에서 운영 DB에 마이그레이션이 적용되므로, `.env.local`에는 로컬 Docker 값만 둔다
- `migrations/`가 비어 있으면 git이 폴더를 남기지 않아 빌드가 실패한다 — `.gitkeep`을 둔다
