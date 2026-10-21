"use client";

// 업로드 시험 (설계 7장 4~5). 고른 파일은 같은 순수 함수로 바로 안내하지만, 최종 판정은 서버가 한다 (위험 U1·X1).
// 안내가 "막힌다"여도 올려 볼 수 있게 둔다 — 서버가 실제로 막는 것을 확인하는 화면이기 때문이다.
import { type ChangeEvent, type FormEvent, useState } from "react";
import { blockedMessage, errorText, NAME_ERROR_MESSAGES, POLICY_ERROR_MESSAGES, UPLOAD_ERROR_MESSAGES } from "@/domain/messages";
import { checkUpload } from "@/domain/upload-check";
import { parseUploadName } from "@/domain/upload-name";

type Status = "stored" | "blocked" | "rejected" | "failed";
type Result = { key: string; name: string; status: Status; message: string };
type Policy = { fixed: { ext: string; blocked: boolean }[]; custom: { ext: string }[] };

const STATUS_LABELS: Record<Status, string> = { stored: "저장됨", blocked: "차단됨", rejected: "거부됨", failed: "실패" };
const OFFLINE = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const HIDDEN_NAME = "(표시하지 않는 이름)";

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// 이름이 잘못된 파일(안 보이는 글자 등)은 이름을 화면에 그대로 보여 주지 않는다 (위험 N8·N21)
const shownName = (name: string) => {
  const parsed = parseUploadName(name);
  return parsed.ok ? parsed.displayName : HIDDEN_NAME;
};

// 서버와 같은 함수(checkUpload)로 같은 우선순위를 쓴다: 이름 → 정책이 크기보다 먼저 (문답 #39)
function precheck(file: File, policy: Policy | null): string {
  const check = checkUpload(file.name, file.size, {
    fixedBlocked: policy ? policy.fixed.filter((f) => f.blocked).map((f) => f.ext) : [],
    custom: policy ? policy.custom.map((c) => c.ext) : [],
  });
  const unknownPolicy = policy ? "" : " 정책을 불러오지 못해 차단 여부는 올리면 서버가 판단합니다.";
  if (check.ok) return policy ? "올릴 수 있는 파일입니다. 최종 판정은 서버가 합니다." : unknownPolicy.trim();
  switch (check.code) {
    case "EXTENSION_BLOCKED":
      return `${blockedMessage(check.matched, check.source)} 올려 보면 서버도 막습니다.`;
    case "FILE_TOO_LARGE":
      return UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE + unknownPolicy;
    default:
      return NAME_ERROR_MESSAGES[check.code];
  }
}

export function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [inputKey, setInputKey] = useState(0); // 올린 뒤 파일 선택을 비운다

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setHint("");
    if (!picked) return;
    // 고를 때마다 최신 정책으로 안내한다 — 다른 사람이 정책을 바꿨을 수 있다
    const res = await fetch("/api/policy", { cache: "no-store" }).catch(() => null);
    const policy: Policy | null = res?.ok ? await res.json().catch(() => null) : null;
    setHint(precheck(picked, policy));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    const result = await send(file);
    setResults((prev) => [result, ...prev]);
    setFile(null);
    setHint("");
    setInputKey((k) => k + 1);
    setBusy(false);
  }

  return (
    <>
      <section aria-labelledby="upload-title">
        <h2 id="upload-title">업로드 시험</h2>
        <p className="muted">파일 하나, 4MiB까지. 올린 파일은 비공개로 24시간 보관하고 내려받을 수 없습니다.</p>
        <form onSubmit={submit} className="add">
          <input key={inputKey} type="file" aria-label="올릴 파일" aria-describedby="upload-hint" onChange={(e) => void choose(e)} />
          <button type="submit" disabled={!file || busy}>
            {busy ? "올리는 중…" : "올리기"}
          </button>
        </form>
        <p id="upload-hint" className="muted">
          {file ? `${shownName(file.name)} · ${size(file.size)} — ${hint || "확인하는 중…"}` : " "}
        </p>
      </section>

      <section aria-labelledby="results-title">
        <h2 id="results-title">이번 업로드 결과</h2>
        <p className="muted">이 화면에서 올린 것만 보입니다. 새로고침하면 사라집니다.</p>
        {results.length === 0 ? (
          <p className="muted">아직 올린 파일이 없습니다.</p>
        ) : (
          <ol className="audit" aria-live="polite">
            {results.map((r) => (
              <li key={r.key}>
                <span className={`badge ${r.status}`}>{STATUS_LABELS[r.status]}</span> {r.name}
                <br />
                <span className="muted">{r.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

async function send(file: File): Promise<Result> {
  const name = shownName(file.name);
  const key = crypto.randomUUID();
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/uploads", { method: "POST", body });
    const json = await res.json().catch(() => null);
    if (res.status === 201) return { key, name: json?.attempt?.name ?? name, status: "stored", message: "저장했습니다." };
    if (json?.attempt) {
      return {
        key,
        // 서버가 이름을 모르는 경우(크기로 거부)는 고른 파일 이름을 쓴다. 잘못된 이름은 shownName이 이미 가린다
        name: json.attempt.name ?? name,
        status: json.attempt.status,
        message: errorText(json.error.message, res.status, json.error.requestId),
      };
    }
    // 플랫폼이 함수에 닿기 전에 막은 큰 요청(4.5MB 초과)은 JSON 없이 413만 온다 (위험 U2)
    if (res.status === 413) return { key, name, status: "rejected", message: UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE };
    const message = json?.error?.message ?? POLICY_ERROR_MESSAGES.SERVER_ERROR;
    return { key, name, status: "failed", message: errorText(message, res.status, json?.error?.requestId ?? res.headers.get("x-request-id")) };
  } catch {
    return { key, name, status: "failed", message: OFFLINE };
  }
}
