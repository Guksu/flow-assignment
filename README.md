# 파일 확장자 차단 — flow 과제

확장자 차단 정책을 관리하고, 그 정책을 서버가 실제 업로드에서 강제하는 프로젝트입니다.

> 작성 중입니다. 핵심 판단, 문서 읽는 순서, 테이블 스키마는 제출 PR에서 이 자리에 정리합니다.
> 지금의 정본은 [설계 문서](docs/design/2026-10-21-file-extension-policy.md)입니다.

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

## 검증

`pnpm test`는 DB 없이 도는 테스트와 로컬 DB가 필요한 테스트를 함께 돌립니다. DB 테스트는 개발용 로컬 DB(`pnpm db:up`)를 같이 쓰고 데이터를 지웁니다. 그래서 DB 주소가 로컬이 아니면 시작하지 않습니다.

```bash
pnpm typecheck && pnpm lint && pnpm test
```
