"use client";

// 정책 관리 화면 (설계 7장 1~3). 처음 정책은 브라우저가 API로 불러온다(문답 #36).
// 바꾸는 요청은 서버 응답을 받은 뒤 서버 상태를 다시 읽어 맞춘다 — 화면이 먼저 바뀌지 않는다 (위험 X3).
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { normalizeCustomExtension } from "@/domain/custom-extension";
import { CUSTOM_EXTENSION_MESSAGES, POLICY_ERROR_MESSAGES } from "@/domain/messages";

type Policy = {
  fixed: { ext: string; blocked: boolean }[];
  custom: { ext: string; createdAt: string }[];
  customCount: number;
  customLimit: number;
  maxLength: number;
};
type AuditItem = { id: string; occurredAt: string; action: string; ext: string | null };
type Result<T> = { ok: true; body: T } | { ok: false; message: string };

const ACTION_LABELS: Record<string, string> = {
  fixed_blocked: "고정 체크",
  fixed_unblocked: "고정 해제",
  custom_added: "커스텀 추가",
  custom_removed: "커스텀 삭제",
  policy_reset: "기본값으로 초기화",
};
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" });
const OFFLINE = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

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
    // 서버가 정한 문구를 그대로 보여 준다 — 화면과 API가 같은 문구 (위험 X7)
    return { ok: false, message: json?.error?.message ?? POLICY_ERROR_MESSAGES.SERVER_ERROR };
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
  const [busy, setBusy] = useState<string | null>(null); // 저장 중인 작업. 그동안 관련 버튼을 막는다
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");

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

  async function run(key: string, work: () => Promise<Result<unknown>>, done?: string) {
    setBusy(key);
    setNotice("");
    const result = await work();
    setNotice(result.ok ? (done ?? "") : result.message);
    await refresh();
    setBusy(null);
    return result.ok;
  }

  // 첫 조회 실패는 빈 목록이 아니라 오류로 보여 준다 — 빈 목록이면 "차단 정책이 없다"로 오해한다 (위험 X2)
  if (!policy) {
    return loadError ? (
      <section role="alert">
        <p>정책을 불러오지 못했습니다. {loadError}</p>
        <button type="button" onClick={() => void refresh()}>
          다시 시도
        </button>
      </section>
    ) : (
      <p aria-busy="true">정책을 불러오는 중입니다…</p>
    );
  }

  const fixedExts = policy.fixed.map((f) => f.ext);
  const full = policy.customCount >= policy.customLimit;
  const check = input.trim() === "" ? null : normalizeCustomExtension(input, fixedExts);
  const duplicate = check?.ok && policy.custom.some((c) => c.ext === check.ext);
  const hint = !check
    ? ""
    : !check.ok
      ? CUSTOM_EXTENSION_MESSAGES[check.reason]
      : duplicate
        ? POLICY_ERROR_MESSAGES.DUPLICATE_EXTENSION
        : check.ext !== input
          ? `"${check.ext}"로 추가됩니다.`
          : "";
  const canAdd = !!check?.ok && !duplicate && !full && busy === null;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!check?.ok || !canAdd) return;
    const ok = await run("add", () => call("/api/policy/custom", "POST", { ext: input }), `${check.ext}을(를) 추가했습니다.`);
    if (ok) setInput("");
  }

  function ignoreComposingEnter(event: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합을 끝내는 Enter가 추가를 한 번 더 실행하지 않게 (위험 X6)
    if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
  }

  return (
    <>
      <p className="notice" role="status" aria-live="polite">
        {notice}
      </p>

      <section aria-labelledby="fixed-title">
        <h2 id="fixed-title">고정 확장자</h2>
        <p className="muted">체크하면 그 확장자의 업로드를 막습니다.</p>
        <ul className="fixed">
          {policy.fixed.map((item) => (
            <li key={item.ext}>
              <label>
                <input
                  type="checkbox"
                  checked={item.blocked}
                  disabled={busy !== null}
                  onChange={(e) =>
                    void run(`fixed:${item.ext}`, () =>
                      call(`/api/policy/fixed/${item.ext}`, "PUT", { blocked: e.target.checked }),
                    )
                  }
                />{" "}
                {item.ext}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="custom-title">
        <h2 id="custom-title">커스텀 확장자</h2>
        <form onSubmit={add} className="add">
          <input
            aria-label="추가할 확장자"
            aria-describedby="custom-hint"
            placeholder={full ? "200개를 모두 채웠습니다" : "확장자 입력 (예: sh)"}
            maxLength={policy.maxLength}
            value={input}
            disabled={full}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={ignoreComposingEnter}
          />
          <button type="submit" disabled={!canAdd}>
            추가
          </button>
        </form>
        <p id="custom-hint" className="muted">
          {full ? POLICY_ERROR_MESSAGES.CUSTOM_LIMIT_REACHED : hint || " "}
        </p>
        <p className="muted">
          {policy.customCount}/{policy.customLimit}
        </p>
        <ul className="chips">
          {policy.custom.map((item) => (
            <li key={item.ext}>
              {item.ext}
              <button
                type="button"
                aria-label={`${item.ext} 삭제`}
                disabled={busy !== null}
                onClick={() =>
                  void run(`remove:${item.ext}`, () =>
                    call(`/api/policy/custom/${encodeURIComponent(item.ext)}`, "DELETE"),
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="audit-title">
        <h2 id="audit-title">최근 변경 이력</h2>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm("고정 확장자 체크를 모두 풀고 커스텀 확장자를 모두 지웁니다. 계속할까요?")) return;
            void run("reset", () => call("/api/policy/reset", "POST"), "기본값으로 초기화했습니다.");
          }}
        >
          기본값으로 초기화
        </button>
        {audit.length === 0 ? (
          <p className="muted">아직 변경 이력이 없습니다.</p>
        ) : (
          <ol className="audit">
            {audit.map((item) => (
              <li key={item.id}>
                <time dateTime={item.occurredAt}>{KST.format(new Date(item.occurredAt))}</time>{" "}
                {ACTION_LABELS[item.action] ?? item.action}
                {item.ext && <code> {item.ext}</code>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
