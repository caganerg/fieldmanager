//! The Field Manager API service.
//!
//! Slices 0 and 1 of the Rust migration (see `RUST-BACKEND-PLAN.md`): the
//! skeleton, and the weather proxy on top of it. Nothing here reads or writes
//! the farm's own records yet — the assistant is the slice that starts doing
//! that, and it only reads.
//!
//! It listens on loopback by default. The port a browser reaches is Next's;
//! this service is behind the rewrite in `next.config.ts`, so publishing it
//! directly is not part of the design.

mod config;
mod rate_limit;
mod routes;

use std::process::ExitCode;

use axum::{Router, routing::get};
use tokio::{net::TcpListener, signal};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{EnvFilter, fmt};

use crate::config::{Config, VERSION};

fn main() -> ExitCode {
    init_tracing();
    config::load_env_file();

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            // Configuration the operator got wrong is the operator's to fix,
            // so it is said plainly and the process stops rather than falling
            // back to a default they did not ask for.
            tracing::error!("{error}");
            return ExitCode::FAILURE;
        }
    };

    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            tracing::error!("could not start the async runtime: {error}");
            return ExitCode::FAILURE;
        }
    };

    match runtime.block_on(serve(config)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn init_tracing() {
    // `RUST_LOG` if the operator set one, otherwise our own info-level lines
    // and nothing from the dependencies. Under systemd this goes to the
    // journal, which is where the TypeScript service's `console.error` lines
    // go today — and, like that service, it says something when a request
    // fails for a reason worth acting on, not once per request.
    //
    // `tower_http` is off by default rather than at `warn` because its
    // classifier calls every 5xx a failure, and the weather route answers 503
    // whenever the operator has not set a key — a documented state, not an
    // error, and one that would otherwise fill the journal every time somebody
    // opens the panel. `RUST_LOG=tower_http=debug` turns the request tracing
    // back on when it is actually wanted.
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("fieldmanager_api=info,tower_http=off"));
    fmt().with_env_filter(filter).init();
}

async fn serve(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new()
        .route("/api/health", get(routes::health::handler))
        .merge(routes::weather::router().map_err(|error| {
            format!("could not build the HTTP client for upstream requests: {error}")
        })?)
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind(config.bind).await.map_err(|error| {
        format!("could not bind {}: {error}", config.bind)
    })?;

    tracing::info!(
        version = VERSION,
        address = %listener.local_addr().unwrap_or(config.bind),
        "Field Manager API listening"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;

    tracing::info!("Field Manager API stopped");
    Ok(())
}

/// systemd stops a unit with `SIGTERM`, so that is the one that has to be
/// caught; `SIGINT` is here for a development run in a terminal. Either way
/// the requests in flight are allowed to finish.
async fn shutdown() {
    let interrupt = async {
        let _ = signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut stream) => {
                stream.recv().await;
            }
            Err(error) => {
                tracing::error!("could not listen for SIGTERM: {error}");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = interrupt => tracing::info!("SIGINT received, shutting down"),
        () = terminate => tracing::info!("SIGTERM received, shutting down"),
    }
}
