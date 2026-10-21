// 업로드 판정 (설계 6장, 문답 #39). 두 묶음을 따로 판정한다: ① 이름 → 정책 ② 크기.
// 사유는 ①을 우선한다 — 크기를 넘는 실행 파일도 "차단"으로 알리고 기록해야, 막을 파일을 줄여서 다시 올리는 헛걸음이 없고
// 시도 기록(모니터링·통계)에서 실행 파일 업로드 시도가 빠지지 않는다. 이름은 정책보다 먼저 본다 — 확장자를 믿을 수 없는 이름이라서.
// 내용은 보지 않으므로 이름과 크기만으로 판정한다. 서버와 브라우저가 같은 함수를 쓴다.
import { type BlockPolicy, decideUpload, type ExtensionSource } from "./policy";
import { MAX_FILE_BYTES, type NameErrorCode, type ParsedUploadName, parseUploadName } from "./upload-name";

type ParsedName = Extract<ParsedUploadName, { ok: true }>;

export type UploadCheck =
  | { ok: true; name: ParsedName }
  | { ok: false; code: NameErrorCode }
  | { ok: false; code: "EXTENSION_BLOCKED"; name: ParsedName; matched: string; source: ExtensionSource }
  | { ok: false; code: "FILE_TOO_LARGE"; name: ParsedName };

export function checkUpload(rawName: string, size: number, policy: BlockPolicy): UploadCheck {
  // ① 이름 → 정책
  const name = parseUploadName(rawName);
  if (!name.ok) return { ok: false, code: name.code };
  const decision = decideUpload(name, policy);
  if (decision.blocked) {
    return { ok: false, code: "EXTENSION_BLOCKED", name, matched: decision.matched, source: decision.source };
  }
  // ② 크기 — ①을 통과했을 때만 사유가 된다
  if (size > MAX_FILE_BYTES) return { ok: false, code: "FILE_TOO_LARGE", name };
  return { ok: true, name };
}
