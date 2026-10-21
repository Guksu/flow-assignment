-- 001: 확장자 정책 (설계 문서 5.1~5.3이 정본. 이 파일은 그 SQL을 그대로 옮긴 것)
-- 고정 확장자와 현재 상태, 커스텀 확장자, 정책 변경 이력(추가 전용)

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

CREATE TABLE custom_extension (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ext        varchar(20) NOT NULL UNIQUE                    -- 중복 방지(P3)
             CHECK (ext ~ '^[a-z0-9]+(\.[a-z0-9]+)?$'),     -- 정규화된 값만(P1)
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 200개 제한은 잠금 트랜잭션에서 강제(6장). 제약으로 표현하지 않는다

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
