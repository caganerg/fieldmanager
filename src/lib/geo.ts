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

// Area of a polygon in square metres, by the spherical excess formula on a
// sphere the size of the Earth. Accurate enough for a field: the error against
// a proper ellipsoidal calculation is well under a percent at parcel scale.
export function getPolygonArea(coordinates: LatLngTuple[]): number {
  if (!coordinates || coordinates.length < 3) return 0;

  const EARTH_RADIUS = 6371000; // metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let area = 0;
  const n = coordinates.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRad(coordinates[i][0]);
    const lng1 = toRad(coordinates[i][1]);
    const lat2 = toRad(coordinates[j][0]);
    const lng2 = toRad(coordinates[j][1]);
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
}
