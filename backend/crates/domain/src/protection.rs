//! Crop protection records — the Rust half of `src/lib/protection.ts`.
//!
//! What was put on a field to deal with a pest, when, and by which of the two
//! approaches. The split between what has been carried out and what is only
//! planned is the part the assistant turns on: advising on the strength of a
//! spray that was only ever pencilled in is the failure worth designing
//! against, so [`split_by_status`] exists here as well as in the browser.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::irrigation::iso_day;
use crate::js;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionMethod {
    Biological,
    Chemical,
}

impl ProtectionMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Biological => "biological",
            Self::Chemical => "chemical",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "biological" => Some(Self::Biological),
            "chemical" => Some(Self::Chemical),
            _ => None,
        }
    }

    /// Spelled out rather than left as a key, because it is the thing an
    /// answer turns on: a named organism means something different released as
    /// a beneficial than it would as a product name.
    pub fn label(self) -> &'static str {
        match self {
            Self::Biological => "Biological control",
            Self::Chemical => "Chemical control",
        }
    }

    /// An unreadable method falls back to chemical. There is no neutral third
    /// state, and of the two that is both the commoner treatment and the one
    /// whose record matters more — a residue question is asked of sprays, not
    /// of released predators.
    fn normalize(value: Option<&Value>) -> Self {
        if js::as_str(value) == Some("biological") { Self::Biological } else { Self::Chemical }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionStatus {
    Planned,
    Applied,
}

impl ProtectionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Planned => "planned",
            Self::Applied => "applied",
        }
    }

    /// An unreadable status falls back to applied, for two reasons that point
    /// the same way. Records written before the module told the two apart were
    /// all treatments already carried out. And of the two mistakes, reading a
    /// real application as merely planned is the dangerous one: it invites a
    /// second spray of something already sprayed.
    fn normalize(value: Option<&Value>) -> Self {
        if js::as_str(value) == Some("planned") { Self::Planned } else { Self::Applied }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionLog {
    pub id: String,
    pub field_id: String,
    // Denormalised so a record still reads correctly after its field is renamed
    // or deleted; the id is what links it back while the field still exists.
    pub field_name: String,
    /// Whether the treatment has happened or is still due.
    pub status: ProtectionStatus,
    /// The day of the treatment, as `YYYY-MM-DD` — the day it was carried out,
    /// or the day it is planned for. Which one it means is what `status` says.
    pub date: String,
    pub method: ProtectionMethod,
    /// What was applied, in the grower's own words.
    pub agent: String,
    /// The pest or disease being treated.
    pub target: String,
    /// Free text, because the units are not comparable: a pesticide is dosed in
    /// ml or g per decare, a beneficial in individuals or cards per decare.
    pub dose: String,
    pub notes: String,
}

const MAX_TEXT: usize = 200;
const MAX_NAME: usize = 128;

pub fn sanitize_protection_logs(value: Option<&Value>) -> Vec<ProtectionLog> {
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
        result.push(ProtectionLog {
            id,
            field_id: js::text(source.get("fieldId"), 64),
            field_name: js::text(source.get("fieldName"), MAX_NAME),
            status: ProtectionStatus::normalize(source.get("status")),
            date: iso_day(source.get("date")),
            method: ProtectionMethod::normalize(source.get("method")),
            agent: js::text(source.get("agent"), MAX_NAME),
            target: js::text(source.get("target"), MAX_NAME),
            dose: js::text(source.get("dose"), 64),
            notes: js::text(source.get("notes"), MAX_TEXT),
        });
    }
    result
}

/// Newest first; records without a usable date sort to the bottom.
pub fn by_newest_treatment(left: &ProtectionLog, right: &ProtectionLog) -> Ordering {
    js::newest_first(js::date_parse(&left.date), js::date_parse(&right.date))
}

/// Soonest first; records without a usable date sort to the bottom.
pub fn by_soonest_planned(left: &ProtectionLog, right: &ProtectionLog) -> Ordering {
    js::soonest_first(js::date_parse(&left.date), js::date_parse(&right.date))
}

/// Every treatment recorded for one field, newest first. A blank id matches
/// nothing on purpose: it is what an empty field list leaves in a form, not a
/// field whose history should be shown.
pub fn treatments_for_field<'a>(
    logs: &'a [ProtectionLog],
    field_id: &str,
) -> Vec<&'a ProtectionLog> {
    if field_id.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<&ProtectionLog> =
        logs.iter().filter(|log| log.field_id == field_id).collect();
    found.sort_by(|left, right| by_newest_treatment(left, right));
    found
}

pub struct ProtectionSplit<'a> {
    pub planned: Vec<&'a ProtectionLog>,
    pub applied: Vec<&'a ProtectionLog>,
}

/// The two states, each in the order that state is read in.
///
/// A plan is about the future, so the nearest one matters most and they run
/// soonest first; a record of what was done is about the past, so the most
/// recent matters most and they run newest first. One mixed list ordered
/// either way buries half of itself.
pub fn split_by_status<'a, I>(logs: I) -> ProtectionSplit<'a>
where
    I: IntoIterator<Item = &'a ProtectionLog>,
{
    let mut planned = Vec::new();
    let mut applied = Vec::new();
    for log in logs {
        match log.status {
            ProtectionStatus::Planned => planned.push(log),
            ProtectionStatus::Applied => applied.push(log),
        }
    }
    planned.sort_by(|left, right| by_soonest_planned(left, right));
    applied.sort_by(|left, right| by_newest_treatment(left, right));
    ProtectionSplit { planned, applied }
}
