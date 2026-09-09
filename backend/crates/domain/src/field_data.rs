//! The document the server keeps, and the validation everything crossing the
//! wire goes through — the Rust half of `src/lib/field-data.ts`.
//!
//! Dates are ISO strings here, as they are in the file: JSON has no date type,
//! and a round trip must not quietly change what a field holds.
//!
//! Two properties of the TypeScript are load-bearing and are reproduced
//! exactly. Empty optionals collapse to nothing and are left out of the JSON
//! altogether, so `cropType: ""` is never written; and the order of every
//! array is the order the application shows, so nothing here sorts what it was
//! handed.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::irrigation::{IrrigationLog, sanitize_irrigation_logs};
use crate::js::{self, JsNumber};
use crate::protection::{ProtectionLog, sanitize_protection_logs};
use crate::soil::{SoilAnalysis, sanitize_analyses};
use crate::team::{ACTIVITY_LIMIT, ActivityItem, ActivityType};

pub const DATA_VERSION: u64 = 1;

const MAX_TEXT: usize = 200;
const MAX_NAME: usize = 128;
const MAX_ID: usize = 64;

// Ceilings, not expectations. They keep a malformed or hostile payload from
// filling the disk.
pub const MAX_FIELDS: usize = 2000;
pub const MAX_GROUPS: usize = 500;
pub const MAX_COORDINATES: usize = 5000;
pub const MAX_SOIL_ANALYSES: usize = 5000;
pub const MAX_IRRIGATION_LOGS: usize = 10000;
pub const MAX_FERTILIZER_LOGS: usize = 10000;
pub const MAX_PROTECTION_LOGS: usize = 10000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredField {
    pub id: String,
    pub name: String,
    pub coordinates: Vec<[JsNumber; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plant_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub harvest_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl StoredField {
    /// The corners as plain numbers, which is what the area calculation wants.
    pub fn corners(&self) -> Vec<[f64; 2]> {
        self.coordinates.iter().map(|[lat, lng]| [lat.0, lng.0]).collect()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StoredGroup {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FertilizerLog {
    pub id: String,
    pub field_name: String,
    pub date: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub amount: String,
}

/// The parts of the document the app actually edits.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldData {
    pub fields: Vec<StoredField>,
    pub groups: Vec<StoredGroup>,
    pub soil_analyses: Vec<SoilAnalysis>,
    pub irrigation_logs: Vec<IrrigationLog>,
    pub fertilizer_logs: Vec<FertilizerLog>,
    pub protection_logs: Vec<ProtectionLog>,
    pub activities: Vec<ActivityItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocument {
    pub version: u64,
    /// Bumped on every accepted write, so a stale client can be told to reload.
    pub revision: JsNumber,
    pub updated_at: String,
    #[serde(flatten)]
    pub data: FieldData,
}

pub fn empty_data() -> FieldData {
    FieldData::default()
}

pub fn empty_document() -> StoredDocument {
    StoredDocument {
        version: DATA_VERSION,
        revision: JsNumber(0.0),
        updated_at: now_iso(),
        data: empty_data(),
    }
}

fn now_iso() -> String {
    js::to_iso_string(js::now_ms()).unwrap_or_default()
}

/// Optional strings collapse to nothing so they stay out of the JSON.
fn optional_text(value: Option<&Value>, max: usize) -> Option<String> {
    let text = js::text(value, max);
    (!text.is_empty()).then_some(text)
}

/// Keeps only values a `Date` can actually be built from.
fn optional_date(value: Option<&Value>) -> Option<String> {
    let text = js::as_str(value)?;
    if text.is_empty() {
        return None;
    }
    js::to_iso_string(js::date_parse(text)?)
}

fn sanitize_coordinates(value: Option<&Value>) -> Vec<[JsNumber; 2]> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries.iter().take(MAX_COORDINATES) {
        let Some(pair) = entry.as_array() else {
            continue;
        };
        if pair.len() < 2 {
            continue;
        }
        let lat = js::to_number(pair.first());
        let lng = js::to_number(pair.get(1));
        if !lat.is_finite() || !lng.is_finite() {
            continue;
        }
        if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
            continue;
        }
        result.push([JsNumber(lat), JsNumber(lng)]);
    }
    result
}

/// An entry the shared document can carry: an object with a non-empty string
/// id. Arrays and nulls are not records, whatever `typeof` says about them.
fn record_with_id(entry: &Value) -> Option<(&serde_json::Map<String, Value>, String)> {
    let source = entry.as_object()?;
    let id = js::as_str(source.get("id"))?;
    if id.is_empty() {
        return None;
    }
    Some((source, js::slice_utf16(id, MAX_ID)))
}

pub fn sanitize_fields(value: Option<&Value>) -> Vec<StoredField> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries.iter().take(MAX_FIELDS) {
        let Some((source, id)) = record_with_id(entry) else {
            continue;
        };
        let coordinates = sanitize_coordinates(source.get("coordinates"));
        // Fewer than three corners is not a polygon; the map cannot draw it and
        // the area calculation would return zero, so the record is worse than
        // useless.
        if coordinates.len() < 3 {
            continue;
        }
        result.push(StoredField {
            id,
            name: js::text(source.get("name"), MAX_NAME),
            coordinates,
            crop_type: optional_text(source.get("cropType"), MAX_NAME),
            plant_date: optional_date(source.get("plantDate")),
            harvest_date: optional_date(source.get("harvestDate")),
            group_id: optional_text(source.get("groupId"), MAX_ID),
            color: optional_text(source.get("color"), 32),
        });
    }
    result
}

pub fn sanitize_groups(value: Option<&Value>) -> Vec<StoredGroup> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries.iter().take(MAX_GROUPS) {
        let Some((source, id)) = record_with_id(entry) else {
            continue;
        };
        result.push(StoredGroup { id, name: js::text(source.get("name"), MAX_NAME) });
    }
    result
}

pub fn sanitize_fertilizer_logs(value: Option<&Value>) -> Vec<FertilizerLog> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries.iter().take(MAX_FERTILIZER_LOGS) {
        let Some((source, id)) = record_with_id(entry) else {
            continue;
        };
        result.push(FertilizerLog {
            id,
            field_name: js::text(source.get("fieldName"), MAX_NAME),
            date: js::text(source.get("date"), 32),
            kind: js::text(source.get("type"), MAX_NAME),
            amount: js::text(source.get("amount"), 32),
        });
    }
    result
}

pub fn sanitize_activities(value: Option<&Value>) -> Vec<ActivityItem> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for entry in entries.iter().take(ACTIVITY_LIMIT) {
        let Some((source, id)) = record_with_id(entry) else {
            continue;
        };
        let timestamp = js::to_number(source.get("timestamp"));
        result.push(ActivityItem {
            id,
            user: js::text(source.get("user"), MAX_NAME),
            action: js::text(source.get("action"), MAX_TEXT),
            timestamp: JsNumber(if timestamp.is_finite() {
                timestamp
            } else {
                js::now_ms() as f64
            }),
            kind: ActivityType::parse_or_default(source.get("type")),
        });
    }
    result
}

pub fn sanitize_data(value: &Value) -> FieldData {
    let Some(source) = value.as_object() else {
        return empty_data();
    };
    let mut soil_analyses = sanitize_analyses(source.get("soilAnalyses"));
    soil_analyses.truncate(MAX_SOIL_ANALYSES);
    let mut irrigation_logs = sanitize_irrigation_logs(source.get("irrigationLogs"));
    irrigation_logs.truncate(MAX_IRRIGATION_LOGS);
    let mut protection_logs = sanitize_protection_logs(source.get("protectionLogs"));
    protection_logs.truncate(MAX_PROTECTION_LOGS);

    FieldData {
        fields: sanitize_fields(source.get("fields")),
        groups: sanitize_groups(source.get("groups")),
        soil_analyses,
        irrigation_logs,
        fertilizer_logs: sanitize_fertilizer_logs(source.get("fertilizerLogs")),
        protection_logs,
        activities: sanitize_activities(source.get("activities")),
    }
}

pub fn sanitize_document(value: &Value) -> StoredDocument {
    let Some(source) = value.as_object() else {
        return empty_document();
    };
    let revision = js::to_number(source.get("revision"));
    StoredDocument {
        version: DATA_VERSION,
        revision: JsNumber(if revision.is_finite() && revision >= 0.0 {
            revision.floor()
        } else {
            0.0
        }),
        updated_at: optional_date(source.get("updatedAt")).unwrap_or_else(now_iso),
        data: sanitize_data(value),
    }
}
