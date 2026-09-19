import { createApp } from "./app";
import { config } from "./config";
import { createPool, migrate, waitForDb } from "./db";
import { seedIfEmpty } from "./seed";

async function main() {
  const pool = createPool(config.databaseUrl);
  await waitForDb(pool);
  await migrate(pool);

  const seeded = await seedIfEmpty(pool, config.seedFile);
  console.log(seeded > 0 ? `Seeded ${seeded} assets` : "Assets table already has data, skipping seed");

  createApp(pool).listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
