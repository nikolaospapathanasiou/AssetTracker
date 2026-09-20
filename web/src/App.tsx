import { useState } from "react";
import { ASSET_STATUSES, type AssetInput } from "@asset-tracker/shared";
import { useAsset, useAssetList, useAssetSummary, useCreateAsset, useDeleteAsset, useUpdateAsset } from "./api/hooks";
import { ApiError } from "./api/client";
import { useFilters } from "./hooks/useFilters";
import { AssetDetail } from "./components/AssetDetail";
import { AssetForm } from "./components/AssetForm";
import { AssetList } from "./components/AssetList";
import { AssetMap, type MapView } from "./components/AssetMap";
import { FilterBar } from "./components/FilterBar";
import { STATUS_COLOR, STATUS_LABEL } from "./status";

const PAGE_SIZE = 25;
// The map asks for more rows than the list. If an area ever holds more than this,
// the map says so and asks the user to zoom in, instead of silently dropping markers.
const MAP_LIMIT = 500;

// What the side panel is showing. One piece of state instead of several booleans,
// so impossible combinations (editing and creating at once) can't happen.
type Panel =
  | { mode: "view"; id: string }
  | { mode: "edit"; id: string }
  | { mode: "create"; view: MapView }
  | null;

export function App() {
  const [filters, setFilters] = useFilters();
  const [panel, setPanel] = useState<Panel>(null);
  const [mapView, setMapView] = useState<MapView>({ center: [39.5, -79], zoom: 5 });

  const shared = { types: filters.types, statuses: filters.statuses, bbox: filters.bbox, uninspected: filters.uninspected };
  const list = useAssetList({ ...shared, limit: PAGE_SIZE, offset: filters.page * PAGE_SIZE });
  const markers = useAssetList({ ...shared, limit: MAP_LIMIT, offset: 0 });
  const summary = useAssetSummary(shared);

  const selectedId = panel && panel.mode !== "create" ? panel.id : null;
  const selected = useAsset(selectedId);

  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();

  const select = (id: string) => setPanel({ mode: "view", id });

  const handleCreate = async (input: AssetInput) => {
    const asset = await createAsset.mutateAsync(input);
    setPanel({ mode: "view", id: asset.id });
  };

  const handleUpdate = async (id: string, input: AssetInput) => {
    await updateAsset.mutateAsync({ id, input });
    setPanel({ mode: "view", id });
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? This can't be undone.`)) return;
    deleteAsset.mutate(id, { onSuccess: () => setPanel(null) });
  };

  const hiddenOnMap = markers.data ? markers.data.page.total - markers.data.data.length : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Asset tracker</h1>
        <button type="button" className="button button-primary" onClick={() => setPanel({ mode: "create", view: mapView })}>
          New asset
        </button>
      </header>

      <aside className="sidebar">
        <FilterBar filters={filters} summary={summary.data} onChange={setFilters} />
        {list.isError ? (
          <p className="list-message form-error">Could not load assets: {list.error.message}</p>
        ) : (
          <AssetList
            assets={list.data?.data ?? []}
            total={list.data?.page.total ?? 0}
            page={filters.page}
            pageSize={PAGE_SIZE}
            selectedId={selectedId}
            isLoading={list.isPending}
            onSelect={select}
            onPageChange={(page) => setFilters({ page })}
          />
        )}
      </aside>

      <main className="map-area">
        <AssetMap
          assets={markers.data?.data ?? []}
          selectedId={selectedId}
          area={filters.bbox}
          onSelect={select}
          onSearchArea={(bbox) => setFilters({ bbox })}
          onViewChange={setMapView}
        />

        <div className="map-overlay map-overlay-legend">
          {ASSET_STATUSES.map((s) => (
            <span key={s}>
              <span className="status-dot" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>

        {hiddenOnMap > 0 && (
          <div className="map-overlay map-overlay-notice">
            {hiddenOnMap} more assets aren't shown on the map. Zoom in and search this area to see them.
          </div>
        )}

        {panel && (
          <section className="panel" aria-label="Asset details">
            <header className="panel-header">
              <h2>{panel.mode === "create" ? "New asset" : (selected.data?.name ?? "Asset")}</h2>
              <button type="button" className="icon-button" aria-label="Close" onClick={() => setPanel(null)}>
                ×
              </button>
            </header>

            {panel.mode === "create" && (
              <AssetForm
                initialView={panel.view}
                submitLabel="Create asset"
                onSubmit={handleCreate}
                onCancel={() => setPanel(null)}
              />
            )}

            {panel.mode !== "create" && selected.isPending && <p className="muted">Loading…</p>}
            {panel.mode !== "create" && selected.isError && (
              <p className="form-error">
                {selected.error instanceof ApiError && selected.error.status === 404
                  ? "This asset no longer exists."
                  : `Could not load the asset: ${selected.error.message}`}
              </p>
            )}

            {panel.mode === "view" && selected.data && (
              <>
                <AssetDetail
                  asset={selected.data}
                  isDeleting={deleteAsset.isPending}
                  onEdit={() => setPanel({ mode: "edit", id: panel.id })}
                  onDelete={() => handleDelete(panel.id, selected.data.name)}
                />
                {deleteAsset.isError && <p className="form-error">Could not delete: {deleteAsset.error.message}</p>}
              </>
            )}

            {panel.mode === "edit" && selected.data && (
              <AssetForm
                // A new key resets the form if a different asset is opened for editing.
                key={selected.data.id}
                asset={selected.data}
                initialView={mapView}
                submitLabel="Save changes"
                onSubmit={(input) => handleUpdate(panel.id, input)}
                onCancel={() => setPanel({ mode: "view", id: panel.id })}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
