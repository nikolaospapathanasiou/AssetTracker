import { z } from "zod";
import { ASSET_STATUSES, ASSET_TYPES } from "@asset-tracker/shared";

// Query strings are always strings, so every param is parsed from text.

// "pipe,valve" -> ["pipe", "valve"]
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

// "1.5" -> 1.5 (z.number() rejects NaN, so "abc" fails here)
const num = z.string().trim().min(1).transform(Number).pipe(z.number({ error: "Must be a number" }));

// A flag that is only ever switched on. "uninspected=false" is rejected rather than accepted
// as a no-op, because leaving the param out already means "don't filter on inspections".
const trueFlag = z.literal("true", { error: "Only uninspected=true is supported" }).transform(() => true);

// bbox=minLng,minLat,maxLng,maxLat (same order as GeoJSON and PostGIS).
const bbox = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(
    z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  )
  .refine(([minLng, minLat, maxLng, maxLat]) => minLng <= maxLng && minLat <= maxLat, {
    message: "bbox must be minLng,minLat,maxLng,maxLat with min <= max",
  })
  .transform(([minLng, minLat, maxLng, maxLat]) => ({ minLng, minLat, maxLng, maxLat }));

// The params that describe *which* assets match. The list and the summary accept exactly
// these, so they are written once and spread into both schemas.
const filterShape = {
  type: csvEnum(ASSET_TYPES).optional(),
  status: csvEnum(ASSET_STATUSES).optional(),
  uninspected: trueFlag.optional(),
  bbox: bbox.optional(),
  // Radius search: all three params go together.
  lat: num.pipe(z.number().min(-90).max(90)).optional(),
  lng: num.pipe(z.number().min(-180).max(180)).optional(),
  radius: num.pipe(z.number().positive().max(500_000)).optional(), // meters
};

// lat/lng/radius are three params for one idea, so they are checked as a group...
const nearIsComplete = (q: { lat?: number; lng?: number; radius?: number }) => {
  const given = [q.lat, q.lng, q.radius].filter((v) => v !== undefined).length;
  return given === 0 || given === 3;
};
const nearError = { message: "lat, lng and radius must be used together", path: ["radius"] };

// ...and then folded into one value, so the repository deals with a single optional `near`.
const foldNear = <T extends { lat?: number; lng?: number; radius?: number }>({ lat, lng, radius, ...rest }: T) => ({
  ...rest,
  near: lat !== undefined && lng !== undefined && radius !== undefined ? { lat, lng, radius } : undefined,
});

// strictObject: an unknown param (e.g. a typo like "types") is a 400, not silently ignored.
export const ListQuerySchema = z
  .strictObject({
    ...filterShape,
    limit: num.pipe(z.number().int().min(1).max(500)).optional().default(50),
    offset: num.pipe(z.number().int().min(0)).optional().default(0),
  })
  .refine(nearIsComplete, nearError)
  .transform(foldNear);

// The summary takes the same filters, without the paging params: it counts the whole
// matching set rather than returning a page of it. Being strict means sending `limit`
// or `offset` here is a 400, not a silent no-op. Which counts honour which filter is
// decided in the repository, not here.
export const SummaryQuerySchema = z.strictObject(filterShape).refine(nearIsComplete, nearError).transform(foldNear);

export type ListQuery = z.infer<typeof ListQuerySchema>;
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;

// What the WHERE builder needs: the filters, without the paging params.
// A SummaryQuery fits this too, which is why both endpoints can share one builder.
export type AssetFilters = Omit<ListQuery, "limit" | "offset">;
