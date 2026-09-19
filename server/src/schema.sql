CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('pipe', 'hydrant', 'sensor', 'valve')),
  status            text NOT NULL CHECK (status IN ('ok', 'warning', 'critical')),
  lat               double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng               double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  installed_at      date NOT NULL,
  last_inspected_at date CHECK (last_inspected_at >= installed_at),
  notes             text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Derived from lat/lng so the two can never disagree.
  -- Note the order: PostGIS points are (x, y) = (lng, lat).
  geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED
);

-- Bounding box queries use the geometry index.
CREATE INDEX IF NOT EXISTS assets_geom_idx ON assets USING GIST (geom);
-- Radius queries measure in meters on the geography type; this expression index keeps them indexed.
CREATE INDEX IF NOT EXISTS assets_geog_idx ON assets USING GIST ((geom::geography));
CREATE INDEX IF NOT EXISTS assets_type_status_idx ON assets (type, status);
