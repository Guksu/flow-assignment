import { describe, expect, it } from "vitest";
import { pendingMigrations } from "./migrate-lib.mjs";

describe("pendingMigrations", () => {
  it("returns files not yet applied, in name order", () => {
    expect(pendingMigrations(["002_upload.sql", "001_policy.sql"], [])).toEqual([
      "001_policy.sql",
      "002_upload.sql",
    ]);
    expect(pendingMigrations(["001_policy.sql", "002_upload.sql"], ["001_policy.sql"])).toEqual([
      "002_upload.sql",
    ]);
  });

  it("returns nothing when everything is applied", () => {
    expect(pendingMigrations(["001_policy.sql"], ["001_policy.sql"])).toEqual([]);
    expect(pendingMigrations([], [])).toEqual([]);
  });

  it("rejects files that do not follow NNN_name.sql", () => {
    expect(() => pendingMigrations(["1_policy.sql"], [])).toThrow(/001_name\.sql/);
    expect(() => pendingMigrations(["001_Policy.sql"], [])).toThrow(/001_name\.sql/);
  });

  it("stops when an applied migration file has disappeared", () => {
    expect(() => pendingMigrations(["002_upload.sql"], ["001_policy.sql"])).toThrow(/missing/);
  });

  it("stops when a pending migration is older than the last applied one", () => {
    expect(() =>
      pendingMigrations(["001_policy.sql", "002_upload.sql"], ["002_upload.sql"]),
    ).toThrow(/older than 002_upload\.sql/);
  });
});
