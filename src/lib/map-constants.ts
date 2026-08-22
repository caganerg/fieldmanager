import type { LatLngTuple } from "leaflet";

// Default map center: Ankara, Turkey.
//
// This lives outside Map.tsx on purpose. Map.tsx pulls in Leaflet, which needs
// `window`, so it is only ever loaded through a dynamic import with ssr:false.
// Importing a value from it on the server breaks the build; importing this
// module does not, since the Leaflet reference here is type-only and erased.
export const DEFAULT_CENTER: LatLngTuple = [39.925533, 32.866287];
