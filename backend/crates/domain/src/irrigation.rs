//! Irrigation records — the Rust half of `src/lib/irrigation.ts`.
//!
//! Which field was watered, how much of it, when, and when the next watering
//! is due. The type and its sanitiser live here rather than in `field_data`
//! for the same reason the soil ones do: the module owns its own shape, and
//! the shared document just composes them.
//!
//! What is *not* here is everything the browser alone needs — the badge
//! classes, the Turkish number formatting, the draft the form edits. Those
//! stay on the TypeScript side because nothing on the server draws anything.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::js::{self, JsNumber};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IrrigationMethod {
    Drip,
    Sprinkler,
    Furrow,
    Pivot,
    Other,
}

impl IrrigationMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Drip => "drip",
            Self::Sprinkler => "sprinkler",
            Self::Furrow => "furrow",
            Self::Pivot => "pivot",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "drip" => Some(Self::Drip),
            "sprinkler" => Some(Self::Sprinkler),
            "furrow" => Some(Self::Furrow),
            "pivot" => Some(Self::Pivot),
            "other" => Some(Self::Other),
            _ => None,
        }
    }

    /// What the method is called in a sentence — the English the interface
    /// shows, so the assistant's answer and the dialog say the same word.
    pub fn label(self) -> &'static str {
        match self {
            Self::Drip => "Drip irrigation",
            Self::Sprinkler => "Sprinkler",
            Self::Furrow => "Flood / furrow",
            Self::Pivot => "Center pivot",
            Self::Other => "Other",
        }
    }

    /// Before methods became keys they were stored as the English labels the
    /// old form put in its option values. Those are mapped back rather than
    /// dropped, which is why a farm's oldest records still read correctly.
    fn normalize(value: Option<&Value>) -> Self {
        let Some(text) = js::as_str(value) else {
            return Self::Other;
        };
        match text.trim().to_lowercase().as_str() {
            "drip" | "drip irrigation" => Self::Drip,
            "sprinkler" => Self::Sprinkler,
            "furrow" | "flood / furrow" => Self::Furrow,
            "pivot" | "center pivot" => Self::Pivot,
            "other" => Self::Other,
            _ => Self::Other,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrrigationLog {
    pub id: String,
    pub field_id: String,
    // Denormalised so a record still reads correctly after its field is renamed
    // or deleted; the id is what links it back while the field still exists.
    pub field_name: String,
    /// The day the water went on, as `YYYY-MM-DD`.
    pub date: String,
    /// How much of the field actually got water, in square metres.
    pub area_sqm: JsNumber,
    /// Volume applied, in cubic metres. 0 means it was not recorded.
    pub water_m3: JsNumber,
    pub method: IrrigationMethod,
    /// Planned next watering, `YYYY-MM-DD`; empty when nothing is planned yet.
    pub next_date: String,
}

// Ceilings, not expectations: 10⁹ m² is 100 000 ha, far past any single parcel,
// and the same bound on volume keeps a malformed payload out of the arithmetic.
const MAX_AREA_SQM: f64 = 1e9;
const MAX_WATER_M3: f64 = 1e9;

/// Reads a measured quantity. `parseFloat` rather than `Number` on purpose:
/// records written before this module stored numbers kept the volume as text
/// with its unit ("20 m³"), and those should survive the upgrade.
fn quantity(value: Option<&Value>, max: f64) -> JsNumber {
    let parsed = js::parse_float(value);
    if !parsed.is_finite() || parsed <= 0.0 {
        return JsNumber(0.0);
    }
    JsNumber(parsed.min(max))
}

/// Keeps plain calendar days only; anything else becomes "no date".
pub fn iso_day(value: Option<&Value>) -> String {
    let Some(text) = js::as_str(value) else {
        return String::new();
    };
    let day = js::slice_utf16(text, 10);
    let plausible = day.len() == 10
        && day.as_bytes()[4] == b'-'
        && day.as_bytes()[7] == b'-'
        && day.bytes().enumerate().all(|(index, byte)| {
            index == 4 || index == 7 || byte.is_ascii_digit()
        });
    if plausible && js::date_parse(&day).is_some() { day } else { String::new() }
}

pub fn sanitize_irrigation_logs(value: Option<&Value>) -> Vec<IrrigationLog> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries {
        let Some(source) = entry.as_object() else {
            continue;
        };
        let id = match js::as_str(source.get("id")) {
            Some(id) if !id.is_empty() => js::slice_utf16(id, 64),
            _ => continue,
        };
        result.push(IrrigationLog {
            id,
            field_id: js::text(source.get("fieldId"), 64),
            field_name: js::text(source.get("fieldName"), 128),
            date: iso_day(source.get("date")),
            area_sqm: quantity(source.get("areaSqm"), MAX_AREA_SQM),
            // `amount` is what the pre-numeric records called the volume.
            water_m3: quantity(
                source.get("waterM3").filter(|value| !value.is_null()).or_else(|| source.get("amount")),
                MAX_WATER_M3,
            ),
            method: IrrigationMethod::normalize(source.get("method")),
            next_date: iso_day(source.get("nextDate")),
        });
    }
    result
}

/// Newest first; records without a usable date sort to the bottom.
pub fn by_newest_irrigation(left: &IrrigationLog, right: &IrrigationLog) -> Ordering {
    js::newest_first(js::date_parse(&left.date), js::date_parse(&right.date))
}
