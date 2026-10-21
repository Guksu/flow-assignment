import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/server/db";
import { setFixedBlocked } from "@/server/policy-repo";
import { memoryStorage } from "@/server/storage";
import { resetPolicyTables, resetUploadTables } from "@/test/db-helpers";
import { GET as cleanup } from "../cron/cleanup/route";
import { POST as upload } from "./route";

// curl처럼 multipart를 직접 보낸다 — 화면 검사를 거치지 않은 요청 (위험 U1)
const form = (...files: [string, string][]) => {
  const body = new FormData();
  for (const [name, content] of files) body.append("file", new File([content], name));
  return new Request("http://localhost/api/uploads", { method: "POST", body });
};
const count = async () => Number((await pool.query("SELECT count(*) FROM upload_attempt")).rows[0].count);

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  await resetPolicyTables();
  await resetUploadTables();
  memoryStorage.files.clear();
});
afterAll(() => pool.end());

describe("POST /api/uploads", () => {
  it("허용 → 201, 시도 정보와 요청 번호", async () => {
    const res = await upload(form(["report.pdf", "hello"]));
    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toMatchObject({ attempt: { status: "stored", name: "report.pdf", sizeBytes: 5 } });
    expect(memoryStorage.files.size).toBe(1);
  });

  it("차단 확장자 → 422, 걸린 규칙과 출처, 같은 문구 체계", async () => {
    await setFixedBlocked("exe", true, "00000000-0000-4000-8000-000000000002");
    const res = await upload(form(["Setup.EXE", "MZ"]));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({
      error: { code: "EXTENSION_BLOCKED", details: { matched: "exe", source: "fixed" } },
      attempt: { status: "blocked" },
    });
    expect(memoryStorage.files.size).toBe(0);
  });

  it("이름 오류 → 400 NAME_*", async () => {
    const res = await upload(form(["evil.exe::$DATA", "x"]));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "NAME_FORBIDDEN_CHAR" }, attempt: { name: null } });
  });

  it("요청 크기가 4MiB를 크게 넘으면 본문을 읽지 않고 413, 시도는 이름 없이 기록", async () => {
    const req = new Request("http://localhost/api/uploads", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(5 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
    });
    const res = await upload(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: "FILE_TOO_LARGE" }, attempt: { name: null } });
    expect(req.bodyUsed).toBe(false);
  });

  it.each([
    ["파일 필드 없음", () => new Request("http://localhost/api/uploads", { method: "POST", body: new FormData() })],
    ["파일 둘", () => form(["a.pdf", "a"], ["b.pdf", "b"])],
    ["multipart 아님", () => new Request("http://localhost/api/uploads", { method: "POST", body: "{}" })],
  ])("%s → 400 INVALID_REQUEST, 시도로 기록하지 않음", async (_case, make) => {
    const res = await upload(make());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(await count()).toBe(0);
  });
});

describe("GET /api/cron/cleanup", () => {
  const SECRET = "test-cron-secret-0123456789";

  it("비밀값이 없거나 틀리면 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await cleanup(new Request("http://localhost/api/cron/cleanup"))).status).toBe(401);
    const wrong = new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer nope" } });
    expect((await cleanup(wrong)).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("맞는 비밀값이면 정리 결과", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await cleanup(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attempts: 0, files: 0 });
    vi.unstubAllEnvs();
  });
});
