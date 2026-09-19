import express from "express";
import type pg from "pg";
import { createAssetRepository } from "./assets/assets.repository";
import { assetsRouter } from "./assets/assets.routes";
import { errorHandler, unknownRoute } from "./http/errors";
import { requestLog } from "./http/request-log";

// Building the app from a pool (instead of importing a global one) lets tests
// run the real app against a separate test database.
export function createApp(pool: pg.Pool, { logRequests = true } = {}) {
  const app = express();
  if (logRequests) app.use(requestLog);
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/assets", assetsRouter(createAssetRepository(pool)));

  app.use(unknownRoute);
  app.use(errorHandler);
  return app;
}
