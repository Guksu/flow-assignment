-- 002: 업로드 시도 (설계 문서 5.4가 정본. 이 파일은 그 SQL을 그대로 옮긴 것)
-- 시도 전부(stored/blocked/rejected)를 24시간 보관한다

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
