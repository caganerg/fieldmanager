//! Temporary. Measures what survives the trip through the Next.js rewrite.
//!
//! Slice 0 of the migration plan rests on two questions that documentation
//! cannot answer, only the real deployment can:
//!
//!   1. Which client address reaches this service? `clientKey()` in
//!      `rate-limit.ts` counts against `x-forwarded-for` / `x-real-ip`, and
//!      `isSecureRequest()` in `session.ts` decides the cookie's `Secure` flag
//!      from `x-forwarded-proto`. If the proxy substitutes its own address,
//!      the rate limiter counts every user as one and stops meaning anything.
//!
//!   2. Does the proxy carry the methods, the bodies and the cookies the real
//!      routes need? `/api/data` takes an 8 MB `PUT`, `/api/accounts/{id}` a
//!      `PATCH` and a `DELETE`, and login answers with a `Set-Cookie`. Whether
//!      `content-length` survives matters too: the cheap pre-read 413 in
//!      `readJsonBody` is built on it.
//!
//! So this reflects every header it was given, reports what the body actually
//! weighed against what the header claimed, and sets a cookie on the way out.
//!
//! It is off unless `FIELDMANAGER_ECHO=1`, and **this file is deleted once
//! slice 0 has recorded its answers**.

use axum::{
    Json,
    body::Bytes,
    extract::DefaultBodyLimit,
    http::{HeaderMap, Method, Uri},
    response::IntoResponse,
    routing::any,
};
use serde_json::json;

/// Nine megabytes: enough to prove that the 8 MB body `/api/data` accepts
/// arrives intact, and a reminder that axum's own default is 2 MB — well under
/// what the real route needs.
const ECHO_BODY_LIMIT: usize = 9 * 1024 * 1024;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route("/api/_echo", any(handler))
        .layer(DefaultBodyLimit::max(ECHO_BODY_LIMIT))
}

async fn handler(method: Method, uri: Uri, headers: HeaderMap, body: Bytes) -> impl IntoResponse {
    // `serde_json::Map` is a `BTreeMap` here, so the reflected headers come
    // back in a stable order and two runs can be diffed against each other.
    //
    // A repeated header is joined rather than overwritten. That is not a
    // detail here: a proxy chain is entitled to send `x-forwarded-for` twice
    // instead of as one comma-separated value, and keeping only the last one
    // would hide exactly the thing this endpoint exists to measure.
    let mut seen = serde_json::Map::<String, serde_json::Value>::new();
    for (name, value) in &headers {
        let shown = value
            .to_str()
            .map(str::to_owned)
            .unwrap_or_else(|_| format!("<{} non-utf8 bytes>", value.as_bytes().len()));
        match seen.get(name.as_str()).and_then(serde_json::Value::as_str) {
            Some(existing) => {
                let joined = format!("{existing}, {shown}");
                seen.insert(name.as_str().to_owned(), joined.into());
            }
            None => {
                seen.insert(name.as_str().to_owned(), shown.into());
            }
        }
    }

    let claimed = headers
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    // Logged from the joined map rather than from `headers.get()`, which would
    // return only the first of a repeated header and quietly disagree with the
    // JSON below.
    tracing::info!(
        method = %method,
        body_bytes = body.len(),
        content_length = claimed.as_deref().unwrap_or("<absent>"),
        forwarded_for = reflected(&seen, "x-forwarded-for"),
        forwarded_proto = reflected(&seen, "x-forwarded-proto"),
        real_ip = reflected(&seen, "x-real-ip"),
        "echo"
    );

    (
        [
            ("cache-control", "no-store"),
            // Proves a Set-Cookie survives the rewrite, which is what the
            // login route will depend on. `Secure` is deliberately absent: the
            // documented setup is a LAN install over plain http.
            (
                "set-cookie",
                "fieldmanager_echo=slice0; Path=/; HttpOnly; SameSite=Lax; Max-Age=60",
            ),
        ],
        Json(json!({
            "method": method.as_str(),
            "uri": uri.to_string(),
            "headers": seen,
            "body": {
                // The claim and the fact, side by side.
                "contentLengthHeader": claimed,
                "actualBytes": body.len(),
            },
        })),
    )
}

fn reflected<'a>(seen: &'a serde_json::Map<String, serde_json::Value>, name: &str) -> &'a str {
    seen.get(name)
        .and_then(serde_json::Value::as_str)
        .unwrap_or("<absent>")
}
