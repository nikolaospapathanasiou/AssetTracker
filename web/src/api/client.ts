import type { ApiErrorBody, Asset, AssetInput, AssetListResponse, AssetStatus, AssetType } from "@asset-tracker/shared";

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

export interface ListParams {
  types: AssetType[];
  statuses: AssetStatus[];
  bbox: Bbox | null;
  uninspected: boolean;
  limit: number;
  offset: number;
}

// Carries the API's structured error so the form can map field errors back onto inputs.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(body?.error.message ?? `Request failed with status ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

function toQueryString(p: ListParams) {
  const qs = new URLSearchParams({ limit: String(p.limit), offset: String(p.offset) });
  if (p.types.length) qs.set("type", p.types.join(","));
  if (p.statuses.length) qs.set("status", p.statuses.join(","));
  if (p.bbox) qs.set("bbox", p.bbox.join(","));
  // Only ever sent when switched on: the API rejects uninspected=false on purpose.
  if (p.uninspected) qs.set("uninspected", "true");
  return qs.toString();
}

export const api = {
  list: (params: ListParams) => request<AssetListResponse>(`/assets?${toQueryString(params)}`),
  get: (id: string) => request<Asset>(`/assets/${id}`),
  create: (input: AssetInput) => request<Asset>("/assets", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<AssetInput>) =>
    request<Asset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),
};
