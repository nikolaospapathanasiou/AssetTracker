import type { Asset } from "@asset-tracker/shared";
import { TYPE_LABEL, formatDate } from "../status";
import { NeverInspectedBadge } from "./NeverInspectedBadge";
import { StatusDot } from "./StatusBadge";

interface Props {
  assets: Asset[];
  total: number;
  page: number;
  pageSize: number;
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}

export function AssetList({ assets, total, page, pageSize, selectedId, isLoading, onSelect, onPageChange }: Props) {
  if (isLoading) return <p className="list-message">Loading assets…</p>;
  if (total === 0) return <p className="list-message">No assets match these filters. Try removing a filter or clearing the area.</p>;

  const from = page * pageSize + 1;
  const to = Math.min(total, from + assets.length - 1);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <>
      <ul className="asset-list">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              className="asset-row"
              aria-current={asset.id === selectedId}
              onClick={() => onSelect(asset.id)}
            >
              <StatusDot status={asset.status} />
              <span className="asset-row-name">
                {asset.name}
                <NeverInspectedBadge asset={asset} />
              </span>
              <span className="asset-row-meta">
                {/* When there is no inspection date the badge above already says so. */}
                {TYPE_LABEL[asset.type]}
                {asset.last_inspected_at && `, inspected ${formatDate(asset.last_inspected_at)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="pager">
        <span>
          {from}–{to} of {total}
        </span>
        <button type="button" className="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <button type="button" className="button" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </>
  );
}
