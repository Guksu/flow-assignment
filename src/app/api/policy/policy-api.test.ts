import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_EXTENSION_MESSAGES } from "@/domain/messages";
import { pool } from "@/server/db";
import { resetPolicyTables } from "@/test/db-helpers";
import { GET as getAudit } from "./audit/route";
import { DELETE as deleteCustom } from "./custom/[ext]/route";
import { POST as postCustom } from "./custom/route";
import { PUT as putFixed } from "./fixed/[ext]/route";
import { POST as postReset } from "./reset/route";
import { GET as getPolicy } from "./route";

// 라우트 핸들러를 직접 부른다 — 화면 검사를 거치지 않은 curl 같은 직접 요청과 같다 (위험 U1)
const url = (path: string) => `http://localhost/api/policy${path}`;
const json = (body: unknown) => ({ body: typeof body === "string" ? body : JSON.stringify(body) });
const ctx = (ext: string) => ({ params: Promise.resolve({ ext }) });

beforeEach(resetPolicyTables);
afterAll(() => pool.end());

describe("GET /api/policy", () => {
  it("정책 전체를 캐시 금지로 돌려준다 (위험 D16)", async () => {
    const res = await getPolicy();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ customCount: 0, customLimit: 200, maxLength: 20, custom: [] });
    expect(body.fixed).toHaveLength(7);
  });

  it("DB 오류는 정해 둔 문구로만 알리고 원문을 내보내지 않는다 (위험 U13)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("connect failed postgres://u:secret@db/x"));
    const res = await getPolicy();
    spy.mockRestore();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(JSON.parse(text)).toMatchObject({ error: { code: "SERVER_ERROR" } });
  });

  it("연결 거부처럼 message가 빈 오류도 서버 로그에 원인 코드를 남긴다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    const spy = vi.spyOn(pool, "query").mockRejectedValueOnce(refused);
    await getPolicy();
    spy.mockRestore();
    expect(log.mock.calls.at(-1)?.[1]).toBe("ECONNREFUSED");
  });
});

describe("PUT /api/policy/fixed/{ext}", () => {
  it("체크", async () => {
    const res = await putFixed(new Request(url("/fixed/exe"), { method: "PUT", ...json({ blocked: true }) }), ctx("exe"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ext: "exe", blocked: true, changed: true });
  });

  it.each([{ blocked: "yes" }, {}, "not json", "[]"])("잘못된 본문 %j → 400 INVALID_BODY", async (body) => {
    const res = await putFixed(new Request(url("/fixed/exe"), { method: "PUT", ...json(body) }), ctx("exe"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
  });

  it("없는 고정 확장자 → 404", async () => {
    const res = await putFixed(new Request(url("/fixed/zip"), { method: "PUT", ...json({ blocked: true }) }), ctx("zip"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "UNKNOWN_FIXED_EXTENSION" } });
  });
});

describe("POST /api/policy/custom", () => {
  const post = (body: unknown) => postCustom(new Request(url("/custom"), { method: "POST", ...json(body) }));

  it("추가 → 201", async () => {
    const res = await post({ ext: " .SH " });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ext: "sh", customCount: 1 });
  });

  it("형식 오류 → 400, 화면과 같은 문구 (위험 X7)", async () => {
    const res = await post({ ext: "*.exe" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_EXTENSION", message: CUSTOM_EXTENSION_MESSAGES.WILDCARD, details: { reason: "WILDCARD" } },
    });
  });

  it.each([
    ["exe", "FIXED_EXTENSION"],
    ["ｅｘｅ", "FIXED_EXTENSION"],
  ])("%j → 409 %s", async (ext, code) => {
    const res = await post({ ext });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code } });
  });

  it("중복 → 409", async () => {
    await post({ ext: "sh" });
    const res = await post({ ext: "sh" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "DUPLICATE_EXTENSION" } });
  });

  it.each([{}, { ext: 3 }, "x", { ext: "a".repeat(2000) }])("잘못된 본문 → 400 INVALID_BODY", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
  });
});

describe("DELETE /api/policy/custom/{ext}", () => {
  it("있어도 없어도 204 (멱등)", async () => {
    await postCustom(new Request(url("/custom"), { method: "POST", ...json({ ext: "sh" }) }));
    const first = await deleteCustom(new Request(url("/custom/sh"), { method: "DELETE" }), ctx("sh"));
    const second = await deleteCustom(new Request(url("/custom/sh"), { method: "DELETE" }), ctx("sh"));
    expect([first.status, second.status]).toEqual([204, 204]);
  });

  it("잘못된 확장자 → 400", async () => {
    const res = await deleteCustom(new Request(url("/custom/*"), { method: "DELETE" }), ctx("*"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/policy/reset · GET /api/policy/audit", () => {
  it("초기화하면 정책 전체를 돌려주고, 이력에 남는다", async () => {
    await postCustom(new Request(url("/custom"), { method: "POST", ...json({ ext: "sh" }) }));
    const res = await postReset();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ customCount: 0, custom: [] });

    const audit = await getAudit(new Request(url("/audit?limit=1")));
    expect(audit.headers.get("cache-control")).toBe("no-store");
    const { items } = await audit.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "policy_reset", ext: null });
  });

  it.each(["0", "-1", "abc", "1000"])("limit=%s는 1~50 안으로 맞춘다", async (limit) => {
    const res = await getAudit(new Request(url(`/audit?limit=${limit}`)));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeLessThanOrEqual(50);
  });
});
