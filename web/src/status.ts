import type { AssetStatus, AssetType } from "@asset-tracker/shared";

// Status colors are used by both CSS badges and map markers, so they live in one place.
export const STATUS_COLOR: Record<AssetStatus, string> = {
  ok: "#2F855A",
  warning: "#C98A0B",
  critical: "#C53030",
};

export const STATUS_LABEL: Record<AssetStatus, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
};

export const TYPE_LABEL: Record<AssetType, string> = {
  pipe: "Pipe",
  hydrant: "Hydrant",
  sensor: "Sensor",
  valve: "Valve",
};

export function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
