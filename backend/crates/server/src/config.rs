//! What the operator sets, read once at start-up.
//!
//! The same rule the TypeScript routes follow: configuration comes from the
//! server environment and nothing else. Nothing here is ever accepted from a
//! request.

use std::{env, net::SocketAddr};

/// The build's version, taken from `package.json` by `build.rs`.
pub const VERSION: &str = env!("FIELDMANAGER_VERSION");

const DEFAULT_BIND: &str = "127.0.0.1:8080";

pub struct Config {
    pub bind: SocketAddr,
}

#[derive(Debug)]
pub enum ConfigError {
    Bind { value: String, source: std::net::AddrParseError },
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Bind { value, source } => write!(
                f,
                "FIELDMANAGER_BIND is not an address: {value:?} ({source}). \
                 Expected something like {DEFAULT_BIND}."
            ),
        }
    }
}

impl std::error::Error for ConfigError {}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let raw = env_trimmed("FIELDMANAGER_BIND").unwrap_or_else(|| DEFAULT_BIND.to_string());
        let bind = raw
            .parse()
            .map_err(|source| ConfigError::Bind { value: raw, source })?;

        Ok(Self { bind })
    }
}

/// Loads `.env.local`, if there is one, without overwriting anything already
/// set in the real environment.
///
/// README tells the operator to put `OPENWEATHER_API_KEY` there, and Next
/// reads that file by itself; this service would otherwise report that weather
/// is not configured on a machine where it plainly is. A systemd unit's
/// `Environment=` and `EnvironmentFile=` still win, which is the order that
/// matters in production.
pub fn load_env_file() {
    match dotenvy::from_filename(".env.local") {
        Ok(path) => tracing::info!(file = %path.display(), "loaded environment file"),
        Err(error) if error.not_found() => {}
        Err(error) => tracing::warn!("could not read .env.local: {error}"),
    }
}

/// An environment variable that is set to something other than whitespace.
/// An empty value means "not set", which is how the TypeScript side reads
/// `OPENWEATHER_API_KEY` and the assistant's three variables too.
///
/// Read per request rather than captured at start-up, so an unconfigured or
/// malformed key is this endpoint's 503 and never a reason for the whole
/// service to refuse to come up.
pub fn env_trimmed(key: &str) -> Option<String> {
    match env::var(key) {
        Ok(value) => {
            let value = value.trim();
            (!value.is_empty()).then(|| value.to_string())
        }
        Err(_) => None,
    }
}
