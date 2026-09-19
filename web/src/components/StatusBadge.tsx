import type { AssetStatus } from "@asset-tracker/shared";
import { STATUS_COLOR, STATUS_LABEL } from "../status";

export function StatusDot({ status }: { status: AssetStatus }) {
  return <span className="status-dot" style={{ background: STATUS_COLOR[status] }} aria-hidden />;
}

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className="status-badge" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
