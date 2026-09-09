//! The version comes from `package.json`, not from `Cargo.toml`.
//!
//! The about dialog reads `NEXT_PUBLIC_APP_VERSION`, which `next.config.ts`
//! inlines from `package.json`; that is deliberately the one place the number
//! is written. A second service declaring its own version would be a second
//! place for it to drift, so this reads the same file at build time and the
//! crate's own `version` field stays at 0.0.0.

use std::{env, fs, path::Path};

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("project root");
    let manifest = root.join("package.json");

    println!("cargo:rerun-if-changed={}", manifest.display());

    let text = fs::read_to_string(&manifest)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", manifest.display()));
    let version = read_version(&text)
        .unwrap_or_else(|| panic!("no \"version\" string in {}", manifest.display()));

    println!("cargo:rustc-env=FIELDMANAGER_VERSION={version}");
    let _ = env::var("OUT_DIR");
}

/// The `"version"` value, without pulling a JSON parser into the build.
fn read_version(text: &str) -> Option<String> {
    let after_key = text.split_once("\"version\"")?.1;
    let after_colon = after_key.split_once(':')?.1;
    let opening = after_colon.find('"')?;
    let rest = &after_colon[opening + 1..];
    let closing = rest.find('"')?;
    Some(rest[..closing].to_string())
}
