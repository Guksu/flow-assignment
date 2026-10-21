"use client";

// 정책 관리 화면 (설계 7장 1~3). 처음 정책은 브라우저가 API로 불러온다(문답 #36).
// 바꾸는 요청은 서버 응답을 받은 뒤 서버 상태를 다시 읽어 맞춘다 — 화면이 먼저 바뀌지 않는다 (위험 X3).
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { normalizeCustomExtension } from "@/domain/custom-extension";
import { CUSTOM_EXTENSION_MESSAGES, errorText, POLICY_ERROR_MESSAGES } from "@/domain/messages";
import { LoadingButton } from "@/ui/LoadingButton";
import { Modal } from "@/ui/Modal";
import { Skeleton } from "@/ui/Skeleton";

type Policy = {
  fixed: { ext: string; blocked: boolean }[];
  custom: { ext: string; createdAt: string }[];
  customCount: number;
  customLimit: number;
  maxLength: number;
};
type AuditItem = { id: string; occurredAt: string; action: string; ext: string | null };
type Result<T> = { ok: true; body: T } | { ok: false; message: string };
type Notice = { tone: "done" | "error"; text: string } | null;

const ACTION_LABELS: Record<string, string> = {
  fixed_blocked: "고정 체크",
  fixed_unblocked: "고정 해제",
  custom_added: "커스텀 추가",
  custom_removed: "커스텀 삭제",
  policy_reset: "기본값으로 초기화",
};
const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const OFFLINE = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (res.status === 204) return { ok: true, body: undefined as T };
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, body: json as T };
    // 서버가 정한 문구를 그대로 보여 준다 — 화면과 API가 같은 문구 (위험 X7). 오류 번호는 서버 오류일 때만 붙는다
    const message: string = json?.error?.message ?? POLICY_ERROR_MESSAGES.SERVER_ERROR;
    const requestId: string | null = json?.error?.requestId ?? res.headers.get("x-request-id");
    return { ok: false, message: errorText(message, res.status, requestId) };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

const fetchAll = () =>
  Promise.all([call<Policy>("/api/policy"), call<{ items: AuditItem[] }>("/api/policy/audit?limit=20")]);

export function PolicyPanel() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // 저장 중인 작업. 그동안 다른 버튼을 막는다
  const [input, setInput] = useState("");
  const [addError, setAddError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const apply = useCallback(([p, a]: Awaited<ReturnType<typeof fetchAll>>) => {
    if (p.ok) {
      setPolicy(p.body);
      setLoadError(null);
    } else {
      setLoadError(p.message);
    }
    if (a.ok) setAudit(a.body.items);
  }, []);

  const refresh = useCallback(async () => apply(await fetchAll()), [apply]);

  useEffect(() => {
    // 첫 화면에서 서버 정책을 불러온다. 응답 전에 화면이 사라지면 결과를 버린다
    let active = true;
    void fetchAll().then((result) => active && apply(result));
    return () => {
      active = false;
    };
  }, [apply]);

  async function run(key: string, work: () => Promise<Result<unknown>>, done: string) {
    setBusy(key);
    setNotice(null);
    const result = await work();
    // 성공은 화면 변화로 보이므로 화면 읽기 프로그램에만 알리고, 오류는 그 자리에 빨간 글자로 보인다
    setNotice(result.ok ? { tone: "done", text: done } : { tone: "error", text: result.message });
    await refresh();
    setBusy(null);
    return result;
  }

  // 첫 조회 실패는 빈 목록이 아니라 오류로 보여 준다 — 빈 목록이면 "차단 정책이 없다"로 오해한다 (위험 X2)
  if (!policy) {
    return (
      <section className="panel" aria-labelledby="policy-title" aria-busy={!loadError}>
        <div className="panel-head">
          <h2 id="policy-title">확장자 정책</h2>
        </div>
        {loadError ? (
          <div className="block" role="alert">
            <p className="status-error">정책을 불러오지 못했어요. {loadError}</p>
            <div>
              <button type="button" className="button-outline" onClick={() => void refresh()}>
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="block">
              <Skeleton variant="text" width="30%" />
              <Skeleton height={44} />
            </div>
            <div className="block">
              <Skeleton variant="text" width="30%" />
              <Skeleton height={48} />
            </div>
            <div className="block">
              <Skeleton variant="text" lines={3} />
            </div>
          </>
        )}
      </section>
    );
  }

  const fixedExts = policy.fixed.map((f) => f.ext);
  const full = policy.customCount >= policy.customLimit;
  const check = input.trim() === "" ? null : normalizeCustomExtension(input, fixedExts);
  const duplicate = check?.ok && policy.custom.some((c) => c.ext === check.ext);
  const validInput = !!check?.ok && !duplicate && !full;
  const othersBusy = busy !== null && busy !== "add";
  const hint: { tone: "error" | "info"; text: string } | null = full
    ? { tone: "info", text: POLICY_ERROR_MESSAGES.CUSTOM_LIMIT_REACHED }
    : addError
      ? { tone: "error", text: addError }
      : !check
        ? null
        : !check.ok
          ? { tone: "error", text: CUSTOM_EXTENSION_MESSAGES[check.reason] }
          : duplicate
            ? { tone: "error", text: POLICY_ERROR_MESSAGES.DUPLICATE_EXTENSION }
            : check.ext !== input
              ? { tone: "info", text: `"${check.ext}"로 추가돼요.` }
              : null;

  // 추가 버튼(LoadingButton)이 부른다. 실패는 예외로 알려 버튼이 실패 표시를 보이게 한다
  async function add() {
    if (!check?.ok || !validInput) return;
    const ext = check.ext;
    setAddError("");
    const result = await run("add", () => call("/api/policy/custom", "POST", { ext: input }), `${ext} 확장자를 추가했어요.`);
    if (!result.ok) {
      setAddError(result.message);
      throw new Error(result.message);
    }
    setInput("");
  }

  function ignoreComposingEnter(event: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합을 끝내는 Enter가 추가를 한 번 더 실행하지 않게 (위험 X6)
    if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
  }

  return (
    <section className="panel" aria-labelledby="policy-title">
      <div className="panel-head">
        <h2 id="policy-title">확장자 정책</h2>
        <button type="button" className="button-text" disabled={busy !== null} onClick={() => setConfirmReset(true)}>
          기본값으로 초기화
        </button>
        <p className="panel-desc">여기서 막은 확장자는 업로드할 때 서버가 거부해요.</p>
      </div>

      <p role="status" className={notice?.tone === "error" ? "hint status-error" : "sr-only"}>
        {notice?.text ?? ""}
      </p>

      <div className="block">
        <h3>고정 확장자</h3>
        <ul className="fixed">
          {policy.fixed.map((item) => (
            <li key={item.ext}>
              <label>
                <input
                  type="checkbox"
                  checked={item.blocked}
                  disabled={busy !== null}
                  onChange={(e) => {
                    const blocked = e.target.checked;
                    void run(
                      `fixed:${item.ext}`,
                      () => call(`/api/policy/fixed/${item.ext}`, "PUT", { blocked }),
                      blocked ? `${item.ext} 업로드를 막아요.` : `${item.ext} 차단을 풀었어요.`,
                    );
                  }}
                />
                {item.ext}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="block">
        <div className="block-head">
          <h3>커스텀 확장자</h3>
          <span className="count" aria-label={`${policy.customLimit}개 중 ${policy.customCount}개`}>
            {policy.customCount}/{policy.customLimit}
          </span>
        </div>
        {/* Enter는 폼의 기본 버튼(추가)을 누른 것과 같다 — 실제 요청은 버튼이 한 번만 보낸다 */}
        <form className="add" onSubmit={(e) => e.preventDefault()}>
          <input
            aria-label="추가할 확장자"
            aria-describedby="custom-hint"
            placeholder={full ? "200개를 모두 채웠어요" : "확장자 입력 (예: sh)"}
            maxLength={policy.maxLength}
            value={input}
            disabled={full}
            onChange={(e) => {
              setInput(e.target.value);
              setAddError("");
            }}
            onKeyDown={ignoreComposingEnter}
          />
          <LoadingButton
            type="submit"
            className="is-outline"
            onAction={add}
            disabled={!validInput || othersBusy}
            loadingLabel="추가 중"
            successLabel="추가됨"
            errorLabel="실패"
          >
            추가
          </LoadingButton>
        </form>
        <p id="custom-hint" className="hint" data-tone={hint?.tone}>
          {hint?.text ?? ""}
        </p>
        {policy.custom.length > 0 && (
          <ul className="chips">
            {policy.custom.map((item) => (
              <li key={item.ext}>
                {item.ext}
                <button
                  type="button"
                  aria-label={`${item.ext} 삭제`}
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      `remove:${item.ext}`,
                      () => call(`/api/policy/custom/${encodeURIComponent(item.ext)}`, "DELETE"),
                      `${item.ext} 확장자를 지웠어요.`,
                    )
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="block">
        <h3>최근 변경 이력</h3>
        {audit.length === 0 ? (
          <p className="empty">아직 바뀐 정책이 없어요.</p>
        ) : (
          <ol className="rows">
            {audit.map((item) => (
              <li key={item.id}>
                <span className="row-line">
                  <time className="row-time" dateTime={item.occurredAt}>
                    {KST.format(new Date(item.occurredAt))}
                  </time>
                  <span>{ACTION_LABELS[item.action] ?? item.action}</span>
                  {item.ext && <strong>{item.ext}</strong>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} labelledBy="reset-title" dismissOnBackdrop={false}>
        <div className="dialog">
          <h2 id="reset-title">정책을 기본값으로 초기화할까요?</h2>
          <p>고정 확장자 체크를 모두 풀고, 커스텀 확장자를 모두 지워요. 이력에는 한 건으로 남아요.</p>
          <div className="dialog-actions">
            <button type="button" className="button-outline" onClick={() => setConfirmReset(false)}>
              취소
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => {
                setConfirmReset(false);
                void run("reset", () => call("/api/policy/reset", "POST"), "기본값으로 초기화했어요.");
              }}
            >
              초기화
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
