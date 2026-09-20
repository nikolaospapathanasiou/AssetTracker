import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Asset } from "@asset-tracker/shared";
import { createApp } from "../src/app";
import { createPool, migrate } from "../src/db";
import { insertAssets } from "../src/seed";

// Runs the real app against a real PostGIS database (not mocks),
// because the geo queries are the part most worth testing.
const pool = createPool(process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/assets_test");
const app = createApp(pool, { logRequests: false });

// A small, hand-made fixture with known positions.
// Two of the four have never been inspected, so the uninspected filter has both cases to sort.
const base = { installed_at: "2020-01-01", last_inspected_at: null, notes: "" } as const;
const fixtures: Asset[] = [
  // Boston downtown, never inspected
  { ...base, id: "00000000-0000-4000-8000-000000000001", name: "Pipe Boston", type: "pipe", status: "ok", lat: 42.3601, lng: -71.0589 },
  // ~1.1 km north of the first one
  { ...base, id: "00000000-0000-4000-8000-000000000002", name: "Valve Boston", type: "valve", status: "critical", lat: 42.3701, lng: -71.0589, last_inspected_at: "2025-06-01" },
  // New York
  { ...base, id: "00000000-0000-4000-8000-000000000003", name: "Hydrant NYC", type: "hydrant", status: "warning", lat: 40.7128, lng: -74.006, last_inspected_at: "2022-04-10" },
  // Chicago, never inspected
  { ...base, id: "00000000-0000-4000-8000-000000000004", name: "Sensor Chicago", type: "sensor", status: "critical", lat: 41.8781, lng: -87.6298 },
];

const names = (res: request.Response) => res.body.data.map((a: Asset) => a.name);

beforeAll(async () => {
  await migrate(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE assets");
  await insertAssets(pool, fixtures);
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/assets", () => {
  it("filters by type and status, with comma-separated values", async () => {
    const res = await request(app).get("/api/assets?status=critical&type=valve,pipe").expect(200);
    expect(names(res)).toEqual(["Valve Boston"]);
    expect(res.body.page).toEqual({ limit: 50, offset: 0, total: 1 });
  });

  it("finds assets inside a bounding box", async () => {
    // Box around the Boston area only.
    const res = await request(app).get("/api/assets?bbox=-71.2,42.2,-70.9,42.5").expect(200);
    expect(names(res)).toEqual(["Pipe Boston", "Valve Boston"]);
  });

  it("finds assets within a radius in meters", async () => {
    const near = "lat=42.3601&lng=-71.0589";
    expect(names(await request(app).get(`/api/assets?${near}&radius=500`))).toEqual(["Pipe Boston"]);
    expect(names(await request(app).get(`/api/assets?${near}&radius=1500`))).toEqual(["Pipe Boston", "Valve Boston"]);
  });

  it("paginates with a stable order and reports the total", async () => {
    const res = await request(app).get("/api/assets?limit=2&offset=2").expect(200);
    expect(names(res)).toEqual(["Sensor Chicago", "Valve Boston"]);
    expect(res.body.page).toEqual({ limit: 2, offset: 2, total: 4 });
  });

  it("filters to assets with no inspection on record", async () => {
    const res = await request(app).get("/api/assets?uninspected=true").expect(200);
    expect(names(res)).toEqual(["Pipe Boston", "Sensor Chicago"]);
    expect(res.body.page.total).toBe(2);
  });

  it("combines uninspected with the other filters", async () => {
    const res = await request(app).get("/api/assets?uninspected=true&status=critical").expect(200);
    expect(names(res)).toEqual(["Sensor Chicago"]);
  });

  it("rejects uninspected values other than true", async () => {
    await request(app).get("/api/assets?uninspected=false").expect(400);
  });

  it("rejects invalid query params with a 400 that explains why", async () => {
    const res = await request(app).get("/api/assets?type=tree&bbox=1,2,3&lat=42").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["type.0", "bbox"]));
  });
});

describe("GET /api/assets/summary", () => {
  // Fixtures: ok/critical in Boston, warning in NYC, critical in Chicago; two never inspected
  // (the ok one in Boston and the critical one in Chicago).
  it("counts every status, the uninspected assets and the total", async () => {
    const res = await request(app).get("/api/assets/summary").expect(200);
    expect(res.body).toEqual({ ok: 1, warning: 1, critical: 2, uninspected: 2, total: 4 });
  });

  it("narrows every count by the filters that no chip owns", async () => {
    const boston = await request(app).get("/api/assets/summary?bbox=-71.2,42.2,-70.9,42.5").expect(200);
    expect(boston.body).toEqual({ ok: 1, warning: 0, critical: 1, uninspected: 1, total: 2 });
  });

  it("keeps the status counts whole, so a picked status is not a dead end", async () => {
    const res = await request(app).get("/api/assets/summary?status=critical").expect(200);
    // The three status counts ignore status=critical and still report the full picture,
    // but the uninspected count honours it: 1 of the 2 critical assets was never inspected.
    // total honours it too, so it matches what the list would show.
    expect(res.body).toEqual({ ok: 1, warning: 1, critical: 2, uninspected: 1, total: 2 });
  });

  it("keeps the uninspected count whole when the inspection filter is on", async () => {
    const res = await request(app).get("/api/assets/summary?uninspected=true").expect(200);
    // The status counts narrow to the never inspected assets; uninspected ignores its own
    // filter, so the chip keeps showing what turning it on gives you.
    expect(res.body).toEqual({ ok: 1, warning: 0, critical: 1, uninspected: 2, total: 2 });
  });

  it("rejects paging params instead of quietly ignoring them", async () => {
    await request(app).get("/api/assets/summary?limit=10").expect(400);
    await request(app).get("/api/assets/summary?offset=0").expect(400);
  });
});

describe("create, edit, delete", () => {
  const newAsset = {
    name: "Sensor New",
    type: "sensor",
    status: "ok",
    lat: 42.35,
    lng: -71.07,
    installed_at: "2024-01-10",
    last_inspected_at: null,
    notes: "",
  };

  it("creates an asset and returns it with an id and Location header", async () => {
    const res = await request(app).post("/api/assets").send(newAsset).expect(201);
    expect(res.body).toMatchObject(newAsset);
    expect(res.headers.location).toBe(`/api/assets/${res.body.id}`);
    await request(app).get(res.headers.location!).expect(200);
  });

  it("rejects an invalid asset without writing anything", async () => {
    const res = await request(app).post("/api/assets").send({ ...newAsset, lat: 200, status: "fine" }).expect(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["lat", "status"]);
    const all = await request(app).get("/api/assets");
    expect(all.body.page.total).toBe(fixtures.length);
  });

  it("PATCH validates the merged asset, not just the patch", async () => {
    const id = fixtures[0]!.id; // installed 2020-01-01
    await request(app).patch(`/api/assets/${id}`).send({ last_inspected_at: "2019-05-01" }).expect(400);
    const ok = await request(app).patch(`/api/assets/${id}`).send({ last_inspected_at: "2024-05-01", status: "warning" }).expect(200);
    expect(ok.body).toMatchObject({ id, last_inspected_at: "2024-05-01", status: "warning", name: "Pipe Boston" });
  });

  it("deletes an asset, then returns 404 for it", async () => {
    const id = fixtures[0]!.id;
    await request(app).delete(`/api/assets/${id}`).expect(204);
    await request(app).get(`/api/assets/${id}`).expect(404);
    await request(app).delete(`/api/assets/${id}`).expect(404);
  });

  it("returns 400 for a malformed id", async () => {
    await request(app).get("/api/assets/not-a-uuid").expect(400);
  });
});
