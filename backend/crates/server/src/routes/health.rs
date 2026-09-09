//! Is this service up, and which build is it?
//!
//! Deliberately says nothing else. Everything the Rust service serves is
//! published through the `/api/:path*` rewrite, so this answer is public: it
//! carries a status and the version the about dialog already shows, and no
//! configuration, no paths and no counts.

use axum::{Json, response::IntoResponse};
use serde_json::json;

use crate::config::VERSION;

pub async fn handler() -> impl IntoResponse {
    (
        [("cache-control", "no-store")],
        Json(json!({ "status": "ok", "version": VERSION })),
    )
}
