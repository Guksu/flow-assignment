# 파일 확장자 차단 — flow 과제

확장자 차단 정책을 관리하고, 그 정책을 서버가 실제 업로드에서 강제한다.

> 작성 중이다. 핵심 판단·문서 읽는 순서·테이블 스키마는 제출 PR에서 이 자리에 정리한다.
> 지금의 정본은 [설계 문서](docs/design/2026-10-21-file-extension-policy.md)다.

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

```bash
pnpm typecheck && pnpm lint && pnpm test
```
