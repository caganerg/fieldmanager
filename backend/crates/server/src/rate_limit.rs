//! The per-client limits the API routes share.
//!
//! A port of `src/lib/server/rate-limit.ts`, and deliberately a faithful one:
//! the same window, the same sweep, the same client-address rule, so the two
//! backends cannot drift apart while both are serving.
//!
//! None of this is access control — that is the session check each route makes
//! first. In-memory state is the right fit because the service is a single
//! long-running process, not a set of serverless instances that would each
//! keep their own count.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use axum::{
    Json,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;

/// The address a limit is counted against.
///
/// **Slice 0 measured what actually arrives here**, and it is worth knowing
/// before trusting the answer: Next's rewrite adds `x-forwarded-host` and
/// nothing else, so on an installation with no reverse proxy in front, every
/// caller shares the key `"unknown"` and the limits apply to the installation
/// as a whole. A caller that sends the header itself picks its own bucket.
///
/// Neither is new — the TypeScript routes read the same header from the same
/// request today — but this service's peer is always Next on loopback, so it
/// can never recover the real address on its own. An installation reached over
/// https or from off the machine wants a proxy in front that sets
/// `x-forwarded-for` and routes `/api/*` here directly. README says so.
pub fn client_key(headers: &HeaderMap) -> String {
    if let Some(forwarded) = header_str(headers, "x-forwarded-for")
        && let Some(first) = forwarded.split(',').next()
    {
        let first = first.trim();
        if !first.is_empty() {
            return first.to_string();
        }
    }

    header_str(headers, "x-real-ip")
        .map(str::to_owned)
        .unwrap_or_else(|| "unknown".to_string())
}

/// A header that is present and not empty. An empty value counts as absent,
/// which is how the JavaScript reads it: `if (forwardedFor)` is false for `""`.
fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
}

/// Above this many tracked addresses, a new window sweeps the expired ones out.
/// It keeps the map from growing for the life of the process when many distinct
/// clients — or spoofed ones — show up.
const SWEEP_THRESHOLD: usize = 5000;

struct Entry {
    count: u32,
    window_start: Instant,
}

pub struct RateLimiter {
    window: Duration,
    max: u32,
    counts: Mutex<HashMap<String, Entry>>,
}

impl RateLimiter {
    pub fn new(window: Duration, max: u32) -> Self {
        Self {
            window,
            max,
            counts: Mutex::new(HashMap::new()),
        }
    }

    /// True when this key has already used up the window. Counts the call.
    ///
    /// A poisoned lock is treated as "not limited" rather than as a failure:
    /// the limits are damage control, and refusing every request because a
    /// counter panicked would turn a bookkeeping bug into an outage.
    pub fn is_limited(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut counts = match self.counts.lock() {
            Ok(counts) => counts,
            Err(poisoned) => poisoned.into_inner(),
        };

        match counts.get_mut(key) {
            Some(entry) if now.duration_since(entry.window_start) <= self.window => {
                entry.count += 1;
                entry.count > self.max
            }
            _ => {
                counts.insert(
                    key.to_string(),
                    Entry {
                        count: 1,
                        window_start: now,
                    },
                );
                if counts.len() > SWEEP_THRESHOLD {
                    counts.retain(|_, entry| now.duration_since(entry.window_start) <= self.window);
                }
                false
            }
        }
    }

    /// Forgets a key, so a success can wipe the failures that came before it.
    /// Unused until sign-in moves across; kept so the two ports stay the same
    /// shape.
    #[allow(dead_code)]
    pub fn clear(&self, key: &str) {
        if let Ok(mut counts) = self.counts.lock() {
            counts.remove(key);
        }
    }
}

/// The 429 every limited route answers with; the wording is the caller's.
pub fn too_many_requests(message: &str, retry_after_seconds: u32) -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        [("retry-after", retry_after_seconds.to_string())],
        Json(json!({ "error": message })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.append(
                axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                value.parse().unwrap(),
            );
        }
        headers
    }

    #[test]
    fn takes_the_first_forwarded_address() {
        let headers = headers(&[("x-forwarded-for", "203.0.113.9, 10.0.0.1")]);
        assert_eq!(client_key(&headers), "203.0.113.9");
    }

    #[test]
    fn falls_back_to_real_ip_then_to_unknown() {
        assert_eq!(client_key(&headers(&[("x-real-ip", "198.51.100.7")])), "198.51.100.7");
        // An empty forwarded header counts as absent, as it does in JavaScript.
        let both = headers(&[("x-forwarded-for", ""), ("x-real-ip", "198.51.100.7")]);
        assert_eq!(client_key(&both), "198.51.100.7");
        assert_eq!(client_key(&headers(&[])), "unknown");
    }

    #[test]
    fn allows_max_calls_then_limits() {
        let limiter = RateLimiter::new(Duration::from_secs(60), 3);
        // The first call opens the window at count 1, so `max` calls pass.
        assert!(!limiter.is_limited("a"));
        assert!(!limiter.is_limited("a"));
        assert!(!limiter.is_limited("a"));
        assert!(limiter.is_limited("a"));
        // A different caller has its own window.
        assert!(!limiter.is_limited("b"));
    }

    #[test]
    fn a_new_window_forgets_the_old_count() {
        let limiter = RateLimiter::new(Duration::ZERO, 1);
        assert!(!limiter.is_limited("a"));
        // With a zero-length window every call starts a fresh one.
        assert!(!limiter.is_limited("a"));
    }

    #[test]
    fn clear_forgets_a_key() {
        let limiter = RateLimiter::new(Duration::from_secs(60), 1);
        assert!(!limiter.is_limited("a"));
        assert!(limiter.is_limited("a"));
        limiter.clear("a");
        assert!(!limiter.is_limited("a"));
    }
}
