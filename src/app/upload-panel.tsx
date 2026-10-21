"use client";

// 업로드 시험 (설계 7장 4~5). 고른 파일은 같은 순수 함수로 바로 안내하지만, 최종 판정은 서버가 한다 (위험 U1·X1).
// 안내가 "막힌다"여도 올려 볼 수 있게 둔다 — 서버가 실제로 막는 것을 확인하는 화면이기 때문이다.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  blockedMessage,
  errorText,
  NAME_ERROR_MESSAGES,
  POLICY_ERROR_MESSAGES,
  tooLargeMessage,
  UPLOAD_ERROR_MESSAGES,
} from "@/domain/messages";
import { checkUpload, type UploadCheck } from "@/domain/upload-check";
import { MAX_FILE_BYTES, parseUploadName } from "@/domain/upload-name";
import { createDropZone } from "@/ui/createDropZone";
import "@/ui/file-upload.css";
import { LoadingButton } from "@/ui/LoadingButton";

type Status = "stored" | "blocked" | "rejected" | "failed";
type Result = { key: string; name: string; status: Status; message: string };
type Policy = { fixed: { ext: string; blocked: boolean }[]; custom: { ext: string }[] };
type Hint = { tone: "error" | "info"; text: string } | null;

const STATUS_LABELS: Record<Status, string> = { stored: "저장됨", blocked: "차단됨", rejected: "거부됨", failed: "실패" };
const OFFLINE = "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
const HIDDEN_NAME = "(표시하지 않는 이름)";

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// 이름이 잘못된 파일(안 보이는 글자 등)은 이름을 화면에 그대로 보여 주지 않는다 (위험 N8·N21)
const shownName = (name: string) => {
  const parsed = parseUploadName(name);
  return parsed.ok ? parsed.displayName : HIDDEN_NAME;
};

// 서버와 같은 함수(checkUpload)로 같은 우선순위를 쓴다: 이름 → 정책이 크기보다 먼저 (문답 #39)
function localCheck(file: File, policy: Policy | null): UploadCheck {
  return checkUpload(file.name, file.size, {
    fixedBlocked: policy ? policy.fixed.filter((f) => f.blocked).map((f) => f.ext) : [],
    custom: policy ? policy.custom.map((c) => c.ext) : [],
  });
}

function precheck(check: UploadCheck, policy: Policy | null, bytes: number): Hint {
  const unknownPolicy = policy ? "" : " 정책을 불러오지 못해 차단 여부는 올리면 서버가 판단해요.";
  if (check.ok) {
    return { tone: "info", text: policy ? "올릴 수 있는 파일이에요. 최종 판정은 서버가 해요." : unknownPolicy.trim() };
  }
  switch (check.code) {
    case "EXTENSION_BLOCKED":
      // 4MiB를 넘으면 서버는 이름을 보기 전에 크기로 거부할 수 있다(요청 크기 선검사·플랫폼 413, 설계 6장)
      return {
        tone: "error",
        text:
          bytes > MAX_FILE_BYTES
            ? `${blockedMessage(check.matched, check.source)} 4MiB도 넘어서, 서버는 이름을 보기 전에 크기로 거부할 수 있어요.`
            : `${blockedMessage(check.matched, check.source)} 올려 보면 서버도 막아요.`,
      };
    case "FILE_TOO_LARGE":
      return { tone: "error", text: UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE + unknownPolicy };
    default:
      return { tone: "error", text: NAME_ERROR_MESSAGES[check.code] };
  }
}

export function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  const [check, setCheck] = useState<UploadCheck | null>(null); // 고른 파일의 브라우저 판정
  const [results, setResults] = useState<Result[]>([]);
  const [inputKey, setInputKey] = useState(0); // 올린 뒤 파일 선택을 비운다(같은 파일을 다시 골라도 change가 오게)
  const zoneRef = useRef<HTMLDivElement>(null);

  async function choose(picked: File | null) {
    setFile(picked);
    setHint(null);
    setCheck(null);
    if (!picked) return;
    // 고를 때마다 최신 정책으로 안내한다 — 다른 사람이 정책을 바꿨을 수 있다
    const res = await fetch("/api/policy", { cache: "no-store" }).catch(() => null);
    const policy: Policy | null = res?.ok ? await res.json().catch(() => null) : null;
    const result = localCheck(picked, policy);
    setCheck(result);
    setHint(precheck(result, policy, picked.size));
  }

  // 끌어다 놓기 — 한 번에 하나만 받는다. 둘 이상이면 고르지 않고 이유를 알린다
  const onDropped = useEffectEvent((files: File[]) => {
    if (files.length !== 1) {
      setHint({ tone: "error", text: "한 번에 파일 하나만 올릴 수 있어요." });
      return;
    }
    void choose(files[0]);
  });

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const drop = createDropZone({ zone, onDrop: (files) => onDropped(files) });
    return () => drop.destroy();
  }, []);

  // 올리기 버튼(LoadingButton)이 부른다. 서버의 판정(저장·차단·거부)은 결과 목록이 보여 주고,
  // 버튼의 실패 표시는 요청 자체가 실패했을 때(연결·서버 오류)만 쓴다
  async function submit() {
    if (!file) return;
    const blockedExt = check && !check.ok && check.code === "EXTENSION_BLOCKED" ? check.matched : null;
    const result = await send(file, blockedExt);
    setResults((prev) => [result, ...prev]);
    setFile(null);
    setHint(null);
    setCheck(null);
    setInputKey((k) => k + 1);
    if (result.status === "failed") throw new Error(result.message);
  }

  return (
    <section className="panel" aria-labelledby="upload-title">
      <div className="panel-head">
        <h2 id="upload-title">업로드 시험</h2>
        <p className="panel-desc">올린 파일은 비공개로 24시간 보관하고, 내려받을 수 없어요.</p>
      </div>

      <div className="block upload-form">
        <div className="upload-zone" ref={zoneRef}>
          <label className="upload-label">
            <input
              key={inputKey}
              className="upload-input"
              type="file"
              aria-describedby="upload-hint"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
            <span className="upload-guide">
              {file ? (
                <>
                  <span className="upload-chosen">{shownName(file.name)}</span>
                  <span className="upload-limits">{size(file.size)} · 다시 누르면 다른 파일을 골라요</span>
                </>
              ) : (
                <>
                  <span>파일을 끌어다 놓거나 눌러서 골라 주세요</span>
                  <span className="upload-limits">한 번에 하나, 4MiB까지</span>
                </>
              )}
            </span>
          </label>
        </div>
        <p id="upload-hint" className="hint" data-tone={hint?.tone}>
          {file && !hint ? "확인하는 중…" : (hint?.text ?? "")}
        </p>
        <LoadingButton onAction={submit} disabled={!file} loadingLabel="올리는 중" successLabel="완료" errorLabel="실패">
          올리기
        </LoadingButton>
      </div>

      <div className="block">
        <h3>이번 업로드 결과</h3>
        {results.length === 0 ? (
          <p className="empty">아직 올린 파일이 없어요. 이 화면에서 올린 결과만 보이고, 새로고침하면 사라져요.</p>
        ) : (
          <ol className="rows" aria-live="polite">
            {results.map((r) => (
              <li key={r.key}>
                <span className="row-line">
                  <span className="state" data-status={r.status}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  <span className="row-name">{r.name}</span>
                </span>
                <span className="row-detail">{r.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

async function send(file: File, blockedExt: string | null): Promise<Result> {
  const name = shownName(file.name);
  const key = crypto.randomUUID();
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/uploads", { method: "POST", body });
    const json = await res.json().catch(() => null);
    if (res.status === 201) return { key, name: json?.attempt?.name ?? name, status: "stored", message: "저장했어요." };
    // 서버가 이름을 보기 전에 크기로 거부했으면(이름 없는 시도) 브라우저의 차단 판정도 같이 알린다
    if (res.status === 413 && json?.attempt && json.attempt.name === null) {
      return { key, name, status: "rejected", message: tooLargeMessage(blockedExt) };
    }
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
    if (res.status === 413) return { key, name, status: "rejected", message: tooLargeMessage(blockedExt) };
    const message = json?.error?.message ?? POLICY_ERROR_MESSAGES.SERVER_ERROR;
    return { key, name, status: "failed", message: errorText(message, res.status, json?.error?.requestId ?? res.headers.get("x-request-id")) };
  } catch {
    return { key, name, status: "failed", message: OFFLINE };
  }
}
