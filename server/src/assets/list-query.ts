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

// strictObject: an unknown param (e.g. a typo like "types") is a 400, not silently ignored.
export const ListQuerySchema = z
  .strictObject({
    type: csvEnum(ASSET_TYPES).optional(),
    status: csvEnum(ASSET_STATUSES).optional(),
    bbox: bbox.optional(),
    // Radius search: all three params go together.
    lat: num.pipe(z.number().min(-90).max(90)).optional(),
    lng: num.pipe(z.number().min(-180).max(180)).optional(),
    radius: num.pipe(z.number().positive().max(500_000)).optional(), // meters
    limit: num.pipe(z.number().int().min(1).max(500)).optional().default(50),
    offset: num.pipe(z.number().int().min(0)).optional().default(0),
  })
  .refine(
    (q) => {
      const given = [q.lat, q.lng, q.radius].filter((v) => v !== undefined).length;
      return given === 0 || given === 3;
    },
    { message: "lat, lng and radius must be used together", path: ["radius"] },
  )
  .transform(({ lat, lng, radius, ...rest }) => ({
    ...rest,
    near: lat !== undefined && lng !== undefined && radius !== undefined ? { lat, lng, radius } : undefined,
  }));

export type ListQuery = z.infer<typeof ListQuerySchema>;
