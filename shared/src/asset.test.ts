import { describe, expect, it } from "vitest";
import { AssetInputSchema, AssetPatchSchema } from "./asset";

const valid = {
  name: "Valve V-9000",
  type: "valve",
  status: "ok",
  lat: 42.36,
  lng: -71.06,
  installed_at: "2020-01-01",
  last_inspected_at: "2024-06-01",
  notes: "",
};

describe("AssetInputSchema", () => {
  it("accepts a valid asset", () => {
    expect(AssetInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an inspection date before the install date", () => {
    const result = AssetInputSchema.safeParse({ ...valid, last_inspected_at: "2019-12-31" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["last_inspected_at"]);
  });

  it("rejects coordinates out of range and unknown fields", () => {
    expect(AssetInputSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
    expect(AssetInputSchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(AssetInputSchema.safeParse({ ...valid, installed_at: "2021-02-30" }).success).toBe(false);
  });
});

describe("AssetPatchSchema", () => {
  it("rejects an empty patch", () => {
    expect(AssetPatchSchema.safeParse({}).success).toBe(false);
  });
});
