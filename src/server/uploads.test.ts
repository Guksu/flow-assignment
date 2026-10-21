import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { insertStoredAttempts, resetPolicyTables, resetUploadTables } from "@/test/db-helpers";
import { cleanupExpired } from "./cleanup";
import { pool } from "./db";
import { addCustom, setFixedBlocked } from "./policy-repo";
import { type FileStorage, MemoryStorage } from "./storage";
import { DAILY_LIMIT, handleUpload, MAX_FILE_BYTES, recordOversized } from "./uploads";

const RID = "00000000-0000-4000-8000-000000000001";
const bytes = (n: number) => new Uint8Array(n).fill(65);
const file = (name: string, size = 3) => ({ name, size, read: vi.fn(async () => bytes(size)) });
const attemptRow = async (id: string) =>
  (await pool.query("SELECT * FROM upload_attempt WHERE id = $1", [id])).rows[0];

let storage: MemoryStorage;

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  await resetPolicyTables();
  await resetUploadTables();
  storage = new MemoryStorage();
});
afterAll(() => pool.end());

describe("업로드 처리 (설계 6장)", () => {
  it("허용된 파일은 원래 이름 없이 uploads/<uuid>로 저장하고 24시간 뒤 만료로 기록한다 (위험 U4·U9)", async () => {
    const { attempt, code } = await handleUpload(file("보고서.PDF"), storage, RID);
    expect(code).toBeNull();
    expect(attempt).toMatchObject({ status: "stored", name: "보고서.PDF", ext: "pdf", sizeBytes: 3 });
    const row = await attemptRow(attempt.id);
    expect(row.blob_pathname).toBe(`uploads/${attempt.id}`);
    expect([...storage.files.keys()]).toEqual([`uploads/${attempt.id}`]);
    const hours = (row.expires_at.getTime() - row.created_at.getTime()) / 3_600_000;
    expect(hours).toBe(24);
  });

  it("차단 확장자는 저장하지 않고 걸린 규칙과 출처를 남긴다 — 화면을 거치지 않은 요청도 같다 (위험 U1)", async () => {
    await setFixedBlocked("exe", true, RID);
    await addCustom("tar.gz", RID);
    const exe = await handleUpload(file("Setup.EXE"), storage, RID);
    const tgz = await handleUpload(file("backup.tar.gz"), storage, RID);
    expect(exe).toMatchObject({ code: "EXTENSION_BLOCKED", attempt: { status: "blocked", matchedRule: "exe", matchedSource: "fixed" } });
    expect(tgz).toMatchObject({ code: "EXTENSION_BLOCKED", attempt: { matchedRule: "tar.gz", matchedSource: "custom" } });
    expect(storage.files.size).toBe(0);
  });

  it("정책은 요청마다 새로 읽는다 — 차단을 풀면 바로 통과", async () => {
    await setFixedBlocked("exe", true, RID);
    expect((await handleUpload(file("a.exe"), storage, RID)).code).toBe("EXTENSION_BLOCKED");
    await setFixedBlocked("exe", false, RID);
    expect((await handleUpload(file("a.exe"), storage, RID)).code).toBeNull();
  });

  it("이름이 잘못된 시도는 이름을 저장하지 않는다 (위험 D13)", async () => {
    const { attempt, code } = await handleUpload(file("evil.ex\u{200B}e"), storage, RID);
    expect(code).toBe("NAME_CONTROL_CHAR");
    expect(attempt).toMatchObject({ status: "rejected", name: null });
    expect((await attemptRow(attempt.id)).original_name).toBeNull();
  });

  it("4MiB를 넘으면 내용을 읽지 않고 거부한다 (위험 U2)", async () => {
    const big = file("big.pdf", MAX_FILE_BYTES + 1);
    const { attempt, code } = await handleUpload(big, storage, RID);
    expect(code).toBe("FILE_TOO_LARGE");
    expect(attempt.status).toBe("rejected");
    expect(big.read).not.toHaveBeenCalled();
  });

  it("크기를 넘는 파일도 확장자가 막혀 있으면 '차단'으로 기록하고, 내용은 읽지 않는다 (문답 #39)", async () => {
    await setFixedBlocked("exe", true, RID);
    const big = file("Setup.EXE", MAX_FILE_BYTES + 1);
    const { attempt, code } = await handleUpload(big, storage, RID);
    expect(code).toBe("EXTENSION_BLOCKED");
    expect(attempt).toMatchObject({ status: "blocked", matchedRule: "exe", name: "Setup.EXE" });
    expect(big.read).not.toHaveBeenCalled();
  });

  it("크기를 넘는 파일도 이름이 잘못됐으면 이름 사유가 먼저", async () => {
    const big = file("evil.ex\u{200B}e", MAX_FILE_BYTES + 1);
    expect((await handleUpload(big, storage, RID)).code).toBe("NAME_CONTROL_CHAR");
    expect(big.read).not.toHaveBeenCalled();
  });

  it("요청 크기만 보고 거부한 시도도 이름 없이 기록한다", async () => {
    const { attempt, code } = await recordOversized(5_000_000, RID);
    expect(code).toBe("FILE_TOO_LARGE");
    expect(attempt).toMatchObject({ status: "rejected", name: null, sizeBytes: 5_000_000 });
  });

  it("판정 로그에는 이름을 남기지 않는다 (위험 O2)", async () => {
    await handleUpload(file("홍길동_등본.pdf"), storage, RID);
    const line = vi.mocked(console.info).mock.calls.map(([l]) => String(l)).find((l) => l.includes("upload_attempt"));
    expect(JSON.parse(line ?? "{}")).toMatchObject({ event: "upload_attempt", requestId: RID, status: "stored", ext: "pdf" });
    expect(line).not.toContain("홍길동");
  });
});

describe(`하루 저장 ${DAILY_LIMIT}건 (KST 자정 경계, 위험 D4·D19)`, () => {
  it(`오늘 ${DAILY_LIMIT}건이 저장됐으면 거부한다. 차단·거부된 시도는 세지 않는다`, async () => {
    await insertStoredAttempts(DAILY_LIMIT);
    await setFixedBlocked("exe", true, RID);
    expect((await handleUpload(file("a.exe"), storage, RID)).code).toBe("EXTENSION_BLOCKED");
    const { attempt, code } = await handleUpload(file("a.pdf"), storage, RID);
    expect(code).toBe("DAILY_LIMIT_REACHED");
    expect(attempt.status).toBe("rejected");
    expect(storage.files.size).toBe(0);
  });

  it("어제(KST) 저장된 것은 세지 않는다", async () => {
    await insertStoredAttempts(DAILY_LIMIT, -1);
    expect((await handleUpload(file("a.pdf"), storage, RID)).code).toBeNull();
  });

  it(`${DAILY_LIMIT - 1}건에서 동시에 두 건을 올리면 한 건만 저장된다`, async () => {
    await insertStoredAttempts(DAILY_LIMIT - 1);
    const results = await Promise.all([handleUpload(file("a.pdf"), storage, RID), handleUpload(file("b.pdf"), storage, RID)]);
    expect(results.map((r) => r.code).sort()).toEqual(["DAILY_LIMIT_REACHED", null].sort());
    expect(storage.files.size).toBe(1);
  });
});

describe("저장 실패", () => {
  it("행을 거부로 바꾸고 그 경로 삭제를 한 번 시도한다 — 저장소에만 남는 파일이 없게 (위험 U8)", async () => {
    const broken: FileStorage = {
      put: vi.fn(async () => {
        throw new Error("blob down");
      }),
      remove: vi.fn(async () => {}),
    };
    const { attempt, code } = await handleUpload(file("a.pdf"), broken, RID);
    expect(code).toBe("STORAGE_ERROR");
    const row = await attemptRow(attempt.id);
    expect(row).toMatchObject({ status: "rejected", reason_code: "STORAGE_ERROR", blob_pathname: null });
    expect(broken.remove).toHaveBeenCalledWith([`uploads/${attempt.id}`]);
  });
});

describe("정리 (크론, 위험 U8·U9·P13)", () => {
  it("만료된 시도와 그 파일, 30일 지난 이력을 지우고 다시 돌려도 결과가 같다", async () => {
    const kept = await handleUpload(file("keep.pdf"), storage, RID);
    const old = await handleUpload(file("old.pdf"), storage, RID);
    await pool.query("UPDATE upload_attempt SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE id = $1", [old.attempt.id]);
    await pool.query(
      "INSERT INTO policy_audit_log (occurred_at, action, ext, request_id) VALUES (now() - interval '31 days', 'custom_added', 'old', $1)",
      [RID],
    );

    const first = await cleanupExpired(storage);
    expect(first).toMatchObject({ attempts: 1, files: 1 });
    expect(first.audit).toBeGreaterThanOrEqual(1);
    expect([...storage.files.keys()]).toEqual([`uploads/${kept.attempt.id}`]);
    expect(await attemptRow(old.attempt.id)).toBeUndefined();

    expect(await cleanupExpired(storage)).toEqual({ attempts: 0, files: 0, audit: 0 });
  });
});
