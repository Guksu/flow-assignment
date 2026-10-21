# PR 5 — 뼈대와 1일차 배포

| 항목 | 내용 |
|------|------|
| 날짜 | 2026-10-21 |
| 브랜치 | `chore/skeleton` |
| PR | 생성 후 링크 추가 |
| 관련 경로 | `package.json`, `next.config.ts`, `vercel.json`, `src/app/**`, `src/server/db.ts`, `scripts/migrate*.mjs`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml` |

## 1. 개요

빈 화면 + DB 연결 상태로 배포할 수 있는 뼈대를 만들었다. 기능 코드는 없다. 배포 위험(빌드, DB 접속, 지역, 첫 요청 지연)을 먼저 확인하는 것이 목적이다(설계 11장 PR 5). Vercel·Neon 설정은 사용자가 CLI 로그인만 하고, 서브에이전트 두 개가 병렬로 실행했다.

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

## 4. 확인 필요 · 후속

- 배포 뒤 확인: 함수 지역(`x-vercel-id`), 5분 이상 쉰 뒤 첫 `/api/health`의 `dbMs`, 미리보기 빌드에서 마이그레이션이 preview DB 브랜치에 적용되는지
- PROMPT_LOG 항목(이번 요청)은 설계 PR(#5)이 머지된 뒤 다음 PR에서 추가한다 — 두 PR이 같은 위치를 고쳐 충돌하지 않게

## 5. 주의사항

- 로컬 `pnpm migrate`는 `.env.local`을 읽는다. `.env.local`에 운영 DB 주소를 두면 로컬에서 운영 DB에 마이그레이션이 적용되므로, `.env.local`에는 로컬 Docker 값만 둔다
- `migrations/`가 비어 있으면 git이 폴더를 남기지 않아 빌드가 실패한다 — `.gitkeep`을 둔다
