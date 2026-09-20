import type pg from "pg";
import type { Asset, AssetInput, AssetSummary, Page } from "@asset-tracker/shared";
import type { AssetFilters, ListQuery, SummaryQuery } from "./list-query";

// The columns the API exposes, in the same shape as the seed file.
const COLUMNS = `id, name, type, status, lat, lng, installed_at, last_inspected_at, notes`;

// Splits the filters into parameterised SQL conditions. Values always go through
// $1, $2... never string concatenation.
//
// `scope` is the part every count agrees on. `status` and `uninspected` are kept apart
// because each is controlled by a chip in the UI, and a chip's count has to answer
// "how many would I get if I turned this on", which means leaving its own filter out.
// (A type count would need the same treatment; there isn't one yet, so type is in scope.)
function buildFilters(q: AssetFilters) {
  const scope: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q.type) scope.push(`type = ANY(${param(q.type)})`);

  if (q.bbox) {
    const { minLng, minLat, maxLng, maxLat } = q.bbox;
    scope.push(
      `ST_Intersects(geom, ST_MakeEnvelope(${param(minLng)}, ${param(minLat)}, ${param(maxLng)}, ${param(maxLat)}, 4326))`,
    );
  }

  if (q.near) {
    // geography makes the distance real meters on the Earth's surface, not degrees.
    const { lat, lng, radius } = q.near;
    scope.push(
      `ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${param(lng)}, ${param(lat)}), 4326)::geography, ${param(radius)})`,
    );
  }

  // Both are filtered in SQL rather than in the client, because the list is paginated:
  // only the server sees the whole matching set it has to page and count.
  const status = q.status ? `status = ANY(${param(q.status)})` : null;
  const uninspected = q.uninspected ? `last_inspected_at IS NULL` : null;

  return { scope, status, uninspected, params };
}

// Drops the conditions that aren't in play, and omits WHERE entirely if none are.
const whereFrom = (conditions: (string | null)[]) => {
  const active = conditions.filter((c) => c !== null);
  return active.length ? `WHERE ${active.join(" AND ")}` : "";
};

export function createAssetRepository(pool: pg.Pool) {
  return {
    async list(q: ListQuery): Promise<{ data: Asset[]; page: Page }> {
      const { scope, status, uninspected, params } = buildFilters(q);
      const where = whereFrom([...scope, status, uninspected]);
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

    // One row of counts for the current filters, in a single pass: FILTER applies a
    // condition to one aggregate, so this is one index scan rather than five queries.
    //
    // WHERE narrows to the scope only. The status and inspection conditions move into the
    // FILTER clauses, so each count can leave out the one its own chip controls:
    //   - the three status counts ignore `status`, or picking "Critical" would leave the
    //     other two chips reading 0 with no way to click back to them
    //   - the uninspected count ignores `uninspected` but honours `status`, so with "OK"
    //     picked it reads "how many OK assets have never been inspected"
    //   - total honours both, so it matches what the list is showing
    async summary(q: SummaryQuery): Promise<AssetSummary> {
      const { scope, status, uninspected, params } = buildFilters(q);
      const and = (condition: string | null) => (condition ? ` AND ${condition}` : "");
      const count = (condition: string) => `count(*) FILTER (WHERE ${condition})::int`;

      const { rows } = await pool.query<AssetSummary>(
        `SELECT ${count(`status = 'ok'${and(uninspected)}`)} AS ok,
                ${count(`status = 'warning'${and(uninspected)}`)} AS warning,
                ${count(`status = 'critical'${and(uninspected)}`)} AS critical,
                ${count(`last_inspected_at IS NULL${and(status)}`)} AS uninspected,
                ${count(`TRUE${and(status)}${and(uninspected)}`)} AS total
         FROM assets ${whereFrom(scope)}`,
        params,
      );
      return rows[0]!;
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
