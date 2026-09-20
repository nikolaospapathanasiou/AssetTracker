import type pg from "pg";
import type { Asset, AssetInput, Page } from "@asset-tracker/shared";
import type { ListQuery } from "./list-query";

// The columns the API exposes, in the same shape as the seed file.
const COLUMNS = `id, name, type, status, lat, lng, installed_at, last_inspected_at, notes`;

// Builds a parameterised WHERE clause. Values always go through $1, $2... never string concatenation.
function buildWhere(q: ListQuery) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q.type) conditions.push(`type = ANY(${param(q.type)})`);
  if (q.status) conditions.push(`status = ANY(${param(q.status)})`);
  // Filtered in SQL rather than in the client, because the list is paginated:
  // only the server sees the whole matching set it has to page and count.
  if (q.uninspected) conditions.push(`last_inspected_at IS NULL`);

  if (q.bbox) {
    const { minLng, minLat, maxLng, maxLat } = q.bbox;
    conditions.push(
      `ST_Intersects(geom, ST_MakeEnvelope(${param(minLng)}, ${param(minLat)}, ${param(maxLng)}, ${param(maxLat)}, 4326))`,
    );
  }

  if (q.near) {
    // geography makes the distance real meters on the Earth's surface, not degrees.
    const { lat, lng, radius } = q.near;
    conditions.push(
      `ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${param(lng)}, ${param(lat)}), 4326)::geography, ${param(radius)})`,
    );
  }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

export function createAssetRepository(pool: pg.Pool) {
  return {
    async list(q: ListQuery): Promise<{ data: Asset[]; page: Page }> {
      const { where, params } = buildWhere(q);
      const n = params.length;
      const [rows, count] = await Promise.all([
        pool.query<Asset>(
          // id as a tie-breaker keeps the order stable between pages.
          `SELECT ${COLUMNS} FROM assets ${where} ORDER BY name, id LIMIT $${n + 1} OFFSET $${n + 2}`,
          [...params, q.limit, q.offset],
        ),
        pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM assets ${where}`, params),
      ]);
      return { data: rows.rows, page: { limit: q.limit, offset: q.offset, total: count.rows[0]!.total } };
    },

    async get(id: string): Promise<Asset | null> {
      const { rows } = await pool.query<Asset>(`SELECT ${COLUMNS} FROM assets WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async create(input: AssetInput): Promise<Asset> {
      const { rows } = await pool.query<Asset>(
        `INSERT INTO assets (name, type, status, lat, lng, installed_at, last_inspected_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${COLUMNS}`,
        [input.name, input.type, input.status, input.lat, input.lng, input.installed_at, input.last_inspected_at, input.notes],
      );
      return rows[0]!;
    },

    // Writes the full, already validated asset. Returns null if it no longer exists.
    async update(id: string, input: AssetInput): Promise<Asset | null> {
      const { rows } = await pool.query<Asset>(
        `UPDATE assets
         SET name = $2, type = $3, status = $4, lat = $5, lng = $6,
             installed_at = $7, last_inspected_at = $8, notes = $9, updated_at = now()
         WHERE id = $1
         RETURNING ${COLUMNS}`,
        [id, input.name, input.type, input.status, input.lat, input.lng, input.installed_at, input.last_inspected_at, input.notes],
      );
      return rows[0] ?? null;
    },

    async remove(id: string): Promise<boolean> {
      const { rowCount } = await pool.query(`DELETE FROM assets WHERE id = $1`, [id]);
      return rowCount === 1;
    },
  };
}

export type AssetRepository = ReturnType<typeof createAssetRepository>;
