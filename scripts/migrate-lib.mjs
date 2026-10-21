// 마이그레이션 파일 이름 규칙: NNN_이름.sql (예: 001_policy.sql). 이름 순서가 곧 적용 순서다.
const NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

/**
 * 아직 적용하지 않은 마이그레이션을 적용 순서대로 돌려준다.
 * 다음 경우에는 적용하지 않고 멈춘다 — 조용히 어긋난 스키마로 배포되는 것보다 빌드 실패가 낫다.
 * - 이름 규칙에 맞지 않는 .sql 파일이 있다
 * - 이미 적용된 마이그레이션 파일이 사라졌다
 * - 아직 안 된 파일이 이미 적용된 마지막 파일보다 앞 번호다(순서 꼬임)
 *
 * @param {string[]} files migrations 폴더의 .sql 파일 이름
 * @param {string[]} applied schema_migrations에 기록된 이름
 * @returns {string[]}
 */
export function pendingMigrations(files, applied) {
  const badNames = files.filter((file) => !NAME.test(file));
  if (badNames.length > 0) {
    throw new Error(`migration file names must look like 001_name.sql: ${badNames.join(", ")}`);
  }

  const missing = applied.filter((version) => !files.includes(version));
  if (missing.length > 0) {
    throw new Error(`applied migrations are missing from migrations/: ${missing.join(", ")}`);
  }

  const pending = [...files].sort().filter((file) => !applied.includes(file));
  const lastApplied = [...applied].sort().at(-1);
  const outOfOrder = lastApplied ? pending.filter((file) => file < lastApplied) : [];
  if (outOfOrder.length > 0) {
    throw new Error(`pending migrations are older than ${lastApplied}: ${outOfOrder.join(", ")}`);
  }

  return pending;
}
