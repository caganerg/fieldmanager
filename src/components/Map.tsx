"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polygon, FeatureGroup, useMapEvents } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import type { LatLng, LatLngTuple } from "leaflet";
import L from "leaflet";

// Fix default Leaflet icon paths in Next.js
const defaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = defaultIcon;

import { t } from "@/lib/translations";

export interface FieldPolygon {
  id: string;
  name: string;
  coordinates: LatLngTuple[];
  cropType?: string;
  plantDate?: Date;
  harvestDate?: Date;
  groupId?: string;
  color?: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Midnight of the current day, in epoch milliseconds
function startOfTodayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

// Determine polygon color based on harvest date proximity.
// `todayMs` is passed in so it is computed once per render instead of once per field.
function getFieldColor(field: FieldPolygon, todayMs: number): string {
  if (!field.harvestDate) return '#3b82f6'; // Default blue if no harvest date

  const harvest = new Date(field.harvestDate);
  harvest.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((harvest.getTime() - todayMs) / MS_PER_DAY);

  if (diffDays <= 0) return '#FF4500';    // Red — harvest day passed or today
  if (diffDays <= 15) return '#FFD700';   // Yellow — 1-15 days left  (user said 15–1)
  // diffDays > 15 (includes >30)
  return '#22c55e';                        // Green — still plenty of time
}

interface MapProps {
  fields: FieldPolygon[];
  isDrawingMode: boolean;
  onPolygonCreated: (coordinates: LatLngTuple[]) => void;
  selectedFieldId: string | null;
  onFieldClick: (id: string) => void;
  initialLocation?: LatLng | null;
}

export default function Map({
  fields = [],
  isDrawingMode = false,
  onPolygonCreated,
  selectedFieldId = null,
  onFieldClick,
  initialLocation = null
}: MapProps) {
  const [position] = useState<LatLng | null>(initialLocation);
  const todayMs = startOfTodayMs();

  // Default center: Ankara, Turkey
  const center: [number, number] = [39.925533, 32.866287];

  // Callback when a shape is drawn correctly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleCreated = (e: any) => {
    const layer = e.layer;
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      const coords: LatLngTuple[] = latlngs.map((ll) => [ll.lat, ll.lng]);

      // Remove the visually drawn layer from the FeatureGroup immediately
      // because we will render it natively as a <Polygon> from our state 'fields'.
      layer.remove();

      onPolygonCreated(coords);
    }
  };

  return (
    <MapContainer
      center={position ? [position.lat, position.lng] : center}
      zoom={13}
      scrollWheelZoom={true}
      className="w-full h-full min-h-[400px] z-0 rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Existing Fields */}
      {fields.map((field) => {
        const harvestColor = getFieldColor(field, todayMs);
        const isSelected = selectedFieldId === field.id;
        return (
          <Polygon
            key={field.id}
            positions={field.coordinates}
            pathOptions={{
              color: isSelected ? '#10b981' : harvestColor,
              weight: isSelected ? 4 : 2,
              fillColor: isSelected ? '#10b981' : harvestColor,
              fillOpacity: 0.4
            }}
            eventHandlers={{
              click: () => onFieldClick(field.id)
            }}
          />
        )
      })}

      {/* Drawing Mode Editing Group */}
      <FeatureGroup>
        <EditControl
          position="topright"
          onCreated={handleCreated}
          draw={{
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: false,
            polyline: false,
            polygon: isDrawingMode ? {
              allowIntersection: false,
              drawError: {
                color: '#e1e100', // Color the shape will turn when intersects
                message: `<strong>${t.mapIntersectError}</strong>` // Message that will show when intersect
              },
              shapeOptions: {
                color: '#10b981'
              }
            } : false
          }}
          edit={{
            edit: false, // For now, let's keep it simple: draw only.
            remove: false
          }}
        />
      </FeatureGroup>

      {/* Hook to programmatically enable drawing tool */}
      <DrawControlHandler isDrawingMode={isDrawingMode} />

      {position && <Marker position={position} />}
    </MapContainer>
  );
}

// Internal component to handle programmatic drawing enablement
function DrawControlHandler({ isDrawingMode }: { isDrawingMode: boolean }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (isDrawingMode && map) {
      // Find the polygon draw button and click it programmatically to activate Drawing mode immediately
      const drawPolygonBtn = document.querySelector('.leaflet-draw-draw-polygon') as HTMLElement;
      if (drawPolygonBtn) {
        drawPolygonBtn.click();
      }
    } else if (!isDrawingMode && map) {
      // Find and click the cancel button if present in the DOM
      const cancelBtns = document.querySelectorAll('.leaflet-draw-actions a');
      cancelBtns.forEach((btn) => {
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        const text = btn.textContent?.toLowerCase() || '';
        if (title.includes('cancel') || text.includes('cancel') || text.includes('iptal') || title.includes('iptal')) {
          (btn as HTMLElement).click();
        }
      });

      // Dispatch Escape key event to ensure Leaflet.Draw polygon handler cleans up any active drawing guides
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    }
  }, [isDrawingMode, map]);

  return null;
}
