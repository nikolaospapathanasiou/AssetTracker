import type { Asset } from "@asset-tracker/shared";

// Renders nothing for an asset that has been inspected, so seeing the badge always
// means "no inspection on record". Same condition the API filters on: last_inspected_at is null.
export function NeverInspectedBadge({ asset }: { asset: Pick<Asset, "last_inspected_at"> }) {
  if (asset.last_inspected_at !== null) return null;
  return <span className="never-inspected-badge">Never inspected</span>;
}
