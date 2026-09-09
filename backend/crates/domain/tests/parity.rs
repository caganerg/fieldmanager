//! The fixtures in `shared/fixtures`, run against this crate.
//!
//! The same files are run against the TypeScript by `bun test`. That is the
//! whole point of them: `sanitizeData` is one definition today and two once
//! the backend is Rust, and two definitions of the same thing drift silently
//! unless something fails when they do. A new edge case becomes a fixture, and
//! then both sides fail until both sides agree.
//!
//! A fixture names the function it exercises. An unknown name is a failure
//! rather than a skip — a fixture nobody runs is worse than no fixture, since
//! it reads like coverage.

use std::{fs, path::PathBuf};

use fieldmanager_domain::{ai, auth, field_data, geo, irrigation, js, password, protection, soil};
use serde_json::Value;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../shared/fixtures")
}

#[test]
fn every_fixture_agrees_with_the_typescript() {
    let directory = fixtures_dir();
    let mut files: Vec<PathBuf> = fs::read_dir(&directory)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", directory.display()))
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no fixtures in {}", directory.display());

    let mut checked = 0usize;
    for file in &files {
        let text = fs::read_to_string(file).expect("a fixture file");
        let fixture: Value = serde_json::from_str(&text)
            .unwrap_or_else(|error| panic!("{}: {error}", file.display()));
        let function = fixture["function"].as_str().unwrap_or_else(|| {
            panic!("{} does not say which function it is for", file.display())
        });
        let tolerance = fixture.get("tolerance").and_then(Value::as_f64);

        if function == "scrypt" {
            checked += check_scrypt(&fixture, file);
            continue;
        }

        for case in fixture["cases"].as_array().expect("a fixture holds cases") {
            let name = case["name"].as_str().unwrap_or("(unnamed)");
            let actual = apply(function, &case["input"]);
            if let Err(complaint) = compare(&case["expected"], &actual, tolerance) {
                panic!(
                    "{} — {name}: {complaint}\n  expected {}\n  actual   {}",
                    file.display(),
                    case["expected"],
                    actual
                );
            }
            checked += 1;
        }
    }
    println!("{checked} fixture cases over {} files", files.len());
}

/// What the fixture's function answers, as JSON — serialised and read back so
/// that the numbers are compared as they will be written to the wire, not as
/// doubles that happen to be equal.
fn apply(function: &str, input: &Value) -> Value {
    let text = match function {
        "sanitizeDocument" => serde_json::to_string(&field_data::sanitize_document(input)),
        "sanitizeMessages" => serde_json::to_string(&ai::sanitize_messages(Some(input))),
        "normalizeUsername" => serde_json::to_string(&auth::normalize_username_value(Some(input))),
        "validateUsername" => {
            serde_json::to_string(&auth::validate_username(input.as_str().unwrap_or_default()))
        }
        "validatePassword" => {
            serde_json::to_string(&auth::validate_password(input.as_str().unwrap_or_default()))
        }
        "polygonArea" => {
            let corners: Vec<[f64; 2]> =
                serde_json::from_value(input.clone()).expect("a list of corners");
            serde_json::to_string(&js::JsNumber(geo::polygon_area(&corners)))
        }
        "rateMeasurement" => {
            let key = input["key"].as_str().expect("a measurement key");
            let parameter = soil::soil_parameter(key)
                .unwrap_or_else(|| panic!("{key} is not in shared/soil-parameters.json"));
            serde_json::to_string(&soil::rate_measurement(
                parameter,
                input["value"].as_str().unwrap_or_default(),
            ))
        }
        "methodLabel" => {
            let method = input["method"].as_str().unwrap_or_default();
            let label = match input["kind"].as_str().unwrap_or_default() {
                "irrigation" => irrigation::IrrigationMethod::parse(method)
                    .unwrap_or_else(|| panic!("{method} is not an irrigation method"))
                    .label(),
                "protection" => protection::ProtectionMethod::parse(method)
                    .unwrap_or_else(|| panic!("{method} is not a protection method"))
                    .label(),
                other => panic!("{other} is not a kind of method"),
            };
            serde_json::to_string(label)
        }
        other => panic!(
            "no Rust side for the fixture function `{other}`: implement it here and in \
             tests/parity.test.ts, or the fixture is only pretending to be covered"
        ),
    };
    serde_json::from_str(&text.expect("the result serialises")).expect("the result is JSON")
}

/// The scrypt vectors, which are a cross-check rather than a transformation:
/// a hash Bun wrote must verify here, and a hash this crate wrote must verify
/// there. Getting the parameters wrong is the one mistake in this migration
/// that would lock every account out of an installation at once.
fn check_scrypt(fixture: &Value, file: &std::path::Path) -> usize {
    let mut checked = 0usize;
    for case in fixture["cases"].as_array().expect("a fixture holds cases") {
        let name = case["name"].as_str().unwrap_or("(unnamed)");
        let secret = case["password"].as_str().expect("a password");
        let wrong = case["wrongPassword"].as_str().expect("a password that must not verify");

        for source in ["nodeHash", "rustHash"] {
            let stored = case[source].as_str().expect("a stored hash");
            assert!(
                password::verify_password(secret, stored),
                "{} — {name}: the {source} does not verify. The scrypt parameters have to be \
                 N=16384, r=8, p=1 with a 64-byte key, or every existing password stops working.",
                file.display()
            );
            assert!(
                !password::verify_password(wrong, stored),
                "{} — {name}: the {source} verified a password it should not have",
                file.display()
            );
            checked += 1;
        }

        // And a hash made here, now, verifies here — the other half of the
        // round trip is the same assertion on the TypeScript side.
        let fresh = password::hash_password(secret).expect("a hash");
        assert!(password::verify_password(secret, &fresh));
        checked += 1;
    }
    checked
}

/// Deep equality with three concessions, each of them deliberate: the key
/// *order* of an object is compared as well as its contents, because the
/// document is compared byte for byte against what TypeScript writes; a
/// fixture may ask for a timestamp near now rather than a fixed one; and a
/// fixture may set a tolerance, which is what the area calculation needs
/// because two runtimes' `sin` need not agree in the last bit.
fn compare(expected: &Value, actual: &Value, tolerance: Option<f64>) -> Result<(), String> {
    match expected {
        Value::String(marker) if marker == "~now" => {
            let text = actual.as_str().ok_or("expected a timestamp, found something else")?;
            let parsed = js::date_parse(text).ok_or(format!("{text} is not a date"))?;
            near_now(parsed as f64)
        }
        Value::String(marker) if marker == "~nowMs" => {
            let number = actual.as_f64().ok_or("expected a number of milliseconds")?;
            near_now(number)
        }
        Value::Object(expected_map) => {
            let actual_map =
                actual.as_object().ok_or_else(|| "expected an object".to_string())?;
            if expected_map.len() != actual_map.len() {
                return Err(format!(
                    "expected {} keys, found {}",
                    expected_map.len(),
                    actual_map.len()
                ));
            }
            for ((expected_key, expected_value), (actual_key, actual_value)) in
                expected_map.iter().zip(actual_map.iter())
            {
                if expected_key != actual_key {
                    return Err(format!("expected the key `{expected_key}`, found `{actual_key}`"));
                }
                compare(expected_value, actual_value, tolerance)
                    .map_err(|complaint| format!("at `{expected_key}`: {complaint}"))?;
            }
            Ok(())
        }
        Value::Array(expected_items) => {
            let actual_items = actual.as_array().ok_or_else(|| "expected an array".to_string())?;
            if expected_items.len() != actual_items.len() {
                return Err(format!(
                    "expected {} entries, found {}",
                    expected_items.len(),
                    actual_items.len()
                ));
            }
            for (index, (expected_item, actual_item)) in
                expected_items.iter().zip(actual_items).enumerate()
            {
                compare(expected_item, actual_item, tolerance)
                    .map_err(|complaint| format!("at [{index}]: {complaint}"))?;
            }
            Ok(())
        }
        Value::Number(expected_number) => {
            let actual_number = actual.as_f64().ok_or_else(|| "expected a number".to_string())?;
            let expected_number = expected_number.as_f64().unwrap_or(f64::NAN);
            match tolerance {
                Some(tolerance) => {
                    let scale = expected_number.abs().max(1.0);
                    if (expected_number - actual_number).abs() <= tolerance * scale {
                        Ok(())
                    } else {
                        Err(format!("{actual_number} is not within {tolerance} of {expected_number}"))
                    }
                }
                // Written out rather than compared as values, so that a `500`
                // answered with `500.0` is the failure it would be in the file.
                #[allow(clippy::cmp_owned)]
                None if expected.to_string() == actual.to_string() => Ok(()),
                None => Err(format!("expected {expected}, found {actual}")),
            }
        }
        other if other == actual => Ok(()),
        _ => Err("values differ".to_string()),
    }
}

fn near_now(stamp: f64) -> Result<(), String> {
    let now = js::now_ms() as f64;
    if (stamp - now).abs() < 60_000.0 {
        Ok(())
    } else {
        Err(format!("{stamp} is not within a minute of now"))
    }
}
