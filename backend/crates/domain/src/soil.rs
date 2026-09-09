//! Soil analyses and the interpretation table — the Rust half of
//! `src/lib/soil.ts`.
//!
//! The band table itself is not written here. It is read from
//! `shared/soil-parameters.json`, embedded at build time, and the browser
//! imports the same file: AGENTS.md's rule that the answer and the screen
//! cannot disagree about what counts as low is only true while there is one
//! table. What each side writes for itself is the ten lines of
//! [`rate_measurement`], and `shared/fixtures/rate-measurement.json` is what
//! keeps those two readings honest.
//!
//! Measurements are held as strings, exactly as they are on the other side,
//! because a blank field has to stay blank: "not measured" is a real state on
//! a lab report and zero is a different answer from it.

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::js;

/// Which numeric measurements a record carries, in the order a report reads.
pub const SOIL_MEASUREMENT_KEYS: [&str; 11] = [
    "ph",
    "ec",
    "lime",
    "organicMatter",
    "phosphorus",
    "potassium",
    "nitrogen",
    "iron",
    "zinc",
    "manganese",
    "copper",
];

/// Drives the badge colour on the screen and reads as a word in the prompt.
/// "low" and "high" both mean "worth acting on"; they say which direction.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SoilLevel {
    Low,
    Optimal,
    High,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SoilRating {
    pub level: SoilLevel,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Band {
    /// Upper bound, exclusive. The last band of a list omits it to catch the rest.
    #[serde(default)]
    pub below: Option<f64>,
    pub level: SoilLevel,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilParameter {
    pub key: String,
    pub label: String,
    pub unit: String,
    #[serde(default)]
    pub hint: Option<String>,
    pub placeholder: String,
    /// Which section of the form the input belongs to.
    pub group: String,
    pub bands: Vec<Band>,
}

#[derive(Deserialize)]
struct SoilTable {
    parameters: Vec<SoilParameter>,
}

const SOIL_TABLE_JSON: &str = include_str!("../../../../shared/soil-parameters.json");

/// The interpretation table, as both halves of the application read it.
pub static SOIL_PARAMETERS: LazyLock<Vec<SoilParameter>> = LazyLock::new(|| {
    let table: SoilTable = serde_json::from_str(SOIL_TABLE_JSON)
        .expect("shared/soil-parameters.json is embedded at build time and must parse");
    table.parameters
});

/// The definition behind a measurement key: its label, unit and bands.
pub fn soil_parameter(key: &str) -> Option<&'static SoilParameter> {
    SOIL_PARAMETERS.iter().find(|parameter| parameter.key == key)
}

/// `Number` after the comma decimal separator a Turkish keyboard produces;
/// blank, and anything that is not a number, is "not measured" rather than zero.
pub fn parse_measurement(value: &str) -> Option<f64> {
    let trimmed = js::trim(value);
    if trimmed.is_empty() {
        return None;
    }
    // `String.prototype.replace` with a string replaces the first match only.
    let parsed = js::number_from_string(&trimmed.replacen(',', ".", 1));
    parsed.is_finite().then_some(parsed)
}

/// The band a reading falls in, or `None` where there is no reading.
pub fn rate_measurement(parameter: &SoilParameter, value: &str) -> Option<SoilRating> {
    let parsed = parse_measurement(value)?;
    for band in &parameter.bands {
        if band.below.is_none_or(|below| parsed < below) {
            return Some(SoilRating { level: band.level, label: band.label.clone() });
        }
    }
    None
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilAnalysis {
    pub id: String,
    pub field_id: String,
    // Denormalised so a record still reads correctly after its field is renamed
    // or deleted; the id is what links it back while the field still exists.
    pub field_name: String,
    pub sample_date: String,
    pub depth: String,
    pub lab: String,
    pub texture: String,
    pub notes: String,
    pub ph: String,
    pub ec: String,
    pub lime: String,
    pub organic_matter: String,
    pub phosphorus: String,
    pub potassium: String,
    pub nitrogen: String,
    pub iron: String,
    pub zinc: String,
    pub manganese: String,
    pub copper: String,
}

impl SoilAnalysis {
    /// The reading a measurement key names, as it was typed.
    pub fn measurement(&self, key: &str) -> &str {
        match key {
            "ph" => &self.ph,
            "ec" => &self.ec,
            "lime" => &self.lime,
            "organicMatter" => &self.organic_matter,
            "phosphorus" => &self.phosphorus,
            "potassium" => &self.potassium,
            "nitrogen" => &self.nitrogen,
            "iron" => &self.iron,
            "zinc" => &self.zinc,
            "manganese" => &self.manganese,
            "copper" => &self.copper,
            _ => "",
        }
    }

    pub fn has_any_measurement(&self) -> bool {
        SOIL_MEASUREMENT_KEYS.iter().any(|key| parse_measurement(self.measurement(key)).is_some())
    }
}

const TEXT_LIMIT: usize = 200;

/// Records arrive from the stored document or from a request body, either of
/// which may hold something unexpected — an older version of the app, a
/// hand-edited file, a hostile payload. Anything without an id is dropped;
/// every other field falls back to blank so nothing downstream has to guard
/// each read.
pub fn sanitize_analyses(value: Option<&Value>) -> Vec<SoilAnalysis> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries {
        let Some(source) = entry.as_object() else {
            continue;
        };
        let read = |key: &str| js::text(source.get(key), TEXT_LIMIT);
        let id = match js::as_str(source.get("id")) {
            Some(id) if !id.is_empty() => js::slice_utf16(id, 64),
            _ => continue,
        };
        result.push(SoilAnalysis {
            id,
            field_id: read("fieldId"),
            field_name: read("fieldName"),
            sample_date: read("sampleDate"),
            depth: read("depth"),
            lab: read("lab"),
            texture: read("texture"),
            notes: read("notes"),
            ph: read("ph"),
            ec: read("ec"),
            lime: read("lime"),
            organic_matter: read("organicMatter"),
            phosphorus: read("phosphorus"),
            potassium: read("potassium"),
            nitrogen: read("nitrogen"),
            iron: read("iron"),
            zinc: read("zinc"),
            manganese: read("manganese"),
            copper: read("copper"),
        });
    }
    result
}

/// Newest sample first; records without a usable date sort to the bottom.
pub fn by_newest_sample(left: &SoilAnalysis, right: &SoilAnalysis) -> std::cmp::Ordering {
    js::newest_first(js::date_parse(&left.sample_date), js::date_parse(&right.sample_date))
}

/// Every analysis recorded for one field, newest sample first — so the first is
/// the report that describes the soil as it stands. A blank id matches nothing
/// on purpose: it is what an empty field list leaves in a form.
pub fn analyses_for_field<'a>(
    analyses: &'a [SoilAnalysis],
    field_id: &str,
) -> Vec<&'a SoilAnalysis> {
    if field_id.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<&SoilAnalysis> =
        analyses.iter().filter(|analysis| analysis.field_id == field_id).collect();
    found.sort_by(|left, right| by_newest_sample(left, right));
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_parameter_names_a_measurement() {
        for parameter in SOIL_PARAMETERS.iter() {
            assert!(
                SOIL_MEASUREMENT_KEYS.contains(&parameter.key.as_str()),
                "{} is not a measurement a record carries",
                parameter.key
            );
            assert!(!parameter.bands.is_empty());
            assert!(
                parameter.bands.last().expect("a band").below.is_none(),
                "{} has no band to catch the readings above the last bound",
                parameter.key
            );
        }
        assert_eq!(SOIL_PARAMETERS.len(), SOIL_MEASUREMENT_KEYS.len());
    }

    #[test]
    fn a_reading_lands_in_a_band() {
        let organic = soil_parameter("organicMatter").expect("organic matter");
        assert_eq!(
            rate_measurement(organic, "1,4").expect("a rating").label,
            "Low"
        );
        assert!(rate_measurement(organic, "").is_none());
        assert_eq!(rate_measurement(organic, "  9 ").expect("a rating").level, SoilLevel::High);
    }
}
