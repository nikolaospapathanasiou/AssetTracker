import { ASSET_STATUSES, ASSET_TYPES, type AssetSummary } from "@asset-tracker/shared";
import type { Filters } from "../hooks/useFilters";
import { STATUS_LABEL, TYPE_LABEL } from "../status";
import { StatusDot } from "./StatusBadge";

interface Props {
  filters: Filters;
  // Counts from /api/assets/summary, undefined until the first load. Each count leaves out
  // the filter its own chip controls and honours all the others, so a chip always reads
  // "how many you would get if you turned this on". That is why picking "Critical" keeps
  // the other two status counts alive, while the inspection count drops to the never
  // inspected assets among the critical ones.
  summary: AssetSummary | undefined;
  onChange: (change: Partial<Filters>) => void;
}

// Kept out of the chip when the counts haven't arrived yet, rather than showing a zero.
function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  return <span className="chip-count">{value}</span>;
}

// Adds the value if missing, removes it if present.
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// An empty selection means "all", which is also what the API does when a param is left out.
export function FilterBar({ filters, summary, onChange }: Props) {
  return (
    <div className="filters">
      <fieldset>
        <legend>Type</legend>
        {ASSET_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="chip"
            aria-pressed={filters.types.includes(type)}
            onClick={() => onChange({ types: toggle(filters.types, type) })}
          >
            {TYPE_LABEL[type]}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>Status</legend>
        {ASSET_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="chip"
            aria-pressed={filters.statuses.includes(status)}
            onClick={() => onChange({ statuses: toggle(filters.statuses, status) })}
          >
            <StatusDot status={status} />
            {STATUS_LABEL[status]}
            <Count value={summary?.[status]} />
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>Inspection</legend>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.uninspected}
          onClick={() => onChange({ uninspected: !filters.uninspected })}
        >
          Never inspected
          <Count value={summary?.uninspected} />
        </button>
      </fieldset>

      {filters.bbox && (
        <div className="area-filter">
          <span>Showing assets in the selected map area</span>
          <button type="button" className="link-button" onClick={() => onChange({ bbox: null })}>
            Clear area
          </button>
        </div>
      )}
    </div>
  );
}
