# 팀 규칙

이 파일은 팀 소유이며 업데이트가 덮어쓰지 않는다. `.agents/harness-core-rules.md`보다 우선한다.

코드에서 알 수 없는 팀 결정만 적는다: 브랜치 관례, 검증 명령과 환경, 업로드·배포 조건, 기록 요구 여부. 기본값으로 충분한 항목은 생략한다.

기록·인계 양식은 선택 기능이다. 기록을 요구하려면 대상 작업과 위치를 여기에 명시한다.

<!-- guksu-harness:team-policy start -->
## 팀 정책 (guksu-harness compose가 생성)

이 구간은 `.agents/harness-team.json`에서 만들어진다. 정책을 바꾸려면 `npx guksu-harness compose --set <키>=<값>`을 쓴다. 이 구간 밖은 팀이 자유롭게 쓴다.

### 작업 규칙
- 따라야 할 별도 지침 문서는 없다. 이 문서가 팀 규칙이다.
- 작업 브랜치: `feat/` `fix/` `refactor/` `docs/` 접두어를 쓰고 기준 브랜치 `main`에서 갈라진다. (추정 — 관례가 없어 기본값)
- AI의 작업 범위: 요청 범위의 구현과 결과 확인까지. 커밋·푸시는 요청이 있을 때만 한다. PR·머지는 요청이 없으면 하지 않는다. 민감정보 값은 읽지 않는다.

### 변경 보호
- 보호 브랜치: `main`. 이 브랜치 위에서는 파일을 편집하지 않는다(branchGuard 훅이 차단). (팀 확정 — 팀 결정 (compose --set))
- 커밋·푸시: 요청 시 허용(blockGitMutation 훅). force push·amend·rebase·reset·checkout은 항상 차단. (팀 확정 — 팀 결정 (compose --set))
- AI 작성 표기 차단: 켬. (팀 확정 — 팀 결정 (compose --set))

### 검증
- 완료 조건: 실행할 검증 명령이 정해지지 않았다. 요청 범위가 충족됐는지 확인하고, 실행한 검사와 하지 않은 검사를 밝힌다. (팀 확정 — 팀 결정 (compose --set))
- 종료 검사 훅(verifierGate): 사용 안 함 — 규칙으로만 요구한다. (저장소 근거 — 검증 명령이 없어 훅으로 강제할 것이 없다)

### 기록·인계
- 작업 기록: PR마다 `docs/history/` 기록 한 건을 남긴다(기록 없는 push는 훅이 차단). (팀 확정 — 팀 결정 (compose --set))

미확인 항목: 없음.
<!-- guksu-harness:team-policy end -->
