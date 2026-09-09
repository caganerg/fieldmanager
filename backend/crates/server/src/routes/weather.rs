//! The OpenWeather proxy.
//!
//! A port of `src/app/api/weather/route.ts`, and the first slice of the Rust
//! migration a user can see. The contract is unchanged — same query string,
//! same status codes, same JSON — because `WeatherDashboard` reads arbitrary
//! nested fields out of what the upstream sent, so the upstream payload is
//! passed through as-is rather than reshaped into types of our own.
//!
//! The key is only ever read from the server environment. It is never accepted
//! from the request, so it cannot leak into browser storage, URLs or logs —
//! the rule the assistant route follows too, and for the same reason.

use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    config::env_trimmed,
    rate_limit::{RateLimiter, client_key, too_many_requests},
};

/// This route is unauthenticated and open to anyone who can reach the server,
/// so a per-client cap keeps a single caller from burning through the shared
/// OpenWeather quota.
const WINDOW: Duration = Duration::from_secs(60);
const MAX_PER_WINDOW: u32 = 20;

/// Ten minutes, the same figure the TypeScript route handed to Next's fetch
/// cache with `next: { revalidate: 600 }`. Nothing in Rust provides that, so
/// without this the quota drains at the rate the panel is opened.
const CACHE_TTL: Duration = Duration::from_secs(600);

/// Enough for a farm's worth of parcels several times over. Past it, expired
/// entries are swept on the next insert, the way the rate limiter does.
const CACHE_CAPACITY: usize = 512;

/// A wedged upstream should not hold a connection open indefinitely. The
/// TypeScript route inherited whatever Next's fetch did; this is explicit.
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(15);

pub struct WeatherState {
    limiter: RateLimiter,
    cache: Mutex<Vec<(String, Instant, Arc<Value>)>>,
    http: reqwest::Client,
}

impl WeatherState {
    fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            limiter: RateLimiter::new(WINDOW, MAX_PER_WINDOW),
            cache: Mutex::new(Vec::new()),
            http: reqwest::Client::builder()
                .timeout(UPSTREAM_TIMEOUT)
                .user_agent("FieldManager/1.0")
                .build()?,
        })
    }

    fn cached(&self, key: &str) -> Option<Arc<Value>> {
        let cache = self.cache.lock().ok()?;
        cache.iter().find_map(|(entry, stored, body)| {
            (entry == key && stored.elapsed() < CACHE_TTL).then(|| Arc::clone(body))
        })
    }

    fn store(&self, key: String, body: Arc<Value>) {
        let Ok(mut cache) = self.cache.lock() else {
            return;
        };
        cache.retain(|(entry, stored, _)| entry != &key && stored.elapsed() < CACHE_TTL);
        if cache.len() >= CACHE_CAPACITY {
            cache.remove(0);
        }
        cache.push((key, Instant::now(), body));
    }
}

pub fn router() -> Result<axum::Router, reqwest::Error> {
    Ok(axum::Router::new()
        .route("/api/weather", get(handler))
        .with_state(Arc::new(WeatherState::new()?)))
}

#[derive(Deserialize)]
pub struct Coordinates {
    lat: Option<String>,
    lon: Option<String>,
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

/// `configured: false` lets the client show a setup hint rather than an error.
fn unconfigured(message: &str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({ "configured": false, "error": message })),
    )
        .into_response()
}

async fn handler(
    State(state): State<Arc<WeatherState>>,
    headers: HeaderMap,
    Query(coordinates): Query<Coordinates>,
) -> Response {
    if state.limiter.is_limited(&client_key(&headers)) {
        return too_many_requests(
            "Too many weather requests. Please slow down and try again shortly.",
            60,
        );
    }

    let (Some(raw_lat), Some(raw_lon)) = (coordinates.lat, coordinates.lon) else {
        return error(
            StatusCode::BAD_REQUEST,
            "Latitude and longitude are required.",
        );
    };
    if raw_lat.is_empty() || raw_lon.is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "Latitude and longitude are required.",
        );
    }

    // Stricter than `parseFloat`, which would read "41.5abc" as 41.5. Nothing
    // sends that but the map, which sends a plain number; refusing the rest is
    // narrower than what came before, never wider.
    let (Ok(lat), Ok(lon)) = (raw_lat.parse::<f64>(), raw_lon.parse::<f64>()) else {
        return error(StatusCode::BAD_REQUEST, "Invalid coordinate values provided.");
    };
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return error(StatusCode::BAD_REQUEST, "Invalid coordinate values provided.");
    }

    let Some(api_key) = env_trimmed("OPENWEATHER_API_KEY") else {
        return unconfigured(
            "Weather is not configured on this server. Set OPENWEATHER_API_KEY in .env.local.",
        );
    };
    // Guard against a malformed value in the environment reaching the upstream.
    if !is_plausible_key(&api_key) {
        return unconfigured("The configured OPENWEATHER_API_KEY is malformed.");
    }

    // The coordinates as they will appear in the upstream URL, which is what
    // Next's fetch cache was keyed on. Not rounded: two parcels a few metres
    // apart are still two parcels, and sharing a reading between them would be
    // a change in behaviour rather than a saving.
    let cache_key = format!("{lat}|{lon}");
    if let Some(body) = state.cached(&cache_key) {
        return cached_response(&body);
    }

    let current = fetch_upstream(&state.http, "weather", lat, lon, &api_key);
    let forecast = fetch_upstream(&state.http, "forecast", lat, lon, &api_key);
    let (current, forecast) = tokio::join!(current, forecast);

    let (current, forecast) = match (current, forecast) {
        (Ok(current), Ok(forecast)) => (current, forecast),
        (Err(failure), _) | (_, Err(failure)) => return failure.into_response(),
    };

    let body = Arc::new(json!({
        "current": current,
        "forecast": daily_forecasts(&forecast),
    }));
    state.store(cache_key, Arc::clone(&body));
    cached_response(&body)
}

fn cached_response(body: &Arc<Value>) -> Response {
    (
        // Mirror the ten-minute upstream cache so repeat views are served
        // without another round trip to this route.
        [(
            "cache-control",
            "public, max-age=0, s-maxage=600, stale-while-revalidate=600",
        )],
        Json(Value::clone(body)),
    )
        .into_response()
}

/// OpenWeather keys are 32 hex characters today, but the shape has changed
/// before, so this only refuses what obviously cannot be one.
fn is_plausible_key(key: &str) -> bool {
    (16..=64).contains(&key.len())
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// The failure the caller sees, with the detail kept out of it. A vendor's
/// response body can quote the request, and the request carries the key.
enum Upstream {
    /// The vendor answered, and said no.
    Rejected(&'static str),
    /// We never got an answer, or could not read the one we got.
    Unreachable,
}

impl IntoResponse for Upstream {
    fn into_response(self) -> Response {
        match self {
            Self::Rejected(message) => error(StatusCode::BAD_GATEWAY, message),
            Self::Unreachable => error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error occurred.",
            ),
        }
    }
}

async fn fetch_upstream(
    http: &reqwest::Client,
    endpoint: &str,
    lat: f64,
    lon: f64,
    api_key: &str,
) -> Result<Value, Upstream> {
    let url = format!("https://api.openweathermap.org/data/2.5/{endpoint}");
    let response = http
        .get(&url)
        .query(&[
            ("lat", lat.to_string().as_str()),
            ("lon", lon.to_string().as_str()),
            ("appid", api_key),
            ("units", "metric"),
            ("lang", "en"),
        ])
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|failure| {
            tracing::error!("Weather API request failure: {failure}");
            Upstream::Unreachable
        })?;

    let status = response.status();
    if !status.is_success() {
        tracing::error!("Weather API {endpoint} returned {status}");
        // An operator whose key is wrong needs a different message from a farm
        // that has simply asked too much this minute.
        return Err(Upstream::Rejected(if status == StatusCode::UNAUTHORIZED {
            "Invalid API Key."
        } else {
            "Could not fetch weather data from upstream provider."
        }));
    }

    response.json::<Value>().await.map_err(|failure| {
        tracing::error!("Weather API {endpoint} sent something that is not JSON: {failure}");
        Upstream::Unreachable
    })
}

/// `list` holds three-hour intervals for five days. Pick one representative
/// entry per day — midday when available, otherwise the first entry of that
/// day — in a single pass.
///
/// Order is data here: the panel renders `forecast.slice(0, 5)` as it comes, so
/// the days have to stay in the order the upstream listed them. That is what a
/// JavaScript `Map` gave for free and what a `HashMap` would quietly take away,
/// so the days are kept in a vector.
fn daily_forecasts(forecast: &Value) -> Vec<Value> {
    let Some(list) = forecast.get("list").and_then(Value::as_array) else {
        return Vec::new();
    };

    let mut days: Vec<(&str, &Value)> = Vec::new();
    for item in list {
        let Some(stamp) = item.get("dt_txt").and_then(Value::as_str) else {
            continue;
        };
        if stamp.is_empty() {
            continue;
        }
        let (date, time) = stamp.split_once(' ').unwrap_or((stamp, ""));

        match days.iter_mut().find(|(seen, _)| *seen == date) {
            // Keep the first entry seen for a day, then upgrade to the midday
            // reading when it comes along (a day has at most one 12:00:00).
            Some(slot) if time == "12:00:00" => slot.1 = item,
            Some(_) => {}
            None => days.push((date, item)),
        }
    }

    days.into_iter().map(|(_, item)| item.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_one_entry_per_day_preferring_midday() {
        let forecast = json!({
            "list": [
                { "dt_txt": "2026-09-09 09:00:00", "main": { "temp": 1 } },
                { "dt_txt": "2026-09-09 12:00:00", "main": { "temp": 2 } },
                { "dt_txt": "2026-09-09 15:00:00", "main": { "temp": 3 } },
                { "dt_txt": "2026-09-10 03:00:00", "main": { "temp": 4 } },
            ]
        });
        let days = daily_forecasts(&forecast);
        assert_eq!(days.len(), 2);
        assert_eq!(days[0]["main"]["temp"], 2, "midday wins for the first day");
        assert_eq!(days[1]["main"]["temp"], 4, "otherwise the first entry seen");
    }

    #[test]
    fn keeps_the_days_in_the_order_they_arrived() {
        let forecast = json!({
            "list": [
                { "dt_txt": "2026-09-09 09:00:00" },
                { "dt_txt": "2026-09-10 09:00:00" },
                { "dt_txt": "2026-09-11 09:00:00" },
                { "dt_txt": "2026-09-09 21:00:00" },
            ]
        });
        let days = daily_forecasts(&forecast);
        let dates: Vec<&str> = days
            .iter()
            .map(|day| day["dt_txt"].as_str().unwrap())
            .collect();
        assert_eq!(
            dates,
            ["2026-09-09 09:00:00", "2026-09-10 09:00:00", "2026-09-11 09:00:00"]
        );
    }

    #[test]
    fn survives_a_payload_without_a_list() {
        assert!(daily_forecasts(&json!({})).is_empty());
        assert!(daily_forecasts(&json!({ "list": "nope" })).is_empty());
        assert!(daily_forecasts(&json!({ "list": [{ "no": "stamp" }] })).is_empty());
    }

    #[test]
    fn a_stored_reading_comes_back_for_the_same_coordinates() {
        let state = WeatherState::new().expect("client");
        let body = Arc::new(json!({ "current": { "main": { "temp": 21 } } }));
        state.store("41|29".to_string(), Arc::clone(&body));

        // The second request for the same parcel is answered from here, which
        // is the whole point: the upstream quota is spent once per ten minutes
        // per parcel, not once per time the panel is opened.
        assert_eq!(state.cached("41|29"), Some(body));
        // A different parcel is a different reading, not a rounded neighbour.
        assert!(state.cached("41.0001|29").is_none());
    }

    #[test]
    fn storing_the_same_key_twice_replaces_rather_than_grows() {
        let state = WeatherState::new().expect("client");
        state.store("41|29".to_string(), Arc::new(json!({ "n": 1 })));
        state.store("41|29".to_string(), Arc::new(json!({ "n": 2 })));

        assert_eq!(state.cache.lock().unwrap().len(), 1);
        assert_eq!(state.cached("41|29").unwrap()["n"], 2);
    }

    #[test]
    fn the_cache_stays_within_its_capacity() {
        let state = WeatherState::new().expect("client");
        for parcel in 0..(CACHE_CAPACITY + 20) {
            state.store(format!("{parcel}|0"), Arc::new(json!({})));
        }
        assert!(state.cache.lock().unwrap().len() <= CACHE_CAPACITY);
    }

    #[test]
    fn rejects_a_key_that_cannot_be_one() {
        assert!(is_plausible_key("0123456789abcdef"));
        assert!(is_plausible_key(&"a".repeat(64)));
        assert!(!is_plausible_key("too-short"));
        assert!(!is_plausible_key(&"a".repeat(65)));
        assert!(!is_plausible_key("your_openweather_api_key_here!"));
    }
}
