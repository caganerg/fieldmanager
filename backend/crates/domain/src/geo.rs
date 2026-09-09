//! Polygon geometry — the Rust half of `src/lib/geo.ts`.
//!
//! The assistant's prompt states every field's size in decares, so the area
//! calculation has to be here as well as in the browser, and the two have to
//! agree: a field the map calls 12.4 da and the answer calls 11.9 da is a bug
//! the farmer sees before anybody else does.

/// Bounding-box centre of a polygon.
pub fn polygon_center(coordinates: &[[f64; 2]]) -> Option<[f64; 2]> {
    if coordinates.is_empty() {
        return None;
    }
    let mut min_lat = f64::INFINITY;
    let mut max_lat = f64::NEG_INFINITY;
    let mut min_lng = f64::INFINITY;
    let mut max_lng = f64::NEG_INFINITY;
    for [lat, lng] in coordinates {
        min_lat = min_lat.min(*lat);
        max_lat = max_lat.max(*lat);
        min_lng = min_lng.min(*lng);
        max_lng = max_lng.max(*lng);
    }
    Some([(min_lat + max_lat) / 2.0, (min_lng + max_lng) / 2.0])
}

/// Area in square metres, by the spherical excess formula on a sphere the size
/// of the Earth. Accurate enough for a field: the error against a proper
/// ellipsoidal calculation is well under a percent at parcel scale.
pub fn polygon_area(coordinates: &[[f64; 2]]) -> f64 {
    if coordinates.len() < 3 {
        return 0.0;
    }

    const EARTH_RADIUS: f64 = 6_371_000.0;
    let to_rad = |degrees: f64| degrees * std::f64::consts::PI / 180.0;

    let mut area = 0.0;
    let count = coordinates.len();
    for index in 0..count {
        let next = (index + 1) % count;
        let lat1 = to_rad(coordinates[index][0]);
        let lng1 = to_rad(coordinates[index][1]);
        let lat2 = to_rad(coordinates[next][0]);
        let lng2 = to_rad(coordinates[next][1]);
        area += (lng2 - lng1) * (2.0 + lat1.sin() + lat2.sin());
    }
    ((area * EARTH_RADIUS * EARTH_RADIUS) / 2.0).abs()
}
