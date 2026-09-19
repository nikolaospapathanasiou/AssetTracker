import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import type { Asset, AssetStatus } from "@asset-tracker/shared";
import type { Bbox } from "../api/client";
import { STATUS_COLOR } from "../status";

export interface MapView {
  center: [number, number];
  zoom: number;
}

interface Props {
  assets: Asset[];
  selectedId: string | null;
  area: Bbox | null;
  onSelect: (id: string) => void;
  onSearchArea: (bbox: Bbox) => void;
  onViewChange: (view: MapView) => void;
}

// Circle markers are drawn by Leaflet itself, so there are no marker image files to bundle,
// and they are easy to color by status.
// Leaflet draws later markers on top. Where markers overlap, the ones that need
// attention (critical, then warning, then the selected one) should win.
const DRAW_ORDER: Record<AssetStatus, number> = { ok: 0, warning: 1, critical: 2 };
const drawOrder = (a: Asset, selectedId: string | null) => (a.id === selectedId ? 3 : DRAW_ORDER[a.status]);

export function AssetMap({ assets, selectedId, area, onSelect, onSearchArea, onViewChange }: Props) {
  const ordered = useMemo(
    () => [...assets].sort((a, b) => drawOrder(a, selectedId) - drawOrder(b, selectedId)),
    [assets, selectedId],
  );
  return (
    <MapContainer className="map" center={[39.5, -79]} zoom={5} preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {area && (
        <Rectangle
          bounds={[
            [area[1], area[0]],
            [area[3], area[2]],
          ]}
          pathOptions={{ color: "#0F5E7A", weight: 1.5, dashArray: "6 4", fill: false }}
          interactive={false}
        />
      )}

      {ordered.map((asset) => {
        const selected = asset.id === selectedId;
        return (
          <CircleMarker
            key={asset.id}
            center={[asset.lat, asset.lng]}
            radius={selected ? 10 : 7}
            pathOptions={{
              color: selected ? "#16242C" : "#FFFFFF",
              weight: selected ? 3 : 1.5,
              fillColor: STATUS_COLOR[asset.status],
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect(asset.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {asset.name}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <FitToAssetsOnce assets={assets} />
      <PanToSelected assets={assets} selectedId={selectedId} />
      <ReportView onViewChange={onViewChange} />
      <SearchAreaButton onSearchArea={onSearchArea} />
    </MapContainer>
  );
}

// Zoom to the data the first time it arrives, then leave the view to the user.
function FitToAssetsOnce({ assets }: { assets: Asset[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || assets.length === 0) return;
    const bounds: LatLngBoundsExpression = assets.map((a) => [a.lat, a.lng]);
    map.fitBounds(bounds, { padding: [40, 40] });
    done.current = true;
  }, [assets, map]);
  return null;
}

// When an asset is picked from the list and it's off screen, bring it into view.
function PanToSelected({ assets, selectedId }: { assets: Asset[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const asset = assets.find((a) => a.id === selectedId);
    if (!asset) return;
    const point: [number, number] = [asset.lat, asset.lng];
    if (!map.getBounds().contains(point)) map.flyTo(point, Math.max(map.getZoom(), 13));
    // Deliberately only reacts to a new selection, not to every refetch of the assets.
  }, [selectedId, map]);
  return null;
}

function ReportView({ onViewChange }: { onViewChange: (view: MapView) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
  });
  return null;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

function SearchAreaButton({ onSearchArea }: { onSearchArea: (bbox: Bbox) => void }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  // Stop clicks on the button from also reaching the map underneath.
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);
  const search = () => {
    const b = map.getBounds();
    // Leaflet can report longitudes past ±180 when the world wraps; the API expects real coordinates.
    const clampLng = (lng: number) => Math.min(180, Math.max(-180, lng));
    onSearchArea([round(clampLng(b.getWest())), round(b.getSouth()), round(clampLng(b.getEast())), round(b.getNorth())]);
  };
  return (
    <div ref={ref} className="map-overlay map-overlay-top">
      <button type="button" className="button button-primary" onClick={search}>
        Search this area
      </button>
    </div>
  );
}
