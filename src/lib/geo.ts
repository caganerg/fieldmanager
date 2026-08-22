import type { LatLngTuple } from "leaflet";

// Simple bounding-box centre of a polygon. Lives here rather than in Map.tsx so
// that server-rendered code can use it: Map.tsx pulls in Leaflet, which needs
// `window`, and is only ever loaded through a dynamic import with ssr:false.
export function getPolygonCenter(coordinates: LatLngTuple[]): LatLngTuple | null {
  if (!coordinates || coordinates.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  coordinates.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}
