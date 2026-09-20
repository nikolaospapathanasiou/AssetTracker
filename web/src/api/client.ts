import type {
  ApiErrorBody,
  Asset,
  AssetInput,
  AssetListResponse,
  AssetStatus,
  AssetSummary,
  AssetType,
} from "@asset-tracker/shared";

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

export interface ListParams {
  types: AssetType[];
  statuses: AssetStatus[];
  bbox: Bbox | null;
  uninspected: boolean;
  limit: number;
  offset: number;
}

// The summary takes the same filters as the list, minus paging, which is exactly what
// the endpoint accepts. Deriving it means the two can't drift apart.
export type SummaryParams = Omit<ListParams, "limit" | "offset">;

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

function filterQuery(p: SummaryParams) {
  const qs = new URLSearchParams();
  if (p.types.length) qs.set("type", p.types.join(","));
  if (p.statuses.length) qs.set("status", p.statuses.join(","));
  if (p.bbox) qs.set("bbox", p.bbox.join(","));
  // Only ever sent when switched on: the API rejects uninspected=false on purpose.
  if (p.uninspected) qs.set("uninspected", "true");
  return qs;
}

function toQueryString(p: ListParams) {
  const qs = filterQuery(p);
  qs.set("limit", String(p.limit));
  qs.set("offset", String(p.offset));
  return qs.toString();
}

export const api = {
  list: (params: ListParams) => request<AssetListResponse>(`/assets?${toQueryString(params)}`),
  summary: (params: SummaryParams) => request<AssetSummary>(`/assets/summary?${filterQuery(params)}`),
  get: (id: string) => request<Asset>(`/assets/${id}`),
  create: (input: AssetInput) => request<Asset>("/assets", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<AssetInput>) =>
    request<Asset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),
};
