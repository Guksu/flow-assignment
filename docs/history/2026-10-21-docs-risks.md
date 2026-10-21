# 2단계 위험·예외 목록

| 항목 | 내용 |
|------|------|
| 날짜 | 2026-10-21 |
| 브랜치 | `docs/risks` |
| PR | https://github.com/Guksu/flow-assignment/pull/2 |
| 관련 경로 | `docs/analysis/02-risks.md`, `docs/design/2026-10-21-file-extension-policy.md`, `docs/ai-checklist.md`, `docs/harness-rules.md`, `PROMPT_LOG.md` |

## 1. 개요

2단계 위험·예외 목록을 올린다. 초안 82개에 Codex 교차 검토(지적 20건: 수용 18, 부분 수용 2)를 반영해 90개(신규 56)가 됐고, 판정 2개가 바뀌었다. 결정이 필요했던 3건(정책 편집, 변경 이력, 업로드 목록 노출)은 사용자와 정했다.

## 2. 작업 내용

- `docs/analysis/02-risks.md` — 영역 8개(D 공개 배포, N 파일명, U 업로드, P 정책, X 화면, O 운영, G 공개 저장소, V AI 개발 과정), 항목마다 판정·근거·출처, 과제 3장 대응표, 근거 문서 링크, Codex 검토 방법과 비교 표 자리
- `docs/design/2026-10-21-file-extension-policy.md` — 결정 표 4행(정책 편집, 변경 이력, 업로드 결과 노출, 익명 방문자 ID), 문답 #10~#12, AI 오류 노트 E4(AI 자체 검증), "잡은 계기" 열로 사용자 지적과 자체 검증 구분
- `docs/analysis/01-requirements.md` — Q7·Q8 확정 표시
- `PROMPT_LOG.md` — P3~P6, 선택 기록 #10~#12, 도구 추가, Codex 행 갱신
- `docs/ai-checklist.md` — AI 오류 노트에서 뽑은 반복 패턴 9개와 점검 시점, 팀 규칙에서 참조 (사용자 요청)
- Codex 반영: 위험 표 13장 비교 표, 새 행 8개(D16·D17·N19·N20·P13·X9·G6·G7), D1·D8 판정 변경, 설계 문서 결정 표 4행 수정, AI 오류 노트 E5~E9, 1단계 기본값 D1(정규화 순서)·D12(이름 길이 단위) 수정

## 3. 검증 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| 요약 표 숫자 | 표 행을 판정·출처별로 세는 Python 스크립트 | 90 / 신규 56 / 구현 76 · 문서로만 8 · 제외 6, ID 중복 없음 — 문서와 같음 |
| 정규화 순서 우회 (Codex #1) | `node -e`로 초안 순서와 수정 순서 비교 | 초안 순서: `evil.exe．` → `""`, U+3000·U+00A0 → `"exe "` / 수정 순서: 모두 `"exe"` |
| OWASP ZIP 문장 (Codex #18) | WebFetch로 원문 문장 확인 | "ZIP files are not recommended since they can contain all types of files" — Codex 지적이 맞음 |
| 과제 3장 대응 | 10장 대응표를 C1-1~C4-3과 대조 | 19개 모두 대응 항목 있음 |
| 근거 링크 | WebFetch로 원문 확인 | OWASP·Microsoft 2건은 본문 확인, VirusTotal은 본문이 스크립트로 그려져 검색 결과의 공식 문서 요약으로 확인 |
| 하네스 구조 | `npx guksu-harness check .` | error 0, warn 0 |
| 제품 검증 | 해당 없음 | 코드 없음 |

## 4. 확인 필요 · 후속

- 3단계 스택·배포 결정에서 11장 끝에 넘긴 항목(파일 크기 상한, 보관 기한, 요청 제한 저장 방식, 전체 사용량 상한, DB 연결, 한도 초과 동작, 잠들기·만료)을 정한다
- 변경 이력의 "실무형 로그" 해석(추가 전용, 이벤트 단위, 같은 트랜잭션, 거부 시도는 서버 로그)을 4단계 스키마에서 사용자와 확인한다

## 5. 주의사항

- VirusTotal 공유 정책은 2차 확인(검색 결과 요약)이다. CONSIDERATIONS에 옮길 때 이 점을 그대로 적는다
