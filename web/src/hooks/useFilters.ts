import { useCallback, useEffect, useState } from "react";
import { ASSET_STATUSES, ASSET_TYPES, type AssetStatus, type AssetType } from "@asset-tracker/shared";
import type { Bbox } from "../api/client";

export interface Filters {
  types: AssetType[];
  statuses: AssetStatus[];
  bbox: Bbox | null;
  page: number;
}

// Filters live in the URL, so a filtered view survives a refresh and can be shared as a link.

function readFilters(): Filters {
  const qs = new URLSearchParams(window.location.search);
  const list = <T extends string>(key: string, allowed: readonly T[]) =>
    (qs.get(key)?.split(",") ?? []).filter((v): v is T => allowed.includes(v as T));

  const bboxParts = qs.get("bbox")?.split(",").map(Number);
  const bbox = bboxParts?.length === 4 && bboxParts.every(Number.isFinite) ? (bboxParts as Bbox) : null;
  const page = Math.max(0, Number(qs.get("page")) || 0);

  return { types: list("type", ASSET_TYPES), statuses: list("status", ASSET_STATUSES), bbox, page };
}

function writeFilters(f: Filters) {
  const qs = new URLSearchParams();
  if (f.types.length) qs.set("type", f.types.join(","));
  if (f.statuses.length) qs.set("status", f.statuses.join(","));
  if (f.bbox) qs.set("bbox", f.bbox.join(","));
  if (f.page > 0) qs.set("page", String(f.page));
  const search = qs.toString();
  window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(readFilters);

  useEffect(() => writeFilters(filters), [filters]);

  // Any filter change goes back to the first page, unless the page itself is what changed.
  const update = useCallback((change: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, page: 0, ...change }));
  }, []);

  return [filters, update] as const;
}
