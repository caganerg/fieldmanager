//! What the browser and the server both know about a farm.
//!
//! Today `sanitizeData` is one definition in TypeScript and both the API route
//! and the browser validate against it. As the backend moves to Rust that
//! definition becomes two, and the two copies drifting apart silently is the
//! largest piece of technical debt the migration creates. This crate is the
//! Rust copy, and it is written to be checked against the other one rather
//! than trusted:
//!
//! - `shared/soil-parameters.json` holds the soil interpretation table, read
//!   by this crate and by `src/lib/soil.ts`, so there is only ever one answer
//!   to what counts as low.
//! - `shared/fixtures/` holds input-and-expected pairs that both sides run —
//!   `cargo test -p fieldmanager-domain` here, `bun test` there. A new edge
//!   case becomes a fixture, and then both sides fail until both sides agree.
//! - [`js`] carries the JavaScript coercions the sanitisers were specified in,
//!   so the ports read like the modules they came from instead of quietly
//!   substituting Rust's rules for JavaScript's.
//!
//! Everything the browser alone needs — badge classes, form drafts, Turkish
//! number formatting — deliberately stayed on the TypeScript side. Nothing
//! here draws anything.

pub mod ai;
pub mod auth;
pub mod field_data;
pub mod geo;
pub mod irrigation;
pub mod js;
pub mod password;
pub mod protection;
pub mod soil;
pub mod team;
