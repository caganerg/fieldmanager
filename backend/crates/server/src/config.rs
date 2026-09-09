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
    /// The temporary `/api/_echo` endpoint used to measure what the Next.js
    /// rewrite passes through. Off unless asked for, and removed once slice 0
    /// has its answers.
    pub echo_enabled: bool,
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
        let raw = trimmed("FIELDMANAGER_BIND").unwrap_or_else(|| DEFAULT_BIND.to_string());
        let bind = raw
            .parse()
            .map_err(|source| ConfigError::Bind { value: raw, source })?;

        Ok(Self {
            bind,
            echo_enabled: trimmed("FIELDMANAGER_ECHO").as_deref() == Some("1"),
        })
    }
}

/// An environment variable that is set to something other than whitespace.
/// An empty value means "not set", which is how the TypeScript side reads
/// `OPENWEATHER_API_KEY` and the assistant's three variables too.
fn trimmed(key: &str) -> Option<String> {
    match env::var(key) {
        Ok(value) => {
            let value = value.trim();
            (!value.is_empty()).then(|| value.to_string())
        }
        Err(_) => None,
    }
}
