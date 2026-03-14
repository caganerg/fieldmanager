"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polygon, FeatureGroup, useMapEvents } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import type { LatLng, LatLngTuple } from "leaflet";
import L from "leaflet";

// Fix default Leaflet icon paths in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = defaultIcon;

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

// Determine polygon color based on harvest date proximity
function getFieldColor(field: FieldPolygon): string {
  if (!field.harvestDate) return '#3b82f6'; // Default blue if no harvest date

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const harvest = new Date(field.harvestDate);
  harvest.setHours(0, 0, 0, 0);

  const diffMs = harvest.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

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
      if (layer._map) {
        layer._map.removeLayer(layer);
      }
      
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
        const harvestColor = getFieldColor(field);
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
      )})}

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
                message: '<strong>Hata!<strong> Kesişen çizgiler çizilemez!' // Message that will show when intersect
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
  
  // Need to cast _toolbars as any to access private leaflet-draw API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDrawToolbar = (m: any) => {
    // Leaflet Draw attaches a custom object to the map instances
    // Unfortunately, it's not well-typed in @types/leaflet-draw
    for (const key in m) {
      if (m[key] && m[key]._toolbars && m[key]._toolbars.draw) {
         return m[key]._toolbars.draw;
      }
    }
    return null;
  };

  // Another approach using querySelector since leaflet-draw mounts toolbars globally to the map container
  useEffect(() => {
    if (isDrawingMode && map) {
      // Find the polygon draw button and click it programmatically to activate Drawing mode immediately
      const drawPolygonBtn = document.querySelector('.leaflet-draw-draw-polygon') as HTMLElement;
      if (drawPolygonBtn) {
        drawPolygonBtn.click();
      }
    } else {
       // Find the cancel button if we cancel drawing mode externally (not implemented in UI yet but good for robustness)
       const cancelBtn = document.querySelector('.leaflet-draw-actions a[title="Cancel drawing"]') as HTMLElement;
       if (cancelBtn) {
           cancelBtn.click();
       }
    }
  }, [isDrawingMode, map]);

  return null;
}
