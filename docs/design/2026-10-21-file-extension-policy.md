# 설계: 파일 확장자 차단 정책 · 업로드 강제

| 항목 | 내용 |
| --- | --- |
| 최종 갱신 | 2026-10-21 |
| 상태 | 정본. 구현은 이 문서를 따르고, 바뀌면 이 문서부터 고칩니다 |
| 참여 | 저 · Claude (위험 목록은 Codex 교차 검토) |
| 함께 볼 문서 | [요구사항 분석](../analysis/01-requirements.md) · [위험 목록](../analysis/02-risks.md) · [스택 비교](../analysis/03-stack.md) · [AI 작업 점검표](../ai-checklist.md) |

## 핵심 판단

1. 확장자는 정규화(NFKC → 소문자 → 끝 점·공백 제거)한 뒤 마지막 점 뒤로 판정합니다. 복합 확장자는 점 경계에서 최대 두 단까지, 정확히 같을 때만 막습니다. 확장자를 숨길 수 있는 안 보이는 글자와 이모지가 든 이름은 거부합니다. 판정은 순수 함수로 두고 서버가 강제하며, 브라우저 검사는 안내용입니다.
2. 파일 내용(시그니처)은 검사하지 않습니다. 업로드 파일을 비공개로 저장하고 내려받을 수 없게 해서, 확장자를 위장한 파일이 실행되거나 퍼질 경로를 두지 않았습니다.
3. 고정 확장자와 커스텀 확장자는 테이블을 나눴습니다. 둘이 겹치지 않는 규칙과 확장자 형식은 DB 트리거·CHECK로도 막고, 커스텀 200개 제한은 잠금으로 직렬화했습니다. 잠금이 없으면 동시 요청에서 201개가 되는 것을 실측으로 확인했습니다.
4. 인증 없이 누구나 정책을 바꿀 수 있는 공개 배포라서, 기본값 초기화와 추가 전용 변경 이력(DB 트리거로 강제)을 두고 하루 저장 50건 상한을 걸었습니다.
5. "마감 안에 동작을 확실히 하고, 내가 면접에서 설명할 수 있는가"를 기준으로 방문자 쿠키, CSRF 검사, 사람별 요청 제한, 화면 E2E 등을 범위에서 뺐습니다. 뺀 이유와 실제라면 어떻게 할지는 2.6에 남겼습니다.

## 목차

1. [목표와 완료 기준](#1-목표와-완료-기준)
2. [결정 표](#2-결정-표) — 판정 규칙, 정책 데이터, 업로드, 공개 배포 운영, 스택, 범위에서 뺀 것
3. [구조](#3-구조)
4. [판정 규칙 (순수 함수 명세)](#4-판정-규칙-순수-함수-명세)
5. [테이블 스키마](#5-테이블-스키마)
6. [주요 흐름](#6-주요-흐름)
7. [화면](#7-화면)
8. [API](#8-api)
9. [테스트 전략](#9-테스트-전략)
10. [환경 변수](#10-환경-변수)
11. [PR 순서](#11-pr-순서)
12. [문답 기록](#12-문답-기록)
13. [다른 서비스 사례](#13-다른-서비스-사례)
14. [배포 뒤 확인할 것](#14-배포-뒤-확인할-것)
15. [AI 오류 노트](#15-ai-오류-노트)

## 1. 목표와 완료 기준

확장자 차단 정책을 관리하는 화면과, 그 정책을 서버가 실제 업로드에서 강제하는 기능을 만듭니다. 화면 완성도보다 "무엇을 왜 막았는지"와 "AI 결과를 어떻게 검증했는지"를 남기는 데 힘을 씁니다.

완료 기준은 다음과 같습니다.

- 과제의 필수 요구(고정·커스텀 확장자 관리, 차단 확장자 업로드 거부)가 배포 URL에서 동작합니다. 요구 목록은 [요구사항 분석](../analysis/01-requirements.md) 2장에 있습니다.
- 판정 규칙(4장)은 순수 함수와 단위 테스트로 고정하고 서버가 강제합니다. 클라이언트 검사를 거치지 않은 직접 요청(curl)도 막힙니다.
- DB 제약·트리거(5장)와 200개 동시 추가는 통합 테스트로 고정합니다.
- `typecheck`·`lint`·`test`·`build`와 CI가 통과합니다.
- 제출물: README(실행 방법·스키마), 배포 URL, `CONSIDERATIONS.md`, `PROMPT_LOG.md`
- 마감은 2026-10-22입니다. 범위는 "마감 안에 동작을 확실히 하고, 내가 면접에서 설명할 수 있는가"로 정했습니다(2.6).

## 2. 결정 표

결정을 바꾸면 근거 열에 적힌 항목을 다시 봅니다. 근거 열의 위험 ID(N·U·P·D·X·O·G·V)는 [위험 목록](../analysis/02-risks.md), 문답 번호는 12장, 오류 번호는 15장, R로 시작하는 ID는 [요구사항 분석](../analysis/01-requirements.md)에 있습니다.

### 2.1 판정 규칙

| 결정 | 근거 |
| --- | --- |
| 업로드 파일명은 경로를 떼고(마지막 `/`·`\` 뒤) NFKC → 소문자 → 끝 점·공백 제거 순서로 정규화한 뒤, 마지막 점 뒤를 확장자로 봅니다. 점으로 시작하는 이름도 같습니다(`.exe`→`exe`). 점이 없으면 확장자가 없는 것으로 보고 통과시킵니다 | 문답 #2, 위험 N1·N4·N5·N6·N11·N19, 오류 E9 |
| 복합 확장자: 정책 항목은 1~2단(`[a-z0-9]+`)입니다. 파일명에 점이 두 개 이상이면 마지막 두 단을 복합으로 보고, 정확히 같을 때만 막습니다(`a.tar.gz` 차단, `atar.gz` 통과) | 문답 #1·#4, 오류 E1, 위험 N3 |
| 단일 확장자나 복합 확장자가 "차단 중인 고정 항목 ∪ 커스텀 항목"에 있으면 차단합니다 | R-B1 |
| 이런 파일명은 거부합니다: 빈 이름(`.`, `..` 포함), 이모지, 안 보이는 글자(제어·서식 문자, 줄·문단 구분자, 유니코드가 "보이지 않음"으로 지정한 글자 — 예외 없음), Windows 금지 문자(`< > : " \| ? *`), NFC 기준 255자 초과 | 문답 #31·#34, 위험 N8·N10·N12·N14·N21, 오류 E15 |
| 영어와 똑같이 생긴 다른 나라 글자(키릴 `е` 등)는 바꾸거나 막지 않습니다. 확장자 문자열이 달라 Windows도 실행 파일로 보지 않습니다 | 문답 #31, 위험 N22 |
| 커스텀 입력은 NFKC → 앞뒤 공백 제거 → 소문자 → 앞쪽 점 제거 뒤 `^[a-z0-9]+(\.[a-z0-9]+)?$`로 검사합니다. 원문 20자 이하, 결과 1~20자입니다. `*`는 안내와 함께 거부합니다 | 위험 P1, 오류 E12(순서) |
| 커스텀에 고정 확장자를 넣으면 거부하고 고정 쪽으로 안내합니다 | 문답 #3, 위험 P2 |
| 내용(시그니처) 검사는 하지 않고 확장자 정책으로만 판정합니다. 비공개로 저장하고 내려받기가 없어 위장 파일이 실행되거나 퍼질 경로가 없습니다. 저는 정책·법적 적절성과 허용 목록 방향을 이유로 확장자 정책만 가자고 했습니다 | 문답 #5, 위험 N18, 오류 E2·E4·E8 |
| 순수 함수는 확장자 파싱·정규화와 정책 판정입니다. 서버가 강제하고, 클라이언트는 같은 함수를 즉시 안내용으로만 씁니다 | 문답 #5, 위험 U1·X7 |

### 2.2 정책 데이터

| 결정 | 근거 |
| --- | --- |
| 고정·커스텀 두 테이블로 나눕니다. 고정은 미리 정의된 목록과 현재 상태이고, 커스텀은 방문자가 추가한 목록입니다. 생애가 달라 나눴습니다 | 문답 #19, 13장 사례 |
| 커스텀에 고정 확장자가 들어오면 트리거가 고정 테이블을 조회해 거부합니다. 고정 목록의 출처는 `fixed_extension` 테이블 하나입니다 | 문답 #20, 위험 P2·P8 |
| 확장자 형식을 DB CHECK로도 강제합니다. 정규화되지 않은 값은 저장되지 않습니다 | 문답 #21, 위험 P1·P3 |
| 정책 쓰기(고정 토글, 커스텀 추가·삭제, 초기화)는 모두 advisory lock 하나(트랜잭션 단위)로 직렬화합니다. 200개 제한은 잠금 안에서 개수를 확인한 뒤 추가합니다 | 문답 #18, 위험 P5, 오류 E6 |
| 고정 체크는 "원하는 상태"를 보냅니다. 상태가 같으면 변경도 이력도 남기지 않습니다. 커스텀 삭제는 멱등입니다(없어도 성공) | 위험 P10·P11 |
| 시드는 없을 때만 넣습니다(`ON CONFLICT DO NOTHING`). 재배포가 체크 상태를 덮지 않게 하기 위해서입니다 | 위험 P9 |
| 공개 편집: 인증 없이 정책 하나를 두고, 누구나 "기본값으로 초기화"(고정 전부 해제, 커스텀 전부 삭제)를 할 수 있습니다. 누구나 차단을 해제할 수 있다는 위험은 받아들였습니다 | 문답 #10, 위험 D1·D2·D3·D14 |
| 변경 이력은 실무형 감사 로그입니다. 추가 전용을 DB 트리거로 강제합니다(UPDATE 거부, 보관 30일 전 DELETE 거부, TRUNCATE 거부). 정책 변경과 같은 트랜잭션에서 기록합니다. 인증·쿠키가 없어 식별할 수단이 없으므로 행위자는 기록하지 않습니다. 화면에는 최근 20건을 보여 줍니다 | 문답 #11·#22·#25·#28, 위험 P7·P13 |

### 2.3 업로드

| 결정 | 근거 |
| --- | --- |
| 업로드 파일은 Vercel Blob 비공개 스토어에 서버를 거쳐 저장합니다. 경로는 `uploads/<uuid>`(원래 이름·확장자 없음), `Content-Type`은 `application/octet-stream`입니다. 내려받기는 없습니다 | 문답 #6·#14, 위험 U4·U5·U7·N17·D5 |
| 파일은 4MiB(4,194,304바이트) 이하, 요청당 하나입니다 | 문답 #16, 위험 U2·U3 |
| 업로드 시도는 전부 기록합니다(`stored` / `blocked` / `rejected` + 사유 코드). 24시간 보관하고, 이름이 잘못된 시도는 이름을 저장하지 않습니다 | 문답 #23, 위험 D13·O2 |
| 하루 저장 총량은 50건입니다(KST 자정 경계, 저장 성공 기준). 잠금 안에서 오늘 저장된 시도 수를 세고, 행을 먼저 기록해 예약한 뒤 Blob에 저장합니다 | 문답 #16·#25, 위험 D4·D19 |
| 업로드 결과는 올린 그 화면에서만 보입니다(새로고침하면 사라짐). 서버는 시도를 기록하지만 조회 API는 두지 않습니다 | 문답 #12·#28, 위험 D13 |
| 정책 변경은 이미 저장된 시도에 소급하지 않습니다 | 위험 U10 |

### 2.4 공개 배포 운영

| 결정 | 근거 |
| --- | --- |
| 방문자 쿠키를 쓰지 않습니다. 이력의 "나 / 다른 방문자" 구분과 "내 시도" 목록은 범위에서 뺐습니다 | 문답 #28, 위험 D13·D15 |
| IP는 읽지도 저장하지도 않습니다 | 문답 #24, 위험 D12·D17 |
| 사람별 요청 제한은 이번 범위에서 빼고 문서로만 남깁니다. 실제라면 IP HMAC 해시 키와 시간 창 카운터로 합니다. 하루 저장 50건 전체 상한은 유지합니다 | 문답 #24, 위험 D3·D6 |
| 상태를 바꾸는 요청은 POST·PUT·DELETE만 씁니다(크론의 GET은 `CRON_SECRET` Bearer). 쿠키·인증이 없어 막을 대상이 없으므로 CSRF `Origin` 검사는 하지 않습니다(2.6) | 문답 #29, 위험 D8 |
| 보안 헤더: `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. 검색 노출은 `noindex`와 `robots.txt`로 막습니다 | 위험 D7·D9 |
| 정책·이력 응답에는 `Cache-Control: no-store`를 붙입니다. 바뀐 정책이 바로 보여야 하기 때문입니다 | 위험 D16 |
| 정리는 Vercel Cron으로 하루 한 번 합니다(`CRON_SECRET`). 만료된 시도 행의 `blob_pathname`으로 Blob을 지우고 행을 지우며, 30일 지난 이력도 지웁니다. 누락·중복 실행에 안전하게(멱등) 만듭니다. Blob 목록은 훑지 않습니다(2.6) | 문답 #28, 위험 U8·U9·P13 |
| `/api/health`(DB 왕복)를 둡니다. 자동 감시 워크플로는 두지 않고, 면접 전날과 30분 전에 수동으로 확인합니다(2.6) | 문답 #27, 위험 D10 |
| 오류 응답은 정해 둔 문구만 보내고 자세한 내용은 서버 로그에 남깁니다. 업로드 판정 로그에는 결과·사유 코드·확장자·크기만 남기고, 원래 이름 전체는 남기지 않습니다 | 위험 U13·O2 |

### 2.5 스택과 작업 방식

| 결정 | 근거 |
| --- | --- |
| Vercel Hobby + Next.js App Router 풀스택(Route Handler) + Neon Free(PostgreSQL) + Vercel Blob입니다. 함수·DB·Blob 지역은 싱가포르입니다. Hobby에서 함수 지역을 바꿀 수 있는지는 뼈대 PR의 배포에서 봅니다 | 문답 #13·#14·#15, `03-stack.md` |
| DB 접근은 `pg`(node-postgres) + Neon 풀링 연결 문자열(`-pooler`) + Vercel `attachDatabasePool`입니다. 3단계에서 고른 Neon 서버리스 드라이버(HTTP)를 바꿨습니다. 대화형 트랜잭션과 클라우드 없는 테스트가 필요했기 때문입니다 | 문답 #18, 위험 O4·P5 |
| 마이그레이션은 SQL 파일(`migrations/NNN_*.sql`)과 얇은 실행기입니다. 이 SQL이 스키마 정본이고 README로 옮깁니다 | 문답 #17, 위험 G7 |
| 로컬·테스트 DB는 Docker Postgres입니다. 저장소 어댑터는 Vercel Blob(배포)과 메모리(로컬·테스트·플랜 B) 두 개라서, 플랜 B(로컬 실행)가 클라우드 없이 됩니다. 메모리라 재시작하면 파일이 사라지지만 시연에는 충분합니다 | 문답 #18·#28, `03-stack.md` 8장 |
| 구현은 TDD(red → green)로 합니다. 테스트 케이스는 외부 근거(1단계 실측, Microsoft 이름 규칙·경로 정규화, OWASP)에서 먼저 뽑습니다 | 시작 프롬프트, 위험 V1 |
| 작업 위치는 `~/dev/flow-assignment`, 기준 브랜치는 `main`입니다. 기능 단위 브랜치 → PR → 제가 머지합니다. 저장소는 public이고 push마다 민감 정보를 점검합니다 | 시작 프롬프트, 문답 #8·#9 |
| 하네스는 guksu-harness 5.1.0(Claude Code·Codex)입니다. 커밋·푸시는 허용하고, 작성자 표기와 `.env*` 읽기는 막고, PR마다 `docs/history`에 기록합니다 | 시작 프롬프트 |

### 2.6 범위에서 뺀 것 (문서로만)

범위를 줄인 기준은 "마감 안에 동작을 확실히 하고, 내가 면접에서 설명할 수 있는가"입니다. 마감은 2026-10-22입니다. 범위를 다시 보자고 하면서 제가 한 말은 이렇습니다.

> 이 과제에서 중요한건 기능과 설계판단이니 말이지.
>
> 그리고 지금 처음 과제요구사항보다 범위가 커지고 복잡도가 높아지는 거 같아.

| 뺀 것 | 왜 안 했나 | 실제라면 | 관련 |
| --- | --- | --- | --- |
| 사람별 요청 제한 | 과제 범위를 넘는다고 판단했습니다. 하루 저장 50건 전체 상한만 둡니다 | 원본 IP 대신 비밀값을 섞은 HMAC 해시 키로 시간 창별 횟수 | 문답 #24, D3·D6 |
| 방문자 쿠키 (이력의 "나 / 다른 방문자", 새로고침 뒤에도 남는 "내 시도" 목록) | 토큰 발급·해시·조회 범위 강제·캐시 주의까지 따라와 구현·설명 비용이 큽니다. 업로드 결과는 그 화면에서 바로 보이므로 필수 요구(R-B2)는 충족합니다 | 서버가 만든 256비트 토큰을 `HttpOnly` 쿠키로, DB엔 해시만, 조회 범위는 서버가 강제(제한적 접근 토큰) | 문답 #28, D13·D15 |
| CSRF `Origin` 검사 | 쿠키·인증이 없으면 외부 사이트를 거친 요청과 직접 요청이 같아서 막을 대상이 없습니다 | 쿠키나 인증이 생기는 순간 `Origin`/`Sec-Fetch-Site` 검사 + `SameSite` | 문답 #29, D8 |
| 응답 순번 처리 | 화면이 하나라 동시 조회가 거의 없습니다. 실패하면 서버 상태를 다시 읽는 것(X3)으로 충분합니다 | 조회마다 순번을 매겨 마지막 응답만 반영 | 문답 #27, X9 |
| 자동 상태 감시 워크플로 | 예약 실행은 누락되거나 60일 무활동이면 멈춰서 믿을 수 없습니다. 면접 전 수동 확인이 더 확실합니다 | 외부 가용성 감시 + 알림 | 문답 #27, D10 |
| 화면 E2E(Playwright) | 판단은 서버와 순수 함수에 있고 단위·통합·API 테스트로 고정합니다. 화면 흐름은 배포 URL에서 수동으로 확인해 PR에 남깁니다 | 핵심 흐름 몇 개를 E2E로 | 문답 #27, 9장 |
| Blob 목록을 훑는 고아 정리 | 기록(예약) → 저장 순서라 Blob에만 남는 고아는 설계상 생기지 않습니다. 저장에 실패하면 삭제를 한 번 시도합니다 | 저장소 수명 주기 규칙 또는 목록 훑기 | 문답 #28, U8·U9 |
| 로컬 디스크 저장소 어댑터 | 메모리 어댑터로 로컬 실행과 플랜 B가 됩니다 | 같은 저장소 인터페이스에 디스크 어댑터 추가 | 문답 #28 |

## 3. 구조

화면 하나, Route Handler, 순수 함수, 서버 모듈로 나눕니다. 판정은 순수 함수에만 있고, 브라우저와 서버가 같은 함수를 씁니다.

```text
브라우저 ─(같은 순수 함수로 즉시 안내)─┐
   │ HTTPS                              │
Next.js App Router (Vercel 함수, 싱가포르)
   ├─ app/page.tsx                화면 하나: 정책 · 이력 · 업로드 시험 · 이번 업로드 결과
   ├─ app/api/**/route.ts         Route Handler (8장 API)
   ├─ src/domain/*                순수 함수 — 파일명 해석, 커스텀 입력 정규화, 정책 판정, 오류 코드
   ├─ src/server/db.ts            pg Pool + attachDatabasePool
   ├─ src/server/policy-repo.ts   정책·이력 (잠금 트랜잭션)
   ├─ src/server/uploads.ts       업로드 처리: 해석 → 판정 → 기록·하루 총량 → 저장
   └─ src/server/storage.ts       저장소 인터페이스: Vercel Blob / 메모리
        │                             │
   Neon PostgreSQL (풀러)        Vercel Blob (비공개)
migrations/NNN_*.sql · scripts/migrate.mjs · docker-compose.yml(로컬 Postgres)
```

## 4. 판정 규칙 (순수 함수 명세)

아래 표가 그대로 단위 테스트가 됩니다. 구현보다 테스트를 먼저 씁니다. 코드는 `src/domain/`에 기능별 파일 네 개로 나눴습니다: 파일 이름 읽기(`upload-name.ts`), 커스텀 입력 검사(`custom-extension.ts`), 막을지 판단(`policy.ts`), 오류 안내 문구(`messages.ts`). 실패는 오류를 던지지 않고 `{ ok: false, code }` 같은 결과로 돌려줍니다. 테스트는 각 파일 옆의 `*.test.ts`입니다.

### 4.1 업로드 파일명 → 확장자

처리 순서는 이렇습니다.

1. 경로를 뗍니다(마지막 `/`·`\` 뒤).
2. 거부 검사를 합니다: 빈 이름 → 이모지 → 안 보이는 글자 → 금지 문자 → 255자 초과(표시용 NFC 기준). 이모지를 안 보이는 글자보다 먼저 보는 것은 👩‍💻 같은 이모지 안에 안 보이는 이음 글자가 들어 있어서, 안내를 "이모지"로 하기 위해서입니다.
3. NFKC → 소문자 → 끝 점·공백 제거로 정규화합니다.
4. 점으로 나눠 마지막 단을 단일 확장자로 봅니다. 점이 두 개 이상이고 마지막 두 단이 모두 비어 있지 않으면 마지막 두 단을 복합 확장자로 봅니다.

| 입력 | 결과 | 단일 | 복합 | 근거 |
| --- | --- | --- | --- | --- |
| `report.PDF` | 해석 | `pdf` | — | N1 |
| `file.exe.txt` | 해석 | `txt` | `exe.txt` | N2 — `exe` 차단만으로는 통과 |
| `photo.jpg.exe` | 해석 | `exe` | `jpg.exe` | N2 |
| `a.tar.gz` / `atar.gz` | 해석 | `gz` / `gz` | `tar.gz` / — | N3, E1 |
| `.env` / `.exe` / `.tar.gz` | 해석 | `env` / `exe` / `gz` | — / — / `tar.gz` | N4, 문답 #2 |
| `Makefile` | 해석 | — | — | N5 — 통과 |
| `evil.exe.` · `evil.exe ` | 해석 | `exe` | — | N6 |
| `evil.exe．`(U+FF0E) · `evil.exe`+U+3000 · `evil.exe`+U+00A0 | 해석 | `exe` | — | N19, E9 |
| `ｅｖｉｌ.ｅｘｅ` | 해석 | `exe` | — | N7 |
| `..\evil.exe` · `C:\fakepath\a.exe` | 해석 | `exe` | — | N11 |
| `naver.com.png` | 해석 | `png` | `com.png` | N2 — 고정 `com`에 걸리지 않음 |
| `©회사소개.pdf` · `제품™.pdf` | 해석 | `pdf` | — | ©·™·®는 기본이 글자 모양이라 허용 |
| `evil.еxe`(키릴 е) | 해석 | `еxe` | — | N22 — 막지 않음 |
| `invoice` + U+202E + `fdp.exe` · 널 포함 | 거부 `NAME_CONTROL_CHAR` | | | N8 |
| `evil.ex` + U+00AD(soft hyphen) + `e` · `evil.ex` + U+200B + `e` · `evil.exe` + U+200E(LRM) · `evil.ex` + U+3164(한글 채움) + `e` | 거부 `NAME_CONTROL_CHAR` | | | N21, E15 — 화면엔 `evil.exe` |
| `👩‍💻.txt` · `❤️.txt` · `🇰🇷.pdf` · `1️⃣.txt` | 거부 `NAME_EMOJI` | | | 문답 #34 |
| `🔥최종 기획안.pptx` · `✅ 확인완료.xlsx` | 거부 `NAME_EMOJI` | | | 문답 #34 — 정상 파일도 막히는 비용 |
| `❤사랑.jpg`(U+2764만) / `❤️사랑.jpg`(U+FE0F 붙음) | 해석 / 거부 `NAME_EMOJI` | `jpg` / | | 경계: 기본이 글자 모양인 ❤는 허용, 이모지 모양 선택자가 붙으면 거부 |
| `evil.exe::$DATA` | 거부 `NAME_FORBIDDEN_CHAR` | | | N12 |
| (빈 이름) · `.` · `..` · `...` | 거부 `NAME_EMPTY` | | | N14 |
| NFC 256자 이름 | 거부 `NAME_TOO_LONG` | | | N10 |

### 4.2 정책 판정

입력은 4.1의 해석 결과와 차단 목록(고정 중 `blocked`인 것, 커스텀 전부)입니다. 출력은 `{ blocked: false }` 또는 `{ blocked: true, matched: 'tar.gz', source: 'custom' }`입니다. 복합과 단일이 둘 다 걸리면 더 구체적인 규칙인 복합을 사유로 보여 줍니다.

### 4.3 커스텀 입력 정규화

처리 순서는 NFKC → 앞뒤 공백 제거 → 소문자 → 앞쪽 점 제거 → 형식·길이 검사입니다. 1단계 초안은 NFKC를 나중에 해서 `．sh`(전각 마침표로 시작)가 형식 오류가 됐습니다. Claude가 이 장을 쓰다 문제를 찾아 순서를 바꿨습니다([AI 오류 노트](#15-ai-오류-노트)).

| 입력 | 결과 |
| --- | --- |
| `sh` · ` .SH ` · `．sh` | `sh` |
| `TAR.GZ` · `．．tar.gz` | `tar.gz` |
| `ｅｘｅ` | `exe` → 고정이라 `FIXED_EXTENSION` |
| `pkg.tar.zst` | `TOO_MANY_SEGMENTS` |
| `tar..gz` · `tar.` | `INVALID_FORMAT` |
| `*.exe` | `WILDCARD` ("별표·점 없이 확장자만 입력") |
| `한글` · `s h` · `sh!` | `INVALID_CHAR` |
| (빈 입력) · `...` | `EMPTY` |
| 원문 21자 이상 | `TOO_LONG` |

## 5. 테이블 스키마

`migrations/001_policy.sql`, `002_upload_attempt.sql`의 정본입니다. README에 같은 내용을 옮깁니다.

### 5.1 `fixed_extension` — 고정 확장자 목록과 현재 상태

```sql
CREATE TABLE fixed_extension (
  ext        varchar(20) PRIMARY KEY
             CHECK (ext ~ '^[a-z0-9]+(\.[a-z0-9]+)?$'),
  blocked    boolean     NOT NULL DEFAULT false,    -- 과제: 기본 unCheck
  sort_order smallint    NOT NULL UNIQUE,           -- 화면 순서
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fixed_extension (ext, sort_order) VALUES
  ('bat',1),('cmd',2),('com',3),('cpl',4),('exe',5),('scr',6),('js',7)
ON CONFLICT (ext) DO NOTHING;                       -- 재실행해도 체크 상태 유지(P9)
```

### 5.2 `custom_extension` — 커스텀 확장자

```sql
CREATE TABLE custom_extension (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ext        varchar(20) NOT NULL UNIQUE                    -- 중복 방지(P3)
             CHECK (ext ~ '^[a-z0-9]+(\.[a-z0-9]+)?$'),     -- 정규화된 값만(P1)
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 200개 제한은 잠금 트랜잭션에서 강제(6장). 제약으로 표현하지 않는다
```

아래는 겹침 방지 트리거입니다. 커스텀 쪽에 추가·수정할 때 고정 테이블을 조회해 거부합니다. 반대 방향(나중에 고정 목록에 항목을 더할 때 같은 커스텀이 이미 있는 경우)도 같은 함수로 거부해서, 그런 마이그레이션은 조용히 겹치지 않고 실패합니다.

```sql
CREATE FUNCTION reject_extension_overlap() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'custom_extension'
     AND EXISTS (SELECT 1 FROM fixed_extension WHERE ext = NEW.ext) THEN
    RAISE EXCEPTION 'fixed extension: %', NEW.ext USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'fixed_extension'
     AND EXISTS (SELECT 1 FROM custom_extension WHERE ext = NEW.ext) THEN
    RAISE EXCEPTION 'custom extension exists: %', NEW.ext USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER custom_extension_not_fixed
  BEFORE INSERT OR UPDATE OF ext ON custom_extension
  FOR EACH ROW EXECUTE FUNCTION reject_extension_overlap();
CREATE TRIGGER fixed_extension_not_custom
  BEFORE INSERT OR UPDATE OF ext ON fixed_extension
  FOR EACH ROW EXECUTE FUNCTION reject_extension_overlap();
```

### 5.3 `policy_audit_log` — 정책 변경 이력 (추가 전용)

```sql
CREATE TABLE policy_audit_log (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  action      text        NOT NULL CHECK (action IN (
                'fixed_blocked','fixed_unblocked',
                'custom_added','custom_removed','policy_reset')),
  ext         varchar(20),                        -- 초기화만 NULL
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb, -- 초기화 직전 상태 등
  request_id  uuid        NOT NULL,
  CHECK ((action = 'policy_reset') = (ext IS NULL))
);
CREATE INDEX policy_audit_log_occurred_at_idx ON policy_audit_log (occurred_at DESC);

CREATE FUNCTION policy_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'policy_audit_log is append-only';
  END IF;
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'policy_audit_log cannot be truncated';
  END IF;
  IF OLD.occurred_at > now() - interval '30 days' THEN   -- 보관 30일(문답 #25)
    RAISE EXCEPTION 'policy_audit_log rows are kept for 30 days';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER policy_audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON policy_audit_log
  FOR EACH ROW EXECUTE FUNCTION policy_audit_log_append_only();
CREATE TRIGGER policy_audit_log_no_truncate          -- 행 트리거는 TRUNCATE를 못 잡는다
  BEFORE TRUNCATE ON policy_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION policy_audit_log_append_only();
```

"이전 → 이후"는 `action`이 담습니다(`fixed_blocked` = 해제 → 체크). 초기화는 `detail`에 직전 상태(`{"fixed_blocked":[…],"custom":[…]}`)를 남깁니다.

### 5.4 `upload_attempt` — 업로드 시도 (24시간 보관)

```sql
CREATE TABLE upload_attempt (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text        NOT NULL CHECK (status IN ('stored','blocked','rejected')),
  reason_code    text,                 -- blocked/rejected 사유 (9장 오류 코드)
  original_name  varchar(255),         -- NFC 표시용. 이름이 잘못된 시도는 NULL
  ext            varchar(20),          -- 해석한 단일 확장자(형식 밖이면 NULL)
  matched_rule   varchar(20),          -- 차단에 걸린 정책 항목 (예: tar.gz)
  matched_source text CHECK (matched_source IN ('fixed','custom')),
  size_bytes     integer     NOT NULL CHECK (size_bytes >= 0),
  blob_pathname  text        UNIQUE,   -- stored만. uploads/<uuid>
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL, -- created_at + 24시간
  CHECK ((status = 'stored')  = (blob_pathname IS NOT NULL)),
  CHECK ((status = 'stored')  = (reason_code IS NULL)),
  CHECK ((status = 'blocked') = (matched_rule IS NOT NULL)),
  CHECK ((matched_rule IS NULL) = (matched_source IS NULL)),
  CHECK (status <> 'stored' OR size_bytes <= 4194304),
  CHECK (expires_at > created_at)
);
CREATE INDEX upload_attempt_expires_idx ON upload_attempt (expires_at);                  -- 정리
CREATE INDEX upload_attempt_stored_idx  ON upload_attempt (created_at) WHERE status = 'stored'; -- 하루 총량
```

multipart가 아니거나, 파일 필드가 없거나, 파일 필드가 둘 이상인 요청은 시도로 보지 않고 400만 응답하며 기록하지 않습니다. 플랫폼이 413으로 먼저 막은 요청(4.5MB 초과)은 함수에 닿지 않아 기록할 수 없습니다.

### 5.5 `schema_migrations` — 마이그레이션 실행기

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text        PRIMARY KEY,   -- 파일 이름 (001_policy.sql)
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

## 6. 주요 흐름

### 정책 쓰기 (모든 쓰기 공통)

```text
BEGIN
SELECT pg_advisory_xact_lock(<정책 잠금 키>)     -- 트랜잭션 단위. 커밋 때 풀림
-- 커스텀 추가 예
  고정에 있나?  → 409 FIXED_EXTENSION
  커스텀에 있나? → 409 DUPLICATE_EXTENSION
  커스텀 200개? → 409 CUSTOM_LIMIT_REACHED
  INSERT custom_extension → INSERT policy_audit_log
COMMIT
```

2026-10-21에 Postgres 17 Docker로 실측했습니다. 199개 상태에서 "개수 확인 → 1초 대기 → 200 미만이면 추가"를 두 세션에서 동시에 실행했더니, 잠금이 없으면 201개가 됐고 `pg_advisory_xact_lock`을 걸면 200개였습니다. Codex가 위험 목록 교차 검토에서 지적한 문제를 그대로 재현한 것입니다. 5장 DDL도 같은 컨테이너에 그대로 적용해 CHECK·UNIQUE·트리거가 설계대로 거부하는 것을 확인했습니다(작업 기록 `docs/history/2026-10-21-docs-design.md`).

트랜잭션 단위 잠금은 Neon 풀러(PgBouncer 트랜잭션 모드)에서도 동작한다고 판단했습니다. Neon 문서는 세션 단위 잠금만 쓸 수 없다고 적고 있어서, 이 판단은 추론입니다. 로컬 Docker에는 풀러가 없으므로 **배포 뒤 동시 요청으로 다시 확인합니다**(14장).

### 업로드

```text
1. multipart 파싱 — 파일 필드가 정확히 하나가 아니면 400 (기록 안 함)
2. 4MiB 초과            → rejected FILE_TOO_LARGE (413)
3. 파일명 해석(4.1) 실패 → rejected NAME_* (400)
4. 정책 읽기 + 판정(4.2) → blocked EXTENSION_BLOCKED (422)
5. BEGIN; 업로드 잠금; 오늘(KST) 저장 수 ≥ 50 → rejected DAILY_LIMIT_REACHED (429)
   아니면 stored 행 먼저 기록(예약); COMMIT
6. Blob put (비공개, uploads/<uuid>, octet-stream)
   실패 → 행을 rejected STORAGE_ERROR로 바꾸고 그 경로 삭제를 한 번 시도 (503)
7. 201
```

행을 먼저 기록하므로 Blob에 객체만 남는 고아는 생기지 않습니다. 6에서 함수가 죽으면 "stored인데 객체 없음" 행이 남을 수 있고, 이 행은 24시간 뒤 정리됩니다.

### 정리 (크론, 하루 1회)

만료된 시도 행(`expires_at < now()`)의 `blob_pathname`을 모아 Blob에서 지우고(없는 경로도 성공으로 봄), 그 행들을 지운 뒤, `DELETE policy_audit_log WHERE occurred_at < now() - 30일`을 실행합니다(트리거가 허용하는 범위). 몇 번을 돌려도 결과가 같습니다.

## 7. 화면

한 페이지에 위에서 아래로 다섯 영역을 둡니다. 처음 정책은 브라우저가 조회 API로 불러옵니다(문답 #36). 화면과 curl이 같은 API를 씁니다.

1. 고정 확장자 — 체크박스 7개(`sort_order` 순). 저장 중에는 비활성, 실패하면 서버 상태를 다시 읽습니다.
2. 커스텀 확장자 — 입력(`maxLength=20`)과 추가 버튼, `n/200`, 칩 + `X`. 입력하는 즉시 4.3 함수로 안내하고, 한글 조합 중 Enter는 무시합니다. 200개가 차면 입력과 버튼을 비활성화합니다.
3. 최근 변경 이력 — 20건, 시각은 KST. "기본값으로 초기화" 버튼(확인 대화상자)
4. 업로드 시험 — 파일 하나를 고르면 같은 순수 함수로 크기·이름·판정을 즉시 안내하고, 서버 결과를 사유와 함께 보여 줍니다.
5. 이번 업로드 결과 — 이 화면에서 올린 것만, 상태 배지(저장됨 / 차단됨 / 거부됨)와 사유. 새로고침하면 사라집니다. 파일명은 이스케이프합니다.

첫 정책 조회에 실패하면 빈 목록이 아니라 오류 화면을 보여 줍니다. 디자인 다듬기는 하지 않고, 기본 요소·키보드 조작·`aria-live`·좁은 화면 1열만 챙깁니다.

## 8. API

모든 응답에 `Cache-Control: no-store`를 붙입니다. 오류 형식은 `{ "error": { "code": "...", "message": "...", "details": { } } }`입니다. `message`는 방문자에게 보여 줄 한국어 문구이고, `code`는 화면과 테스트가 기대는 고정 값입니다.

| 메서드·경로 | 요청 | 성공 | 실패 |
| --- | --- | --- | --- |
| `GET /api/policy` | — | 200 `{ fixed:[{ext,blocked}], custom:[{ext,createdAt}], customCount, customLimit:200, maxLength:20 }` | 503 |
| `PUT /api/policy/fixed/{ext}` | `{ blocked: boolean }` | 200 `{ ext, blocked, changed }` | 400 `INVALID_BODY`, 404 `UNKNOWN_FIXED_EXTENSION` |
| `POST /api/policy/custom` | `{ ext: string }` | 201 `{ ext, createdAt, customCount }` | 400 `INVALID_EXTENSION`(details.reason: 4.3), 409 `FIXED_EXTENSION` / `DUPLICATE_EXTENSION` / `CUSTOM_LIMIT_REACHED` |
| `DELETE /api/policy/custom/{ext}` | — | 204 (없어도) | 400 `INVALID_EXTENSION` |
| `POST /api/policy/reset` | — | 200 정책 전체 | — |
| `GET /api/policy/audit?limit=20` | — | 200 `{ items:[{id,occurredAt,action,ext}] }` | — |
| `POST /api/uploads` | multipart `file` | 201 `{ attempt }` | 400 `INVALID_REQUEST` / `NAME_*`, 413 `FILE_TOO_LARGE`, 422 `EXTENSION_BLOCKED`(details: matched, source), 429 `DAILY_LIMIT_REACHED`, 503 `STORAGE_ERROR` — 시도 응답에는 `attempt` 포함 |
| `GET /api/health` | — | 200 `{ ok:true, db:"ok", dbMs }` | 503 |
| `GET /api/cron/cleanup` | `Authorization: Bearer <CRON_SECRET>` | 200 삭제 건수 | 401 |

쿠키는 쓰지 않고, `Origin` 검사도 하지 않습니다(2.6).

DB 오류는 모든 API에서 503 `SERVER_ERROR`와 정해 둔 문구로 응답하고, 원인은 요청 번호와 함께 서버 로그에만 남깁니다. 정책 API의 본문은 짧은 JSON 객체라 1KB를 넘으면 `INVALID_BODY`로 거부합니다. 이력 조회 개수는 1~50건으로 맞춥니다.

## 9. 테스트 전략

| 층 | 도구 | 대상 |
| --- | --- | --- |
| 단위 | Vitest | 4장 표 전체(먼저 red), 오류 코드 → 문구 |
| 통합 | Vitest + 로컬 Docker Postgres(개발용 DB를 같이 씀) | 마이그레이션 적용, CHECK·UNIQUE·트리거(겹침, 추가 전용, TRUNCATE), 200개 동시 추가(199개에서 동시 2건 → 1건만 성공), 하루 50건 경계, 시드 재실행 |
| API | Vitest + Route Handler 직접 호출 + 메모리 저장소 | 상태 코드·오류 코드, curl과 같은 직접 요청이 막히는지(U1) |
| 화면 | 배포 URL에서 수동 확인, 결과를 PR에 기록 (E2E는 범위에서 뺌 — 2.6) | 체크 → 새로고침 유지(R-A3), 추가·삭제·새로고침(R-A6·R-A8), 차단 업로드 사유 표시(R-B2) |
| 배포 확인 | 수동 + 스크립트 | 14장 |

테스트는 두 묶음입니다. DB 없이 도는 판정 규칙 테스트(unit)와 로컬 DB가 필요한 테스트(db)입니다. db 묶음은 개발용 DB를 같이 쓰고 데이터를 지우므로, DB 주소가 내 컴퓨터(localhost)가 아니면 시작하지 않습니다(위험 V5). 데이터를 지우는 도우미도 지우기 전에 한 번 더 확인합니다.

CI(GitHub Actions)는 Postgres 서비스 컨테이너를 띄워 `typecheck`·`lint`·`migrate`·`test`를 돌립니다. `typecheck`·`lint`·`test`는 하네스 검증 명령으로도 씁니다.

## 10. 환경 변수

값은 `.env.local`(로컬, AI는 읽지 않음)과 Vercel 프로젝트 설정에만 둡니다. `.env.example`에는 이름과 로컬 Docker 계정만 둡니다.

| 이름 | 용도 | 비고 |
| --- | --- | --- |
| `DATABASE_URL` | 앱의 Postgres 접속 | 배포: Neon 풀링 문자열(`-pooler`). 로컬: Docker |
| `DATABASE_URL_UNPOOLED` | 마이그레이션 | 배포: Neon 직접 연결 문자열. 비워 두면 `DATABASE_URL` |
| `BLOB_READ_WRITE_TOKEN` 또는 OIDC(`BLOB_STORE_ID`·`VERCEL_OIDC_TOKEN`) | Blob | 스토어를 프로젝트에 연결하면 Vercel이 넣음. 없으면 메모리 어댑터 |
| `CRON_SECRET` | 크론 인증 | 16자 이상 무작위 |
| `TEST_DATABASE_URL` | DB 테스트 주소(선택) | 비우면 로컬 Docker 기본값. 로컬 주소만 허용하고, 셸의 `DATABASE_URL`은 테스트에서 보지 않음 |

## 11. PR 순서

남은 작업은 PR 다섯 개로 나눴습니다(12장 문답 기록의 마지막 항목). 이 설계 문서는 그 앞의 별도 PR입니다.

| 순서 | 브랜치 | 내용 | 끝났다는 증거 |
| --- | --- | --- | --- |
| 1 | `chore/skeleton` | 1일차 배포: Next.js·TS·ESLint·Vitest 뼈대, `pg` 풀 + `attachDatabasePool`, 마이그레이션 실행기 + `schema_migrations`, `/api/health`, 빈 화면, 보안 헤더·`noindex`, `docker-compose.yml`, `.env.example`, CI. Neon·Vercel 프로젝트·Blob 스토어 생성과 환경 변수 등록은 한 번에 묶어 제 확인을 받습니다 | 배포 URL에서 `/api/health` 200, 함수 지역·첫 요청 지연 측정 기록 |
| 2 | `feat/extension-rules` | 4장 순수 함수 TDD | 4장 표 전부 통과 |
| 3 | `feat/policy` | `001_policy.sql`, 정책 저장소(잠금), 정책·이력 API, 정책·이력 화면(즉시 안내, 오류·로딩 상태) | 통합 테스트(트리거·동시 추가) 통과, 배포 URL 수동 확인(R-A1~R-A10) |
| 4 | `feat/upload` | `002_upload_attempt.sql`, 저장소 어댑터 2종, 업로드 API, 하루 총량, 업로드 화면, 정리 크론(`vercel.json`) | 차단·허용·하루 총량 테스트, 배포에서 curl 우회 차단, 크론 1회 실행 로그 |
| 5 | `docs/submission` | README(첫 화면에 핵심 판단·문서 읽는 순서, 실행 방법·스키마), `CONSIDERATIONS.md`(맨 위 "스스로 찾은 위험 Top 5"), PROMPT_LOG 마무리 | 깨끗한 클론에서 README대로 실행(G7) |

## 12. 문답 기록

AskUserQuestion으로 정한 것을 순서대로 남깁니다. 모두 2026-10-21에 정했습니다. "추천안 그대로"는 제가 따로 이유를 말하지 않은 선택이고, 옆에 적은 추천 근거는 Claude가 선택지에 붙인 설명입니다. 제가 한 말은 따옴표 안에 원문 그대로 둡니다. `PROMPT_LOG.md` 3장에는 제 말이 들어간 결정만 추렸습니다.

| # | 단계 | 질문 | 제시된 선택지 | 선택 | 제 말·비고 |
| --- | --- | --- | --- | --- | --- |
| 1 | 1단계 | `file.exe.txt`의 확장자 | 마지막 + 복합 끝부분 일치(추천) / 점 뒤 전부 검사 / 마지막만 | 추천안, 복합 규칙은 더 조이기 | "tar.gz와 같이 복합 확장자를 처리하는 방식은 더 타이트하게 하자". 추천안의 복합 규칙이 느슨했습니다(E1). #4에서 구체화 |
| 2 | 1단계 | 점으로 시작하는 이름의 확장자 | 마지막 점 뒤(추천) / 확장자 없음(Node·Python 관례) | 마지막 점 뒤 | 추천안 그대로. 추천 근거: `.exe`가 차단을 통과하는 실측 |
| 3 | 1단계 | 커스텀에 고정 확장자를 입력하면 | 거부 + 고정 쪽 안내(추천) / 고정 자동 체크 / 커스텀에도 허용 | 거부 + 안내 | 추천안 그대로. 추천 근거: 차단 여부를 한 곳에서만 정함 |
| 4 | 1단계 | 복합 확장자를 어떻게 조일까(복수 선택) | 점 경계 일치 + 단별 형식(추천) / 최대 2단(추천) / 포함 관계 거부(추천) / 알려진 복합만 허용 | 점 경계 일치 + 단별 형식, 최대 2단 | 포함 관계 거부와 알려진 복합 목록을 고르지 않은 이유(나중에 물어서 받은 답): "규칙이 복잡해져서" |
| 5 | 1단계 | 내용(시그니처) 검사 범위 | 1차: 정책 적용 + 위장 실행 파일 상시 차단(추천) / 내용 형식에도 정책만 / 확장자 정책만. 논의 뒤 2차: (A) 확장자 정책만 + 내용 검사는 문서로만(새 추천) / (B) (A) + 판별 결과만 기록 / (C) 1차 추천 | 1차는 논의 요청, 2차 (A) | "실무에서 그렇게까지 검사하는게 정책이나 법적으로 맞을지 잘 모르겠고 내가 제일 베스트라 생각하는 방향은 과제의 블랙리스트가 아닌 화이트리스트이기 때문에 확장자 정책만 가는게 맞다 생각해". 1차 추천이 이 관점을 놓쳤습니다(E2). Claude는 결론 (A)에는 동의했지만 "화이트리스트라서 내용 검사가 필요 없다"는 근거에는 반대 의견을 냈습니다. 허용 목록과 시그니처 확인은 한 쌍이라는 의견입니다 |
| 6 | 1단계 | 업로드 파일 저장·노출 | 비공개 저장 + 메타데이터만(추천) / 다운로드 링크 / 검사 후 폐기 | 비공개 + 메타데이터만 | 추천안 그대로. 추천 근거: 공개 배포에서 악성 파일 배포 통로 차단 |
| 7 | 1단계 | 면접 일정 | 모름·1달 이상(추천) / 2주 이내 / 2주~1달 | 모름·1달 이상 버티게 | 추천안 그대로 |
| 8 | 1단계 | 저장소 공개 여부 | public 유지 + push 전 점검(추천) / 작업 중 private → 제출 직전 public / private + 평가자 초대 | public + push 전 점검 | 추천안 그대로. 추천 근거: 주소만으로 열려야 하고, 과제에 공개 금지 문구가 없음 |
| 9 | 1단계 | 1단계 문서 첫 push 시점 | 지금 push + PR(추천) / 4단계까지 쌓고 한 번에 | 지금 push + PR | 추천안 그대로. 추천 근거: 단계별로 리뷰 흔적을 남김 |
| 10 | 2단계 | 누구나 접속하는 배포에서 정책 편집 | 공개 + 초기화 + 변경 이력(추천) / 방문자별 정책 공간 / 관리자 비밀번호 | 공개 + 초기화 + 이력 | 이유(나중에 물어서 받은 답): "평가자가 바로 시험하게" |
| 11 | 2단계 | 정책 변경 이력 | 이력 테이블 + 화면 표시(추천) / 서버 로그만 / 문서로만 | 추천안 + 직접 입력 | "이력 테이블 + 화면 표시까지가고, 이건 실무에서 남기는 로그성 형태로 가자". Claude가 추가 전용, 이벤트 단위, 같은 트랜잭션, 거부 시도는 서버 로그로 해석했고 #22에서 확정했습니다 |
| 12 | 2단계 | 업로드 결과 목록을 누구에게 보여 주나 | 이 브라우저에서 올린 것만(추천) / 전체 목록 + 이름 일부 가림 / 전체 목록 그대로 | 이 브라우저에서 올린 것만 | 추천안 그대로. 추천 근거: 파일명 속 개인정보. #28에서 쿠키를 빼면서 "올린 그 화면에서만"으로 바뀌었습니다 |
| 13 | 3단계 | 앱 호스팅·DB | Vercel Hobby + Neon Free(추천) / Cloudflare Workers + D1 | Vercel + Neon | 추천안 그대로. 추천 근거: 잠들기·만료가 없고, 한도를 넘으면 과금 없이 정지 |
| 14 | 3단계 | 업로드 파일 저장 | Vercel Blob 비공개 + 서버 경유(추천) / Neon에 함께 저장 / Cloudflare R2 | Blob 비공개 + 서버 경유 | 추천안 그대로. 추천 근거: DB와 파일 저장소의 장애 범위 분리 |
| 15 | 3단계 | 프레임워크 | Next.js App Router(추천) / Vite + React + Vercel Functions | 직접 입력: Next.js 풀스택 | "따로 백엔드까지 구축하지 말고, 이 과제는 ai 활용이 주라 생각되니 Next.js app router 풀스택으로 가자." |
| 16 | 3단계 | 파일 크기·보관 기한·하루 업로드 총량 | 4MiB·24시간·50건(추천) / 1MiB·24시간·50건 / 4MiB·1시간·50건 | 4MiB·24시간·50건 | 추천안 그대로 |
| 17 | 4단계 | 쿼리·마이그레이션 | SQL 파일 + 얇은 실행기(추천) / Drizzle ORM | SQL 파일 + 실행기 | 추천안 그대로. 추천 근거: 스키마 정본이 SQL이라 README와 일치 |
| 18 | 4단계 | DB 접근 방식(3단계 결정을 바꿀지) | 1차: pg + 풀링 연결로 변경(추천) / Neon 서버리스 드라이버 유지. 설명 뒤 2차: 같은 선택지 | 1차는 직접 입력, 2차 pg + 풀링 연결 | "각 방법의 트레이드오프를 설명해줘 그 다음 결정할게". Claude가 대화형 트랜잭션·클라우드 없는 테스트와 연결 관리 없음을 견줘 설명했고, 2차에서 추천안을 골랐습니다 |
| 19 | 4단계 | 확장자 정책 테이블 구성 | 1차: 단일 테이블(추천) / 두 테이블. 재검토 뒤 2차: 두 테이블(새 추천) / 단일 테이블 | 1차는 직접 입력, 2차 두 테이블 | "이건 디테일하게 하나의 질문에서 하나씩 같이 정하자.", 이어서 "일차적으로 고정/커스텀키를 나누는게 좋다고 생각하는데 이건 다른 기업들이나, 확장성을 생각해서 한 번 더 검토해줘". 1차 추천은 한 가지 기준만 봤습니다(E11). 13장 사례를 확인한 뒤 Claude도 두 테이블을 추천했습니다 |
| 20 | 4단계 | 커스텀의 고정 확장자를 DB에서 막는 방법 | 트리거로 고정 테이블 조회(추천) / CHECK에 고정 7개 나열 / 앱 검사만 | 트리거 | 추천안 그대로. 추천 근거: 고정 목록의 출처를 테이블 하나로 |
| 21 | 4단계 | 확장자 형식을 DB에서도 강제 | DB에도 형식 CHECK(추천) / 길이만 DB, 형식은 앱 | DB에도 형식 CHECK | 추천안 그대로 |
| 22 | 4단계 | 감사 로그 추가 전용 강제 | DB 트리거로 강제(추천) / 앱 규칙만 | DB 트리거 | 추천안 그대로. #11의 실무형 로그 요구를 DB에서 강제합니다 |
| 23 | 4단계 | 업로드 기록 범위 | 통과한 업로드만(추천) / 시도 전부(status 컬럼) | 시도 전부 | 추천과 다르게 골랐습니다. 이유(나중에 물어서 받은 답): "모니터링·통계,실무에서도 시도 로그를 남겨서". Claude가 단점(차단된 파일명 저장, 남용 시 증가)을 24시간 보관과 이름 오류 시 미저장으로 줄였습니다 |
| 24 | 4단계 | 요청 제한 기준 | IP 해시 + 전체 총량(추천) / 방문자 쿠키 + 전체 총량 | 직접 입력: 문서로만 | "이거는 이번 과제에서 넘어가고 문서에만 남기자. 이번 과제 범위에서 이거까지 하는건 아닌거 같고 실제였다면 ip해시로 했을거야". 하루 저장 50건 전체 상한은 유지합니다 |
| 25 | 4단계 | 운영 숫자 | 감사 30일·쿠키 30일·KST 자정(추천) / 90일·90일·KST / 30일·30일·UTC | 감사 30일·쿠키 30일·KST 자정 | 추천안 그대로. 쿠키는 #28에서 뺐습니다 |
| 26 | 범위 재조정 | 마감 | 오늘(10-21) 안 / 내일(10-22) 안 / 모레 이후 | 내일(10-22) 안 | 추천 없이 물은 질문 |
| 27 | 범위 재조정 | 문서로만 내릴 것 1(복수 선택) | X9 응답 순번(추천) / GitHub Actions 감시(추천) / Playwright E2E(추천) / D8 CSRF(유지 권장) | 응답 순번, 감시 워크플로, E2E | 기준: "마감 안에 동작을 확실히 하고, 내가 면접에서 설명할 수 있는가". 2.6에 인용한 제 말과 같은 라운드입니다 |
| 28 | 범위 재조정 | 내리거나 단순화할 것 2(복수 선택) | 방문자 쿠키 빼기(추천) / 정리 단순화(추천) / 저장소 어댑터 3→2(추천) / 하루 50건 상한(유지 권장) | 쿠키 빼기, 정리 단순화, 어댑터 3→2 | #27과 같은 기준. 쿠키를 빼면서 #23을 고를 때의 장점(새로고침 뒤에도 남는 내 시도 목록)은 사라졌습니다 |
| 29 | 범위 재조정 | 쿠키를 뺀 뒤 CSRF Origin 검사 | 문서로만(추천) / 유지(방어 심층) | 문서로만 | 추천안 그대로. Claude가 #27·#28이 이 항목의 근거를 바꾼다는 점(쿠키가 없으면 막을 대상이 없음)을 짚어 다시 물었습니다(점검표 A2) |
| 30 | 범위 재조정 | 남은 PR 단위 | 5개로 합치기(추천) / 기존 7개 유지 | 5개로 합치기 | 추천안 그대로. 추천 근거: PR당 리뷰 분량은 늘지만 기능 단위로 끝남 |
| 31 | 판정 규칙 | 파일 이름에 눈에 안 보이는 글자나 영어와 똑같이 생긴 다른 나라 글자가 있으면 | 안 보이는 글자 거부, 이모지 이음 글자만 허용, 닮은 글자는 문서로만(추천) / 처음 설계에서 빠진 3개만 추가 / 닮은 글자까지 거부 | 직접 입력: 안 보이는 글자 거부 + 이모지도 거부 | "안 보이는 글자는 거부하자. 이모지도 거부하는게 좋겠어 파일은 대부분 서비스처럼가자". 닮은 글자는 막지 않고 문서로만 두었습니다(N22). 처음 질문은 용어가 어려워 제가 "전체 질문 다시해"라고 했고, 쉬운 말로 다시 받았습니다 |
| 32 | 판정 규칙 | 판정 코드를 파일로 어떻게 나눌까 | 기능별 파일 네 개(추천) / 파일 하나 / 네 개 + 실패는 오류로 던지기 | 기능별 파일 네 개 | 추천안 그대로. 추천 근거: 기능마다 파일을 나누고 실패는 결과로 돌려줌 |
| 33 | 판정 규칙 | 테스트를 먼저 썼다는 걸 커밋에 어떻게 남길까 | 테스트·구현 커밋 나누기(추천) / 한 커밋에 같이 | 한 커밋에 같이 | 추천과 다르게 골랐습니다. "TDD로 선 테스트 후 기능구현으로 갈거니깐 같이"<br>테스트를 먼저 쓰고 구현하는 순서는 작업에서 지키므로, 커밋까지 둘로 나눠 그 순서를 보여 줄 필요는 없다고 봤습니다.<br>테스트만 있을 때 108개가 모두 실패한 결과는 작업 기록에 남겼습니다 |
| 34 | 판정 규칙 | 다른 서비스 확인 결과를 보고, 파일 이름의 이모지를 어떻게 할까 | 그대로 거부(추천) / 허용(Dropbox처럼) | 그대로 거부 | #31의 "대부분 서비스처럼"을 Claude가 공식 문서로 확인해 보니, 이모지를 막는 서비스는 많지 않았습니다(13장). "이모지를 막지 않는건 내가 잘못 생각했네. 그래도 막는걸로 가자. 이 과제의 도메인은 사내에서 사용하는 프로그램이니 이모지가 붙은 파일명은 거의 없을거라 판단돼"<br>PR 리뷰 때 다시 정리한 이유: "사내 도구에서 저런 이모지를 넣는 경우는 난 실무에서 경험하지 않았어서 거부하는게 맞을 거 같아. 그리고 사용자 입장에서도 이모지가 없는 파일을 전달하는게 더 많지 않을까?" "사내 도구"는 과제 원문에 없는 제 가정입니다.<br>비용: `🔥최종 기획안.pptx`, `✅ 확인완료.xlsx` 같은 정상 파일 이름도 막힙니다. FE0F가 없는 `❤사랑.jpg`는 통과하고 `❤️사랑.jpg`는 거부됩니다 |
| 35 | 정책 | DB가 필요한 테스트는 어떤 DB에서 돌릴까 | 테스트 전용 DB 따로(추천) / 개발용 DB 같이 쓰기 / 전용 DB + 명령 하나로 | 개발용 DB 같이 쓰기 | 추천과 다르게 골랐습니다. "개발용 DB같이 사용하자. 빠른 검증과 과제 제출이 목표이니깐. 물론 실제 실무에선 다르겠지만". 테스트가 데이터를 지우므로, 로컬 주소가 아니면 테스트를 시작하지 않는 장치를 같이 넣었습니다(위험 V5) |
| 36 | 정책 | 화면을 처음 열 때 정책을 어떻게 불러올까 | 브라우저가 API로 불러오기(추천) / 서버가 그려서 보내기 | 브라우저가 API로 | 추천안 그대로. 추천 근거: 화면과 curl이 같은 API를 써서 설명과 테스트가 하나로 모임 |

## 13. 다른 서비스 사례

2026-10-21에 공식 문서를 확인했습니다. 정책 테이블을 나누는 결정과, 지금은 만들지 않는 확장(정책 여러 개, 차단/허용 모드)의 방향을 정하는 데 썼습니다.

| 서비스 | 확인한 방식 | 우리에게 주는 시사점 |
| --- | --- | --- |
| [Microsoft Defender for Office 365 — 안티멀웨어 정책](https://learn.microsoft.com/en-us/defender-office-365/anti-malware-policies-configure) | 모두에게 적용되는 기본 정책 + 개인·그룹·도메인 범위의 맞춤 정책(우선순위). "흔한 첨부 파일 필터"의 파일 형식 목록은 정책의 설정값이고, 미리 정의된 목록에서 고름(기본 선택 있음). 정책(무엇을)과 규칙(누구에게)을 나눠 관리 | 고정 = 미리 정의된 목록 + 정책별 선택 상태. 계정별 정책으로 넓힐 때 "목록"과 "적용 대상"을 나눔 |
| [Freshdesk — 파일 확장자 제한](https://support.freshdesk.com/support/solutions/articles/50000005573-restrict-file-extensions) | 계정 전체 설정 하나. 차단 목록/허용 목록 중 한 모드만. 미리 정의된 그룹(실행 파일, 압축 파일) + 관리자가 추가하는 확장자 | 모드는 행이 아니라 정책 단위 속성. 미리 정의된 묶음과 직접 추가한 항목을 구분 |

### 파일 이름에 쓸 수 있는 글자

2026-10-21에 공식 문서를 확인했습니다. 이모지를 막을지 정하면서 다른 서비스가 실제로 어떻게 하는지 봤습니다.

| 서비스 | 이모지 | 막는 글자 | 근거 |
| --- | --- | --- | --- |
| [Dropbox](https://help.dropbox.com/files-folders/sort-preview/file-names) | 허용 | `/` `\`는 금지, `< > : " \| ? *`와 마침표는 권하지 않음 | "supports a wide range of characters in filenames—including emojis" |
| [Box](https://support.box.com/hc/en-us/articles/360044196773-Troubleshooting-Uploads-to-Box) | 문서에 "이모지"라는 말은 없음. 기본 다국어 평면(BMP) 문자만 받으므로 대부분의 이모지는 받지 못함 | 출력되지 않는 ASCII, `< > : " / \ \| ? *`, 앞뒤 공백, `.`·`..`, 255자 초과 | "supports only Unicode Basic Multilingual Plane 0 (BMP) characters" |
| [OneDrive·SharePoint](https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa) | 언급 없음 | `" * : < > ? / \ \|`, 앞뒤 공백 | "Leading and trailing spaces in file or folder names also aren't allowed." |
| [AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html) | 허용(모든 UTF-8) | 금지는 없고, 제어 문자(00–1F, 7F)는 따로 처리해야 할 수 있다고 안내 | "You can use any UTF-8 character in an object key name." |

여러 서비스가 공통으로 막는 것은 Windows 금지 문자, 앞뒤 공백, 255자 제한이고 우리 설계에도 들어 있습니다. "대부분의 서비스가 이모지를 막는다"는 문서로 뒷받침되지 않았습니다. 안 보이는 글자(zero width 등)를 명시한 서비스는 없어서, 이 부분은 우리가 따로 찾은 고려사항입니다(위험 N21). Google Drive와 Slack은 공식 규칙을 찾지 못했습니다.

### 확장 경로 (지금은 만들지 않음)

정책을 여러 개 두거나 허용 모드를 넣게 되면 이 순서로 넓힙니다. 지금 만들지 않는 이유는 [위험 목록](../analysis/02-risks.md)에 있습니다.

1. `policy(id, mode, …)` 테이블을 추가합니다.
2. `fixed_extension`을 `extension_preset`(목록)과 `policy_preset_state(policy_id, ext, blocked)`로 나눕니다.
3. `custom_extension`에 `policy_id`를 넣고 `UNIQUE(policy_id, ext)`로 바꿉니다.
4. 판정 함수에 모드 분기를 넣습니다. 허용 모드라면 확장자가 없는 파일도 거부합니다.
5. 적용 대상은 별도 규칙 테이블로 둡니다.

## 14. 배포 뒤 확인할 것

로컬 Docker로는 확인할 수 없어 배포한 뒤에 볼 것들입니다.

| 항목 | 방법 | 관련 |
| --- | --- | --- |
| 풀러를 거칠 때 트랜잭션 잠금 동작 | 배포 URL에 199개 상태에서 커스텀 추가 동시 요청 → 200개를 넘지 않는지 | P5, 6장 |
| Hobby에서 함수 지역을 싱가포르로 바꿀 수 있는지 | 프로젝트 설정 + 응답 헤더 `x-vercel-id` | O7 |
| 첫 요청 지연(Neon 깨어남 + 첫 연결) | 5분 이상 쉰 뒤 `/api/health` 응답 시간 | O7, D10 |
| 정책 변경이 바로 보이는지(응답 캐시) | 다른 브라우저에서 바꾼 뒤 새로고침 | D16 |
| 클라이언트 우회 차단 | curl로 차단 확장자 업로드 → 422 | U1, R-B1 |
| 플랫폼 413(4.5MB 초과)을 화면이 사유와 함께 보여 주는지 | 5MB 파일 업로드 | U2, X2 |

## 15. AI 오류 노트

Claude가 틀렸거나 놓친 것을 제가 잡으면 바로 적었습니다. Claude가 검증 중에 스스로 찾은 것과 Codex 교차 검토에서 나온 것도 "잡은 계기" 열에 구분해 적었습니다. 이 표는 `PROMPT_LOG.md` 회고의 근거이고, 반복되는 패턴은 [AI 작업 점검표](../ai-checklist.md)로 옮겨 이후 작업에서 미리 확인합니다. 모두 2026-10-21의 일입니다.

| # | 단계 | AI가 한 것 | 잡은 계기 | 원인 | 반영 |
| --- | --- | --- | --- | --- | --- |
| E1 | 1단계 | Q1 추천안에서 복합 확장자를 "끝부분 일치"라고만 적었습니다. 문자열 접미사(`endsWith`)로 구현하면 `tar.gz` 항목이 `atar.gz`도 막고, 단 수 제한이 없어 `a.b.c.d` 같은 항목도 들어옵니다 | 제 지적: "tar.gz와 같이 복합 확장자를 처리하는 방식은 더 타이트하게 하자" | 규칙을 말로만 적고 비교 단위(문자열 vs 점으로 나눈 단)를 정하지 않았습니다 | 조일 방법을 네 가지 선택지로 쪼개 다시 물었고, "점 경계 일치 + 단별 형식, 최대 2단"으로 확정했습니다. `atar.gz` 통과, `a.tar.gz` 차단, `pkg.tar.zst` 입력 거부를 테스트 케이스로 고정합니다 |
| E2 | 1단계 | Q4에서 "위장 실행 파일 상시 차단"을 추천하며 효과(위장 탐지)만 따졌습니다 | 제 지적: "실무에서 그렇게까지 검사하는게 정책이나 법적으로 맞을지 잘 모르겠고", 블랙리스트보다 화이트리스트가 맞는 방향이라는 의견 | 놓친 관점 두 가지: ① 정책·법적 적절성 ② 허용 목록 방향. 제 지적을 계기로 Claude가 찾은 것 하나: ③ 같은 라운드에서 Q5 "비공개 저장, 다운로드 없음"도 추천했는데, 그러면 위장 실행 파일이 위험해지는 경로가 이미 사라집니다. 서로 영향을 주는 두 추천을 따로 판단했습니다 | 추천을 "확장자 정책만 구현 + 내용 검사는 문서로만"으로 바꿔 다시 제안했고, 제가 (A)로 확정했습니다. 외부 악성코드 검사 서비스에 파일을 보내면 방문자의 파일이 제3자에게 넘어간다는 점은 2단계 위험 목록에 넣었습니다 |
| E3 | 1단계 | 분석 문서 S1에 "public"을 과제 조건처럼 적었습니다. 과제 원문은 "GitHub 주소"만 요구하고, "누구나 접속 가능"은 배포 URL의 조건입니다 | 제 질문: "공개저장소로 하는게 맞겠지? 난 그동안 보통 프리빗저장소에서 과제하고 콜라보레이터로 초대했거든". 이 질문을 계기로 Claude가 원문을 다시 대조해 찾았습니다 | 제 시작 프롬프트의 전제("저장소 공개 필수")를 과제 원문의 요구로 옮겨 적었습니다. 출처를 구분하지 않았습니다 | S1을 원문대로 고치고, 공개 여부는 문답으로 따로 정했습니다 |
| E4 | 1단계 → 2단계 | Q4 논의(채팅)에서 "OWASP 파일 업로드 치트시트도 허용 목록과 시그니처 확인을 같이 권한다"고 기억으로 말했습니다. 원문은 시그니처 검증을 "should not be used on its own"이라며 Content-Type 검증과 함께 쓰라고 할 뿐, 허용 목록과 짝짓지 않습니다 | Claude 자체 검증: 2단계에서 원문 링크를 확인하다 찾았습니다 | 출처를 확인하지 않고 기억으로 인용했습니다 | "허용 목록 + 시그니처 확인은 한 쌍"은 OWASP 주장이 아니라 우리 판단으로 표시했습니다. 결정(문답 #5)은 바뀌지 않습니다. 실행 경로가 없다는 점과 제 판단이 그대로이기 때문입니다. 2단계 위험 표 V2에 사례로 남겼습니다 |
| E5 | 2단계 | 위험 표 서문·2장 도입·D1에서 공개 저장소와 인증 없는 편집을 "제출 조건"처럼 적고, "비밀번호는 공개 저장소에 둘 수 없다"를 인증을 넣지 않는 근거로 들었습니다 | Codex 교차 검토 | E3을 고친 직후 같은 혼동이 다시 나왔습니다. 과제 요구와 우리 결정을 문장 단위로 구분하지 않았습니다. 비밀번호는 환경 변수로 두고 따로 전달할 수 있으므로 근거도 틀렸습니다 | 서문·2장·D1을 고치고 "과제 요구 / 우리 결정"을 명시했습니다. D1은 [문서로만](위험 수용)으로 판정을 바꿨습니다 |
| E6 | 2단계 | P5에서 "조건부 INSERT 한 문장"이면 200개 제한이 보장된다고 했습니다 | Codex 교차 검토(Claude가 PostgreSQL 공식 문서로 확인) | READ COMMITTED에서는 각 문장이 시작 시점의 스냅샷을 본다는 점을 따지지 않았습니다. 두 문장이 모두 199개를 보고 삽입할 수 있습니다 | 추가 경로를 하나의 잠금으로 직렬화하고(6장), 동시 요청 테스트로 고정합니다 |
| E7 | 2단계 | 결정을 바꾼 뒤 그 결정에 기대는 항목을 다시 보지 않았습니다: U7(내용 검사를 안 하면 판정에 바이트가 필요 없는데 직접 업로드를 R-B1 위반으로 판정), D8(익명 쿠키를 들였는데 "세션 없음"을 근거로 CSRF 제외), D15(쿠키로 조회를 허용하면서 "권한 판단에 쓰지 않는다") | Codex 교차 검토 | E2와 같은 원인입니다. 결정끼리의 영향을 따로 판단했습니다 | 각 항목을 고쳤습니다. 결정이 바뀌면 결정 표 근거 열에 적힌 위험 ID를 다시 훑습니다. U7을 고치면서 3단계에 "직접 업로드" 선택지가 생겼습니다 |
| E8 | 2단계 | 근거 서술 오류 묶음: N15 OWASP 오인용("ZIP 허용 비권장"을 "ZIP 내용 검증 비권장"으로), N18 약한 제외 근거, N10 설계와 맞지 않는 근거, N12 예시와 대응 불일치, G3 과제 서술 부정확 | Codex 교차 검토(N15는 Claude가 원문 문장으로 재확인) | 웹 페이지 요약 도구가 준 요약을 원문처럼 옮겼습니다(E4와 같은 경로). 결론에 맞춰 근거를 끌어다 썼습니다 | 인용은 원문 문장을 그대로 받아 확인합니다. 각 항목 근거를 고치고, N12를 N12·N20으로 나눴습니다 |
| E9 | 1단계 → 2단계 | 1단계 기본값 D1의 정규화 순서(끝 점·공백 제거 → NFKC)로는 `evil.exe．`의 확장자가 빈 값이 됩니다 | Codex 교차 검토. Claude가 Node로 재현하면서 전각 공백(U+3000)·U+00A0도 같은 문제임을 추가로 찾았습니다 | 정규화 단계끼리의 상호작용(NFKC가 점·공백을 새로 만든다)을 따지지 않았습니다 | 순서를 NFKC → 소문자 → 끝 점·공백 제거로 바꾸고 세 이름을 테스트로 고정했습니다(위험 N19) |
| E10 | 4단계 | 테이블 구성 첫 질문의 선택지 설명에 "두 테이블이면 겹침을 제약으로 못 막아 트리거나 앱 검사가 필요하다"고 썼습니다. 고정 목록은 상수라서 커스텀 쪽 CHECK에 나열하면 DB가 막습니다 | Claude 자체 검증: 다음 질문을 준비하며 SQL을 써 보다 찾았고, 제가 결정하기 전에 정정했습니다 | DB가 할 수 있는 것을 확인하지 않고 단정했습니다(점검표 A5) | 정정한 뒤 "어디서 막느냐, 목록을 몇 군데 두느냐"로 비교를 다시 세웠습니다(문답 #19·#20) |
| E11 | 4단계 | 단일 테이블을 추천하며 "기본키로 겹침·중복을 막는다"는 한 가지 기준만 따졌습니다. 고정·커스텀의 생애 차이, 확장성(계정별 정책·허용 모드), 다른 서비스의 관행은 보지 않았습니다 | 제 지적: "이건 다른 기업들이나, 확장성을 생각해서 한 번 더 검토해줘" | 추천의 근거를 한 축에서만 찾았습니다. E2와 같은 종류입니다 | Microsoft·Freshdesk 공식 문서를 확인하고(13장) 추천을 두 테이블로 바꿨습니다. 점검표에 A10(한 가지 기준만 본 추천)을 추가했습니다 |
| E12 | 1단계 → 4단계 | 1단계 기본값 D2(커스텀 입력)의 순서 "공백 제거 → 앞쪽 점 제거 → NFKC → 소문자"로는 `．sh`(전각 마침표로 시작)가 NFKC 뒤 `.sh`로 남아 형식 오류가 됩니다 | Claude 자체 검증: 4장 명세를 쓰며 점검표 A4(단계끼리의 상호작용)를 적용하다 찾았고, Node로 재현했습니다(`．sh`, `．．tar.gz`) | E9와 같은 원인입니다. E9를 고칠 때 업로드 파일명에만 적용하고 커스텀 입력은 다시 보지 않았습니다 | 순서를 NFKC → 앞뒤 공백 제거 → 소문자 → 앞쪽 점 제거로 바꾸고(4.3) 두 입력을 테스트로 고정했습니다 |
| E13 | 1~4단계 | 범위가 과제 요구보다 커졌습니다. 위험을 찾을 때마다 대부분 [구현] 쪽으로 판정했고, 마감과 "면접에서 설명할 수 있는가"를 판정 기준에 넣지 않았습니다 | 제 지적: 별도 세션의 Claude로 평가자 관점(과제 6·7장) 중간 점검을 받은 뒤 "처음 과제요구사항보다 범위가 커지고 복잡도가 높아지는 거 같아"라고 했습니다 | "위험을 찾는 것"과 "구현하는 것"을 한 판정으로 다뤘습니다. 구현·설명 비용이라는 축이 없었습니다(A10과 같은 종류) | 범위를 재조정했습니다(문답 #26~#30, 2.6). 점검표에 A11을 추가했습니다 |
| E14 | 1~4단계 | PROMPT_LOG에 제 의도를 추정해서 썼고, 선택 이유를 "추천 근거에 동의"로 채웠습니다. 추천과 다르게 고른 #23은 이유가 비어 있었습니다 | 제 지적: 같은 점검에서 나왔습니다 | 기록 칸을 채우려고 모르는 것을 추정했습니다. 과제 4-3은 본인이 잡은 것을 강조하라고 하는데 AI의 목소리가 섞였습니다 | 항목마다 제 입력을 그대로 인용하고, 의도는 묻거나 비웁니다. AI가 대신 쓴 이유에는 초안 표시를 붙여 제가 고칩니다([문서 작성 가이드](../writing-guide.md)). 중요한 결정의 이유는 저에게 물어 그대로 적습니다. 점검표에 A12를 추가했습니다 |
| E15 | 2단계 → 판정 규칙 | 위험 N8의 거부 범위를 줄일 때 양방향 서식 문자를 손으로 나열하면서 LRM·RLM·ALM(U+200E·200F·061C)을 빠뜨렸고, soft hyphen·zero width space 같은 다른 안 보이는 글자가 확장자 안에 들어오는 경우를 따지지 않았습니다. 화면엔 `evil.exe`로 보이는 이름이 통과했습니다 | Claude 자체 검증: 판정 규칙 테스트 케이스를 뽑으며 Node로 재현했습니다 | 표준 정의(유니코드 문자 속성) 대신 기억으로 일부만 나열했습니다. 과한 차단을 줄이라는 지적을 받아들일 때, 줄인 뒤 무엇이 새로 통과하는지 다시 보지 않았습니다(E7과 같은 종류) | 유니코드 속성(Default_Ignorable_Code_Point 등)으로 규칙을 다시 정의하고, 이모지 거부와 함께 예외 없이 거부하기로 했습니다(문답 #31·#34). 사례를 테스트로 고정했습니다. 점검표에 A13을 추가했습니다 |
