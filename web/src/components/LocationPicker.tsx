import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MapView } from "./AssetMap";

interface Props {
  lat: number | undefined;
  lng: number | undefined;
  initialView: MapView;
  onPick: (lat: number, lng: number) => void;
}

const isCoord = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

// A small map inside the form: click to place the asset.
// It's controlled by the form's lat/lng values, so typing coordinates and clicking stay in sync.
export function LocationPicker({ lat, lng, initialView, onPick }: Props) {
  const hasPoint = isCoord(lat) && isCoord(lng);
  return (
    <MapContainer
      className="picker-map"
      center={hasPoint ? [lat, lng] : initialView.center}
      zoom={hasPoint ? 15 : initialView.zoom}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {hasPoint && (
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: "#0F5E7A", fillOpacity: 1 }}
        />
      )}
      <ClickToPick onPick={onPick} />
      {hasPoint && <KeepInView lat={lat} lng={lng} />}
    </MapContainer>
  );
}

function ClickToPick({ onPick }: { onPick: Props["onPick"] }) {
  useMapEvents({
    click: (e) => onPick(round(e.latlng.lat), round(e.latlng.wrap().lng)),
  });
  return null;
}

// If coordinates are typed in and land off screen, move the map to them.
function KeepInView({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains([lat, lng])) map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}
