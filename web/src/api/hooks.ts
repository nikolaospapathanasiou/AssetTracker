import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssetInput } from "@asset-tracker/shared";
import { api, type ListParams } from "./client";

// All server state lives in TanStack Query. Every key starts with "assets",
// so one invalidation after a write refreshes the list, the map and any open detail.
const keys = {
  all: ["assets"] as const,
  list: (params: ListParams) => ["assets", "list", params] as const,
  detail: (id: string) => ["assets", "detail", id] as const,
};

export function useAssetList(params: ListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.list(params),
    // Keep showing the old results while new filters load, instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

export function useAsset(id: string | null) {
  return useQuery({
    queryKey: keys.detail(id ?? ""),
    queryFn: () => api.get(id!),
    enabled: id !== null,
  });
}

function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({ mutationFn: (input: AssetInput) => api.create(input), onSuccess: invalidate });
}

export function useUpdateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetInput> }) => api.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    // Only refresh lists. Refetching the deleted asset's detail would just return 404.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets", "list"] }),
  });
}
