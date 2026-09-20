import type { Asset } from "@asset-tracker/shared";
import { TYPE_LABEL, formatDate } from "../status";
import { NeverInspectedBadge } from "./NeverInspectedBadge";
import { StatusBadge } from "./StatusBadge";

interface Props {
  asset: Asset;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function AssetDetail({ asset, isDeleting, onEdit, onDelete }: Props) {
  return (
    <div className="asset-detail">
      <div className="detail-heading">
        <StatusBadge status={asset.status} />
        <span className="detail-type">{TYPE_LABEL[asset.type]}</span>
        <NeverInspectedBadge asset={asset} />
      </div>

      <dl className="detail-grid">
        <dt>Location</dt>
        <dd className="numeric">
          {asset.lat.toFixed(5)}, {asset.lng.toFixed(5)}
        </dd>
        <dt>Installed</dt>
        <dd>{formatDate(asset.installed_at)}</dd>
        <dt>Last inspected</dt>
        <dd>{formatDate(asset.last_inspected_at)}</dd>
        <dt>Notes</dt>
        <dd>{asset.notes || <span className="muted">No notes</span>}</dd>
      </dl>

      <div className="form-actions">
        <button type="button" className="button button-danger" onClick={onDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting…" : "Delete"}
        </button>
        <button type="button" className="button button-primary" onClick={onEdit}>
          Edit asset
        </button>
      </div>
    </div>
  );
}
