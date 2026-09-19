import { Router } from "express";
import { z } from "zod";
import { AssetInputSchema, AssetPatchSchema, type AssetListResponse } from "@asset-tracker/shared";
import { notFound, parseOrThrow } from "../http/errors";
import { ListQuerySchema } from "./list-query";
import type { AssetRepository } from "./assets.repository";

const IdParams = z.object({ id: z.uuid({ error: "Not a valid asset id" }) });

// Handlers stay thin: validate input, call the repository, shape the response.
export function assetsRouter(repo: AssetRepository) {
  const router = Router();

  router.get("/", async (req, res) => {
    const query = parseOrThrow(ListQuerySchema, req.query);
    const body: AssetListResponse = await repo.list(query);
    res.json(body);
  });

  router.get("/:id", async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    const asset = await repo.get(id);
    if (!asset) throw notFound("Asset");
    res.json(asset);
  });

  router.post("/", async (req, res) => {
    const input = parseOrThrow(AssetInputSchema, req.body);
    const asset = await repo.create(input);
    res.status(201).location(`${req.baseUrl}/${asset.id}`).json(asset);
  });

  router.patch("/:id", async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    const patch = parseOrThrow(AssetPatchSchema, req.body);

    const existing = await repo.get(id);
    if (!existing) throw notFound("Asset");

    // Validate the merged result, not just the patch: a new last_inspected_at
    // must still be after the *stored* installed_at.
    const { id: _id, ...current } = existing;
    const merged = parseOrThrow(AssetInputSchema, { ...current, ...patch });

    const updated = await repo.update(id, merged);
    if (!updated) throw notFound("Asset"); // deleted in the meantime
    res.json(updated);
  });

  router.delete("/:id", async (req, res) => {
    const { id } = parseOrThrow(IdParams, req.params);
    const removed = await repo.remove(id);
    if (!removed) throw notFound("Asset");
    res.status(204).end();
  });

  return router;
}
