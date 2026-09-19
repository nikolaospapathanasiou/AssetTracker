# Asset tracker

A small web app for an asset team to see, filter, find, create, edit and delete physical assets on a map.

- **Backend:** Node.js, Express 5, TypeScript, PostgreSQL + PostGIS
- **Frontend:** React 19, TypeScript, Vite, Leaflet (react-leaflet), TanStack Query, react-hook-form
- **Shared:** one package of Zod schemas used by both the API and the form

## Running it

Requirements: Node 22+ and Docker (Docker Desktop on Windows).

```bash
npm install
npm run db:up      # starts PostGIS in Docker (dev DB "assets" + test DB "assets_test")
npm run dev        # API on http://localhost:3001, web app on http://localhost:5173
```

On startup the API creates the schema and seeds `server/seed.json` **if the table is empty**, so your edits survive a restart. To start fresh: `docker compose down -v` (deletes the DB volume), then `npm run db:up` again.

```bash
npm test           # schema unit tests + API integration tests (needs the DB running)
npm run typecheck  # all three packages
```

Configuration (all optional): `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `SEED_FILE`.

## Project structure

```
shared/   Zod schemas and API types, imported by both server and web
server/
  src/
    schema.sql                 table, generated geometry column, indexes
    db.ts, seed.ts             connection, migration, seeding
    app.ts, index.ts           app factory and startup
    http/                      error format, request logging
    assets/
      list-query.ts            parsing and validating list query params
      assets.repository.ts     all SQL
      assets.routes.ts         thin HTTP handlers
  test/                        integration tests against a real PostGIS DB
web/
  src/
    api/                       fetch client and TanStack Query hooks
    hooks/useFilters.ts        filter state, synced to the URL
    components/                list, filters, map, detail, form, location picker
```

## API

All errors use one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request is invalid", "details": [{ "path": "lat", "message": "..." }] } }
```

Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500, details are logged, never returned).

### `GET /api/assets`

| Param | Example | Notes |
|---|---|---|
| `type` | `pipe,valve` | comma-separated, any of `pipe`, `hydrant`, `sensor`, `valve` |
| `status` | `warning,critical` | comma-separated, any of `ok`, `warning`, `critical` |
| `bbox` | `-71.2,42.2,-70.9,42.5` | `minLng,minLat,maxLng,maxLat` (GeoJSON order) |
| `lat`, `lng`, `radius` | `lat=42.36&lng=-71.06&radius=1000` | radius in meters; all three together |
| `limit` | `50` | default 50, max 500 |
| `offset` | `0` | default 0 |

Filters combine with AND. Results are ordered by name (id as tie-breaker, so paging is stable). Unknown params are rejected with 400 rather than silently ignored, so a typo like `types=pipe` doesn't quietly return everything.

```json
{ "data": [ { "id": "...", "name": "Valve V-0001", "type": "valve", "status": "ok", "lat": 41.83, "lng": -87.65,
              "installed_at": "2001-12-22", "last_inspected_at": null, "notes": "" } ],
  "page": { "limit": 50, "offset": 0, "total": 150 } }
```

### Other endpoints

| Method | Path | Success |
|---|---|---|
| `GET` | `/api/assets/:id` | 200 with the asset |
| `POST` | `/api/assets` | 201 with the asset and a `Location` header |
| `PATCH` | `/api/assets/:id` | 200 with the updated asset; send any subset of fields |
| `DELETE` | `/api/assets/:id` | 204 |

The resource shape matches the seed file (snake_case), so the data contract stays the one we were given.

## Decisions and tradeoffs

**PostGIS instead of in-memory.** The geospatial query is a core part of the brief, so I wanted a real spatial index rather than a loop with a haversine formula. `lat`/`lng` are plain columns (easy to read and write), and a `geom` column is *generated* from them, so the two can never disagree. That also puts the lng/lat ordering (PostGIS points are x, y) in exactly one place.

**Both geo filters, each with its own index.**
- `bbox` uses `ST_Intersects` on the geometry column. It maps directly to "what's on my screen", which is how the UI uses it ("Search this area").
- `lat`/`lng`/`radius` uses `ST_DWithin` on `geom::geography`, so the radius is real meters on the Earth, not degrees. An expression index on `(geom::geography)` keeps it indexed. I checked both with `EXPLAIN`.
- Not handled: a bbox crossing the antimeridian (minLng > maxLng is rejected). Not relevant for this data.

**Offset pagination with a total.** Simple, lets the UI show "26–50 of 137", and fine at this size. With a large or fast-changing table I'd switch to keyset (cursor) pagination on `(name, id)`, because offsets get slow and rows can shift between pages.

**Validation in one place.** `shared/src/asset.ts` defines the rules once. The form uses them for instant feedback; the API runs them again because it can't trust clients. The DB has matching `CHECK` constraints as a last line of defense. The cross-field rule (last inspection not before install) is where this matters most.

**PATCH validates the merged record.** A patch like `{ "last_inspected_at": "2019-01-01" }` is valid on its own, but not if the stored install date is 2020. So the handler loads the asset, merges the patch, and validates the full result. Tradeoff: read-then-write without a transaction, so two simultaneous edits could race. Fine here; a real system would use a transaction with `SELECT ... FOR UPDATE` or an optimistic `version` column.

**Seed only when empty.** Seeding on every start would wipe user edits. The seed file is validated with the same schema before insert, so bad seed data fails loudly at startup. Inserted in one round trip via `json_to_recordset`.

**Dates stay strings.** `pg` turns `DATE` into a JS `Date` at local midnight, which can shift the day by timezone. The API keeps `YYYY-MM-DD` strings end to end.

**Frontend state.**
- Server state (assets) lives only in TanStack Query. After any write, one invalidation refreshes the list, map and detail.
- Filters live in the URL, so a filtered view survives a refresh and can be shared.
- The side panel is a single state value (`view` / `edit` / `create`), so impossible combinations can't happen.
- The list and the map run separate queries: the list pages 25 at a time, the map asks for up to 500 in view. If there are more, the map says so instead of silently dropping markers.

**Leaflet.** Mature, small, no API key, and plenty for ~150 points. I used circle markers: color-coded by status, no marker image files to bundle, and drawn in priority order so a critical asset is never hidden behind an OK one in a dense area. MapLibre would be the pick for vector tiles or thousands of points.

## Deliberately skipped

- Auth, mobile layout, deployment, accessibility audit (out of scope per the brief).
- Marker clustering. With the data grouped in four cities, clustering would be the next UX improvement.
- Frontend tests. With limited time, the tests go where bugs are most likely and most costly: the geo queries and validation rules, tested against a real PostGIS database. Next would be a form test (server errors map onto fields) and a Playwright smoke test.
- Text search, sorting options, bulk edits.
- Migration tooling. `schema.sql` is idempotent (`IF NOT EXISTS`); a real project would use node-pg-migrate or similar.

## What I'd do next

1. Marker clustering, and draw the area/radius search on the map.
2. Optimistic concurrency for edits (`version` column, 409 on conflict).
3. Keyset pagination and an OpenAPI spec generated from the Zod schemas.
4. Inspection history as its own table instead of a single `last_inspected_at`.
