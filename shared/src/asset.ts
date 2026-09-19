import { z } from "zod";

// Single source of truth for the asset shape.
// The server uses these schemas to validate requests, the web app uses the
// same schemas to validate the form, so the rules can never drift apart.

export const ASSET_TYPES = ["pipe", "hydrant", "sensor", "valve"] as const;
export const ASSET_STATUSES = ["ok", "warning", "critical"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];

const isoDate = z.iso.date({ error: "Use a date in YYYY-MM-DD format" });

// The editable fields, without cross-field rules.
// Kept separate so we can derive a partial version for PATCH.
export const AssetFieldsSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(ASSET_TYPES),
  status: z.enum(ASSET_STATUSES),
  lat: z.number({ error: "Latitude must be a number" }).min(-90).max(90),
  lng: z.number({ error: "Longitude must be a number" }).min(-180).max(180),
  installed_at: isoDate,
  last_inspected_at: isoDate.nullable(),
  notes: z.string().max(2000),
});

// Cross-field rule shared by every "complete asset" schema.
// ISO dates compare correctly as strings, so no Date parsing is needed.
const inspectedAfterInstall = (a: { installed_at: string; last_inspected_at: string | null }) =>
  a.last_inspected_at === null || a.last_inspected_at >= a.installed_at;
const inspectedAfterInstallError = {
  message: "Last inspection can't be before the install date",
  path: ["last_inspected_at"],
};

// A complete asset as clients send it (POST, or the result of merging a PATCH).
export const AssetInputSchema = AssetFieldsSchema.refine(inspectedAfterInstall, inspectedAfterInstallError);

// A stored asset, including its id (used to validate the seed file).
export const AssetSchema = AssetFieldsSchema.extend({ id: z.uuid() }).refine(
  inspectedAfterInstall,
  inspectedAfterInstallError,
);

// PATCH body: any subset of the fields, but at least one.
export const AssetPatchSchema = AssetFieldsSchema.partial().refine(
  (p) => Object.keys(p).length > 0,
  { message: "Provide at least one field to update" },
);

export type AssetInput = z.infer<typeof AssetInputSchema>;
export type AssetPatch = z.infer<typeof AssetPatchSchema>;
export type Asset = z.infer<typeof AssetSchema>;

// ---- API response shapes ----

export interface Page {
  limit: number;
  offset: number;
  total: number;
}

export interface AssetListResponse {
  data: Asset[];
  page: Page;
}

export interface ApiErrorBody {
  error: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";
    message: string;
    details?: { path: string; message: string }[];
  };
}
