import fs from "node:fs/promises";
import type pg from "pg";
import { z } from "zod";
import { AssetSchema, type Asset } from "@asset-tracker/shared";

const SeedSchema = z.array(AssetSchema);

export async function loadSeedFile(file: string): Promise<Asset[]> {
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  // Validate with the same rules as the API, so bad seed data fails loudly at startup.
  return SeedSchema.parse(raw);
}

export async function insertAssets(pool: pg.Pool, assets: Asset[]) {
  // One round trip: send the array as JSON and let Postgres unpack it into rows.
  await pool.query(
    `INSERT INTO assets (id, name, type, status, lat, lng, installed_at, last_inspected_at, notes)
     SELECT id, name, type, status, lat, lng, installed_at, last_inspected_at, notes
     FROM json_to_recordset($1::json) AS x(
       id uuid, name text, type text, status text, lat float8, lng float8,
       installed_at date, last_inspected_at date, notes text
     )`,
    [JSON.stringify(assets)],
  );
}

// Seeds only when the table is empty, so edits survive a server restart.
// To start over, clear the table (or `docker compose down -v`).
export async function seedIfEmpty(pool: pg.Pool, file: string) {
  const { rows } = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM assets");
  if (rows[0]!.count > 0) return 0;
  const assets = await loadSeedFile(file);
  await insertAssets(pool, assets);
  return assets.length;
}
