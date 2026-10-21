# 4단계 설계 문서 (정본)

| 항목 | 내용 |
|------|------|
| 날짜 | 2026-10-21 |
| 브랜치 | `docs/design` |
| PR | https://github.com/Guksu/flow-assignment/pull/4 |
| 관련 경로 | `docs/design/2026-10-21-file-extension-policy.md`, `docs/analysis/01-requirements.md`, `docs/analysis/02-risks.md`, `docs/analysis/03-stack.md`, `docs/ai-checklist.md`, `PROMPT_LOG.md` |

## 1. 개요

설계 문서를 정본으로 완성했다. 이제 구현은 이 문서를 따른다. 문서에는 결정 표, 판정 규칙의 입력→출력 표, 테이블 스키마 5개(트리거 포함), 주요 흐름, API, 테스트 전략, PR 순서가 들어 있다. 결정 9건은 사용자와 한 질문씩 정했다(문답 #17~#25).

주요 변경은 세 가지다.
- DB 접근을 3단계의 Neon 서버리스 드라이버에서 `pg` + 풀링 연결로 바꿨다.
- 정책 테이블은 재검토 끝에 고정·커스텀 두 테이블로 정했다.
- 사람별 요청 제한은 이번 범위에서 뺐다.

## 2. 작업 내용

- `docs/design/2026-10-21-file-extension-policy.md`
  - 2장 결정 표: 판정 규칙, 정책 데이터, 업로드, 공개 배포 운영, 스택·작업 방식
  - 3장 구조, 4장 판정 규칙 명세(테스트 표)
  - 5장 스키마: `fixed_extension`, `custom_extension`(겹침 방지 트리거), `policy_audit_log`(추가 전용 트리거), `upload_attempt`, `schema_migrations`
  - 6장 잠금·업로드·정리 흐름, 7장 화면, 8장 API, 9장 테스트, 10장 환경 변수, 11장 PR 순서
  - 13장 다른 서비스 사례(Microsoft Defender·Freshdesk)와 확장 경로, 14장 배포 뒤 확인할 것
  - 문답 #17~#25, AI 오류 E10~E12
- `docs/analysis/02-risks.md` — 4단계 결정에 기대는 13개 행 갱신(D3·D6·D12·D13·D15·D18·D19·U8·U9·P1·P5·P7·P13·O4). D6이 [문서로만]으로 바뀜
- `docs/analysis/01-requirements.md` — 기본값 D2 정규화 순서 수정(E12)
- `docs/analysis/03-stack.md` — 요청 제한·DB 연결 행에 4단계 변경 표시
- `docs/ai-checklist.md` — A10(한 가지 기준만 본 추천) 추가, A4·A5 사례 추가, 오류 노트 링크 앵커 수정
- `PROMPT_LOG.md` — P8, 선택 기록 #17~#25, 도구 2개

## 3. 검증 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| 커스텀 입력 정규화 순서 | `node -e`로 기존·수정 순서 비교 | 기존 순서: `．sh`·`．．tar.gz` 형식 오류 / 수정 순서: 통과 |
| 플랫폼 동작 | WebFetch로 Neon 풀링·Vercel 크론·요청 헤더·Next.js Route Handler·Vercel KB 확인 | 설계 6·8장에 반영. 트랜잭션 단위 잠금은 문서에 언급이 없어 추론으로 표시하고 배포 뒤 확인 항목으로 둠 |
| 위험 표 숫자 | 표 행 집계 스크립트 | 93 / 신규 59 / 구현 76 · 문서로만 11 · 제외 6, ID 중복 없음 |
| 스키마 DDL | 설계 문서 5장의 SQL 블록 6개를 뽑아 `postgres:17-alpine` 컨테이너에 `psql -v ON_ERROR_STOP=1`로 적용 | 오류 없이 테이블 5개 생성 |
| 제약·트리거 | 같은 컨테이너에서 거부돼야 할 입력 실행 | 시드 재실행 후 체크 상태 유지 / 형식 CHECK가 `EXE`·`.sh`·`tar..gz`·`pkg.tar.zst`·빈 값 거부, 21자는 길이 오류 / 중복 거부 / 겹침 트리거 양방향 거부 / 감사 로그 UPDATE·30일 전 DELETE·TRUNCATE 거부, 31일 된 행 삭제 허용 / `policy_reset`에 `ext` 있으면 거부 / 업로드 시도 상태별 CHECK 3종 거부 — 모두 설계대로 |
| 200개 동시 추가 | 199개에서 두 세션이 동시에 "개수 확인 → 1초 대기 → 추가" | 잠금 없음 **201개**(E6 재현), `pg_advisory_xact_lock` 있음 **200개** |
| 하네스 구조 | `npx guksu-harness check .` | error 0, warn 0 |

## 4. 확인 필요 · 후속

- 사용자가 설계 문서를 리뷰하고 머지한다. 머지되면 이 문서가 정본이다
- PR 5(1일차 배포): Neon 프로젝트·Vercel 프로젝트·Blob 스토어 생성과 환경 변수 등록을 하나씩 사용자에게 확인받아 진행한다
- 설계 14장 "배포 뒤 확인할 것"을 PR 5·9·10에서 처리한다

## 5. 주의사항

- 위 DDL·동시성 확인은 일회성 스크립트였다. PR 7에서 같은 경우를 Vitest 통합 테스트로 옮긴다
- 풀러(PgBouncer)를 거칠 때의 잠금 동작은 로컬에서 확인할 수 없어 배포 뒤 확인한다(설계 14장)
- 4단계 문답 시각은 대략값이다. 정확한 시각은 대화 원문 추출 때 확인한다
