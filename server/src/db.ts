import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// By default pg turns DATE columns into JS Date objects at local midnight,
// which can shift the day depending on the server's timezone.
// We keep them as the plain 'YYYY-MM-DD' strings the API uses.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString });
}

// Right after `docker compose up` Postgres may still be starting, so retry for a few seconds.
export async function waitForDb(pool: pg.Pool, attempts = 15) {
  for (let i = 1; ; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`Waiting for database (${i}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

// Idempotent schema setup. A real project would use a migration tool
// (node-pg-migrate, Flyway...), but one CREATE ... IF NOT EXISTS file is enough here.
export async function migrate(pool: pg.Pool) {
  const sql = await fs.readFile(path.join(here, "schema.sql"), "utf8");
  await pool.query(sql);
}
