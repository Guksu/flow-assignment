# 업로드와 정리 크론

| 항목 | 내용 |
|------|------|
| 날짜 | 2026-10-21 |
| 브랜치 | `feat/upload` |
| PR | 생성 후 링크 추가 |
| 관련 경로 | `migrations/002_upload_attempt.sql`, `src/server/{uploads,storage,cleanup,cron-auth}.ts`, `src/app/api/uploads/**`, `src/app/api/cron/cleanup/**`, `src/app/upload-panel.tsx`, `vercel.json`, `src/test/source-chars.test.ts` |

## 1. 개요

업로드 API·화면, 하루 저장 50건, 정리 크론을 만들었습니다(설계 11장 순서 4). 구현 전에 진행 방식과 구성을 먼저 확인받았습니다(문답 #38). 시작 전에 정책 PR의 운영 배포를 읽기만 하는 방식으로 확인했습니다.

## 2. 운영 배포 확인 (정책 PR)

- 운영 주소 `https://flow-assignment-puce.vercel.app`, 빌드 로그에 `migrate: applied 001_policy.sql`
- 함수 지역 `x-vercel-id: icn1::sin1` — Hobby에서도 싱가포르로 바뀜(설계 14장 확인)
- `/api/health` 200(한국에서 0.35~0.7초, DB 왕복 2ms), 보안 헤더 3종·`no-store`·`X-Request-Id`·`robots.txt`·`noindex`
- 풀러를 거친 동시 추가 확인은 하지 않았습니다(문답 #37). 미리보기 배포는 Vercel 로그인 보호로 302를 돌려줘 밖에서 시험할 수 없었습니다

## 3. 작업 내용

| 파일 | 하는 일 |
|------|------|
| `migrations/002_upload_attempt.sql` | 설계 5.4 SQL 그대로 |
| `src/server/uploads.ts` | 크기 → 이름 해석 → 정책 판정(요청마다 최신 정책) → 잠금 안에서 오늘(KST) 저장 수 확인·행 먼저 기록 → 저장. 저장 실패면 행을 `STORAGE_ERROR`로 바꾸고 경로 삭제를 한 번 시도. 판정 로그에 이름은 남기지 않음 |
| `src/server/storage.ts` | Vercel Blob 비공개 스토어(`access: "private"`, octet-stream, 덮어쓰기 금지) / 메모리. Vercel 위에서는 Blob만 — 설정이 빠지면 실패 |
| `src/server/cleanup.ts` | 만료된 시도의 파일을 먼저 지우고 행을 지움, 30일 지난 이력 삭제. 다시 돌려도 같은 결과 |
| `src/server/cron-auth.ts` | `Bearer <CRON_SECRET>`을 해시로 바꿔 시간이 일정한 비교. 비밀값이 없거나 16자 미만이면 거부 |
| `src/app/api/uploads/route.ts` | 요청 크기가 4MiB+64KiB를 넘으면 본문을 읽지 않고 413(시도는 이름 없이 기록). 파일 필드가 정확히 하나가 아니면 400(기록 안 함) |
| `src/app/upload-panel.tsx` | 파일을 고르면 같은 순수 함수로 크기·이름·판정을 바로 안내하되, 막힐 파일도 올려 볼 수 있게 둠(서버가 막는 것을 보는 화면). 이번 화면에서 올린 결과만 상태 배지와 사유로 보여 줌. 잘못된 이름은 화면에 그대로 보이지 않게 가림 |
| `vercel.json` | 크론 `0 19 * * *`(KST 04:00) |
| `src/test/source-chars.test.ts` | 소스·문서에 보이지 않는 글자가 있으면 실패 (AI 오류 E18) |

새 의존성: `@vercel/blob` 2.8.2(Vercel Blob 공식 SDK). 배포에서는 `BLOB_STORE_ID`와 Vercel이 함수에 넣어 주는 OIDC 토큰으로 인증합니다.

## 4. 검증 결과

| 검증 | 명령·방법 | 결과 |
|------|------|------|
| 테스트 먼저(red) | 함수·라우트는 "구현 전" 오류를 던지는 껍데기 | 새 DB 테스트 28개 실패 |
| 구현 뒤(green) | `pnpm test` | 12개 파일, 241개 통과 |
| 하루 50건 | 오늘(KST) 50건 뒤 거부, 차단·거부는 세지 않음, 어제 것은 세지 않음, 49건에서 동시 두 건 → 한 건만 저장 | 통과 |
| 저장 실패 | 저장소가 오류를 던지게 함 | 행이 `STORAGE_ERROR`·경로 없음, 삭제 한 번 시도 |
| 타입·린트 | `pnpm typecheck`, `pnpm lint` | 통과 |
| curl 직접 업로드 | 로컬 개발 서버에 차단된 `Setup.EXE` | 422 `EXTENSION_BLOCKED`, `details: { matched: "exe", source: "fixed" }` |
| 화면 | 로컬 개발 서버 + 브라우저(파일은 스크립트로 넣음) | `보고서.pdf` 저장됨, `Setup.EXE` 안내 "막힙니다" → 차단됨, 안 보이는 글자 이름은 이름을 가리고 거부됨, 5MB 파일은 4MiB 안내 → 거부됨, 375px 폭에서 가로 스크롤 없음 |
| 크론 | 비밀값 없는 로컬에서 호출 | 401 |
| 로그 | 개발 서버 로그 | `upload_attempt` 줄에 결과·사유·확장자·크기만, 파일 이름 0건 |
| 문서 | `node scripts/check-docs.mjs` | 통과 |
| 위험 표 숫자 | 표의 행을 스크립트로 셈 | 98개(구현 77 · 문서로만 14 · 제외 7), 요약 표와 같음 |

## 5. 확인하며 고친 것

- 소스에 보이지 않는 글자가 그대로 들어가 있었습니다(AI 오류 E18). 판정 규칙 PR부터 이모지 정규식의 U+FE0F, 주석의 이음 글자, 테스트 문자열의 U+200B·U+3164 등 9개입니다. 파일 쓰기 도구가 `\u` 이스케이프를 실제 글자로 바꿨는데 쓴 뒤 바이트를 확인하지 않았습니다. 특수 글자를 모두 `\u{...}`로 바꾸고, 소스·문서를 검사하는 테스트를 더했습니다. 방향 제어 문자는 없었습니다.
- 화면에서 크기로 거부된 결과가 "(표시하지 않는 이름)"으로 보였습니다. 서버가 이름을 모르는 경우라 고른 파일 이름을 쓰도록 고쳤습니다.
- `page.tsx`에 업로드 화면을 넣지 않은 채 브라우저 확인을 시작해, 파일 입력을 찾지 못했습니다. 넣은 뒤 다시 확인했습니다.

## 6. 후속

- 운영 배포 뒤: curl 우회 차단(422), 플랫폼 413(4.5MB 초과)의 화면 안내, 크론 1회 실행 로그, 비공개 Blob에 실제로 저장되는지
- 5분 이상 쉰 뒤 첫 요청 지연
