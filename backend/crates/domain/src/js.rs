//! The JavaScript the sanitisers were written in.
//!
//! Every `sanitize*` function in `src/lib` is specified in terms of the
//! language it was written in: `String.prototype.slice` counts UTF-16 code
//! units, `Number("")` is zero, `parseFloat("20 m³")` is twenty, and
//! `Date.parse` decides what a date is. Porting those functions to Rust
//! without porting those rules would produce a sanitiser that agrees with the
//! TypeScript on the records this farm happens to hold today and disagrees on
//! the next hand-edited file, which is the drift the whole parity exercise
//! exists to catch.
//!
//! So the coercions live here, once, named after the JavaScript expression
//! each one stands for, and the sanitisers read almost line for line like the
//! modules they came from.
//!
//! Two deliberate departures, both narrowing rather than widening:
//!
//! - **A split surrogate pair is dropped whole.** `"…😀".slice(0, 63)` in
//!   JavaScript cuts an emoji in half and keeps the leading half as a lone
//!   surrogate, which no Rust `String` can hold. Truncation here stops one
//!   code unit earlier instead. It costs a character in a case that only
//!   arises when a caller sends a name longer than the limit that also ends on
//!   an astral character at exactly the wrong offset.
//! - **`date_parse` implements the specified format and nothing else.**
//!   Anything outside the Date Time String Format is implementation-defined in
//!   JavaScript — V8 reads `"May 1, 2024"`, other engines need not — and the
//!   application only ever stores `toISOString()` output or a date input's
//!   `YYYY-MM-DD`. Such a string is read as unparseable here, which is the
//!   same answer the sanitisers give for anything else they cannot read.

use std::{cmp::Ordering, fmt};

use chrono::{Datelike, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use serde_json::{Value, value::RawValue};

/// `typeof value === "string" ? value : undefined`.
pub fn as_str(value: Option<&Value>) -> Option<&str> {
    match value {
        Some(Value::String(text)) => Some(text),
        _ => None,
    }
}

/// `typeof value === "string" ? value.slice(0, max) : ""` — the read every
/// sanitiser here does for a text field.
pub fn text(value: Option<&Value>, max: usize) -> String {
    as_str(value).map(|found| slice_utf16(found, max)).unwrap_or_default()
}

/// `String.prototype.slice(0, max)`: a limit in UTF-16 code units, so an emoji
/// costs two and a Turkish `ğ` costs one.
pub fn slice_utf16(value: &str, max: usize) -> String {
    let mut units = 0usize;
    let mut end = 0usize;
    for (offset, character) in value.char_indices() {
        let width = character.len_utf16();
        if units + width > max {
            break;
        }
        units += width;
        end = offset + character.len_utf8();
    }
    value[..end].to_string()
}

/// `Number(value)`, including the coercions that make `Number(null)` zero and
/// `Number({})` a NaN. The sanitisers all follow it with a finite check, so a
/// NaN here means "unusable", exactly as it does on the other side.
pub fn to_number(value: Option<&Value>) -> f64 {
    match value {
        // `Number(undefined)`
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(flag)) => {
            if *flag {
                1.0
            } else {
                0.0
            }
        }
        Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(text)) => number_from_string(text),
        // An array converts to a primitive by joining it, so `Number([])` is 0
        // and `Number([7])` is 7; a plain object becomes "[object Object]".
        Some(array @ Value::Array(_)) => number_from_string(&to_js_string(array)),
        Some(Value::Object(_)) => f64::NAN,
    }
}

/// `parseFloat(String(value ?? ""))`: the longest numeric prefix, which is how
/// the irrigation module still reads volumes stored as `"20 m³"`.
pub fn parse_float(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        other => parse_float_str(&other.map(to_js_string).unwrap_or_default()),
    }
}

/// `String(value)`.
pub fn to_js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.as_f64().map(number_to_string).unwrap_or_default(),
        Value::String(text) => text.clone(),
        // `Array.prototype.join`, which renders null and undefined as nothing.
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                other => to_js_string(other),
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// `Number(text)` for a string: the `StringNumericLiteral` grammar, where
/// whitespace either side is ignored, an empty string is zero, `Infinity` is
/// spelled out in full, and the radix prefixes are accepted.
pub fn number_from_string(text: &str) -> f64 {
    let trimmed = text.trim_matches(is_js_whitespace);
    if trimmed.is_empty() {
        return 0.0;
    }
    if let Some(rest) = trimmed.strip_prefix("0x").or_else(|| trimmed.strip_prefix("0X")) {
        return u128::from_str_radix(rest, 16).map(|parsed| parsed as f64).unwrap_or(f64::NAN);
    }
    if let Some(rest) = trimmed.strip_prefix("0o").or_else(|| trimmed.strip_prefix("0O")) {
        return u128::from_str_radix(rest, 8).map(|parsed| parsed as f64).unwrap_or(f64::NAN);
    }
    if let Some(rest) = trimmed.strip_prefix("0b").or_else(|| trimmed.strip_prefix("0B")) {
        return u128::from_str_radix(rest, 2).map(|parsed| parsed as f64).unwrap_or(f64::NAN);
    }
    match trimmed {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    // Rust's parser also answers to "inf", "infinity" and "NaN" in any case,
    // none of which JavaScript accepts.
    if trimmed.chars().any(|character| matches!(character, 'i' | 'I' | 'n' | 'N')) {
        return f64::NAN;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// `parseFloat` on a string: read as far as the grammar holds, ignore the rest.
fn parse_float_str(text: &str) -> f64 {
    let trimmed = text.trim_start_matches(is_js_whitespace);
    let bytes = trimmed.as_bytes();
    let mut index = 0usize;

    if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
        index += 1;
    }
    if trimmed[index..].starts_with("Infinity") {
        return if bytes.first() == Some(&b'-') { f64::NEG_INFINITY } else { f64::INFINITY };
    }

    let integer_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    let mut digits = index > integer_start;
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        digits = digits || index > fraction_start;
    }
    if !digits {
        return f64::NAN;
    }

    // An exponent counts only when it is complete: "1e" is one, not a NaN.
    let mantissa_end = index;
    if index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        let mut lookahead = index + 1;
        if lookahead < bytes.len() && (bytes[lookahead] == b'+' || bytes[lookahead] == b'-') {
            lookahead += 1;
        }
        let exponent_start = lookahead;
        while lookahead < bytes.len() && bytes[lookahead].is_ascii_digit() {
            lookahead += 1;
        }
        if lookahead > exponent_start {
            index = lookahead;
        }
    }

    trimmed[..index.max(mantissa_end)].parse::<f64>().unwrap_or(f64::NAN)
}

/// `String.prototype.trim`, which counts the byte-order mark as whitespace
/// where Rust's `trim` does not.
pub fn trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

fn is_js_whitespace(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}

/// The largest time value a `Date` can hold; `Date.parse` answers NaN outside
/// it, and `new Date(...).toISOString()` throws rather than returning one.
const MAX_TIME_VALUE: i64 = 8_640_000_000_000_000;

/// `Date.parse(value)`, in milliseconds — `None` where JavaScript answers NaN.
///
/// A string carrying a time but no offset is read in the *local* zone, which is
/// what the specification says and what the machine running this service will
/// therefore do. A date on its own is UTC. That asymmetry is JavaScript's, not
/// ours, and reproducing it is the point.
pub fn date_parse(value: &str) -> Option<i64> {
    let (date_part, time_part) = match value.split_once('T') {
        Some((date, time)) => (date, Some(time)),
        None => (value, None),
    };

    let date = parse_date_part(date_part)?;
    let Some(time_part) = time_part else {
        let stamp = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis();
        return in_range(stamp);
    };

    let (clock, zone) = split_zone(time_part);
    let (hour, minute, second, milli) = parse_time_part(clock)?;
    // Midnight at the end of the day is the one hour value above the range.
    let naive = if hour == 24 {
        if (minute, second, milli) != (0, 0, 0) {
            return None;
        }
        date.succ_opt()?.and_hms_milli_opt(0, 0, 0, 0)?
    } else {
        date.and_hms_milli_opt(hour, minute, second, milli)?
    };

    let stamp = match zone {
        Some(offset_minutes) => {
            naive.and_utc().timestamp_millis() - i64::from(offset_minutes) * 60_000
        }
        None => local_timestamp_millis(naive)?,
    };
    in_range(stamp)
}

fn in_range(stamp: i64) -> Option<i64> {
    (stamp.abs() <= MAX_TIME_VALUE).then_some(stamp)
}

/// The date half, where the grammar allows a day of 31 in any month and the
/// engine then rolls it forward: `Date.parse("2026-02-30")` is the second of
/// March, not a NaN. A month outside 01-12 or a day outside 01-31 *is* a NaN,
/// so the two kinds of wrong date part company here — which is why an
/// irrigation record dated `2026-13-45` loses its date and one dated
/// `2026-02-30` keeps a date in March.
fn parse_date_part(text: &str) -> Option<NaiveDate> {
    let mut parts = text.split('-');
    let year: i32 = digits(parts.next()?, 4)?;
    let month: u32 = match parts.next() {
        Some(part) => digits(part, 2)?,
        None => 1,
    };
    let day: u32 = match parts.next() {
        Some(part) => digits(part, 2)?,
        None => 1,
    };
    if parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    NaiveDate::from_ymd_opt(year, month, 1)?
        .checked_add_days(chrono::Days::new(u64::from(day) - 1))
}

/// The trailing `Z` or `±HH:mm`, as minutes east of UTC; `None` means the
/// string carried no offset at all and is therefore local time.
fn split_zone(text: &str) -> (&str, Option<i32>) {
    if let Some(clock) = text.strip_suffix('Z').or_else(|| text.strip_suffix('z')) {
        return (clock, Some(0));
    }
    for (index, character) in text.char_indices().rev() {
        if character == '+' || character == '-' {
            let offset = &text[index + 1..];
            let sign = if character == '+' { 1 } else { -1 };
            let (hours, minutes) = match offset.split_once(':') {
                Some((hours, minutes)) => (hours, minutes),
                // `+0300` and `+03` are both accepted by the engines.
                None if offset.len() == 4 => (&offset[..2], &offset[2..]),
                None => (offset, "00"),
            };
            let (Some(hours), Some(minutes)) = (digits::<i32>(hours, 2), digits::<i32>(minutes, 2))
            else {
                return (text, None);
            };
            if hours > 23 || minutes > 59 {
                return (text, None);
            }
            return (&text[..index], Some(sign * (hours * 60 + minutes)));
        }
    }
    (text, None)
}

fn parse_time_part(text: &str) -> Option<(u32, u32, u32, u32)> {
    let mut parts = text.split(':');
    let hour: u32 = digits(parts.next()?, 2)?;
    let minute: u32 = digits(parts.next()?, 2)?;
    let (second, milli) = match parts.next() {
        Some(part) => match part.split_once('.') {
            Some((second, fraction)) => {
                if fraction.is_empty() || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
                    return None;
                }
                // Engines take more than three digits and truncate.
                let mut padded = fraction.to_string();
                padded.truncate(3);
                while padded.len() < 3 {
                    padded.push('0');
                }
                (digits::<u32>(second, 2)?, padded.parse::<u32>().ok()?)
            }
            None => (digits::<u32>(part, 2)?, 0),
        },
        None => (0, 0),
    };
    if parts.next().is_some() || hour > 24 || minute > 59 || second > 59 {
        return None;
    }
    Some((hour, minute, second, milli))
}

/// A fixed-width run of digits, which is what the format calls for — this is
/// what keeps `2024-5-1` and `2024-005-01` from being read as a date.
fn digits<T: std::str::FromStr>(text: &str, width: usize) -> Option<T> {
    if text.len() != width || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

fn local_timestamp_millis(naive: NaiveDateTime) -> Option<i64> {
    // A clock reading that daylight saving skipped or repeated has no single
    // answer; JavaScript resolves both forward, and `earliest` is that.
    Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&naive).latest())
        .map(|moment| moment.timestamp_millis())
}

/// `new Date(ms).toISOString()`.
pub fn to_iso_string(ms: i64) -> Option<String> {
    let moment = Utc.timestamp_millis_opt(ms).single()?;
    // Years outside four digits take a different shape in JavaScript too, and
    // nothing in this application produces one.
    if !(0..=9999).contains(&moment.year()) {
        return None;
    }
    Some(moment.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
}

/// The comparator every "newest first" list in the application uses: records
/// whose date cannot be read sort to the bottom rather than to either end.
pub fn newest_first(left: Option<i64>, right: Option<i64>) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(left), Some(right)) => right.cmp(&left),
    }
}

/// The same, the other way round, for a list of plans: the nearest one first.
pub fn soonest_first(left: Option<i64>, right: Option<i64>) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(left), Some(right)) => left.cmp(&right),
    }
}

/// The current time as `Date.now()` would give it.
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

/// A number that serialises the way `JSON.stringify` writes one.
///
/// `serde_json` prints every `f64` as a float, so an area of exactly 500 comes
/// out as `500.0` where JavaScript writes `500`. That difference is invisible
/// to a parser and fatal to the byte-for-byte comparison this migration is
/// being held to, so every number that reaches the stored document goes
/// through this: coordinates, areas, volumes, timestamps and the revision.
///
/// It is written for `serde_json` specifically — the JSON document is the
/// contract, and there is no second format to serialise to.
#[derive(Clone, Copy, PartialEq, PartialOrd, Default)]
pub struct JsNumber(pub f64);

impl JsNumber {
    pub fn value(self) -> f64 {
        self.0
    }
}

impl From<f64> for JsNumber {
    fn from(value: f64) -> Self {
        Self(value)
    }
}

impl fmt::Debug for JsNumber {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&number_to_string(self.0))
    }
}

impl Serialize for JsNumber {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // `JSON.stringify(NaN)` is `null`, and so is an infinity.
        if !self.0.is_finite() {
            return serializer.serialize_unit();
        }
        match RawValue::from_string(number_to_string(self.0)) {
            Ok(raw) => raw.serialize(serializer),
            Err(_) => serializer.serialize_unit(),
        }
    }
}

impl<'de> Deserialize<'de> for JsNumber {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(deserializer)?;
        match &value {
            Value::Number(number) => Ok(Self(number.as_f64().ok_or_else(|| {
                de::Error::custom("a JSON number outside the range of a double")
            })?)),
            Value::Null => Ok(Self(f64::NAN)),
            _ => Err(de::Error::custom("expected a number")),
        }
    }
}

/// `String(value)` for a number, which is the same text `JSON.stringify` puts
/// in the document: no trailing `.0`, and the exponent thresholds JavaScript
/// uses rather than the ones a Rust formatter would.
pub fn number_to_string(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value == 0.0 {
        // Both zeroes print as "0"; only `Object.is` tells them apart.
        return "0".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }

    let sign = if value < 0.0 { "-" } else { "" };
    // Rust's `{:e}` is the shortest representation that round-trips, which is
    // the same set of digits the ECMAScript algorithm starts from.
    let scientific = format!("{:e}", value.abs());
    let (mantissa, exponent) = scientific.split_once('e').expect("`{:e}` writes an exponent");
    let digits: String = mantissa.chars().filter(|character| *character != '.').collect();
    let count = digits.len() as i32;
    let point = exponent.parse::<i32>().expect("`{:e}` writes an integer exponent") + 1;

    let body = if point >= count && point <= 21 {
        format!("{digits}{}", "0".repeat((point - count) as usize))
    } else if point > 0 && point <= 21 {
        format!("{}.{}", &digits[..point as usize], &digits[point as usize..])
    } else if point > -6 && point <= 0 {
        format!("0.{}{digits}", "0".repeat(-point as usize))
    } else {
        let exponent = point - 1;
        let sign = if exponent >= 0 { "+" } else { "-" };
        let rest = if count > 1 { format!(".{}", &digits[1..]) } else { String::new() };
        format!("{}{rest}e{sign}{}", &digits[..1], exponent.abs())
    };
    format!("{sign}{body}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn numbers_print_the_way_json_stringify_prints_them() {
        assert_eq!(number_to_string(500.0), "500");
        assert_eq!(number_to_string(41.5), "41.5");
        assert_eq!(number_to_string(-0.0), "0");
        assert_eq!(number_to_string(1e21), "1e+21");
        assert_eq!(number_to_string(1e-7), "1e-7");
        assert_eq!(number_to_string(0.000001), "0.000001");
        assert_eq!(number_to_string(1788990785379.0), "1788990785379");
        assert_eq!(serde_json::to_string(&JsNumber(500.0)).unwrap(), "500");
        assert_eq!(serde_json::to_string(&JsNumber(f64::NAN)).unwrap(), "null");
    }

    #[test]
    fn number_coercion_follows_the_language() {
        assert!(to_number(None).is_nan());
        assert_eq!(to_number(Some(&Value::Null)), 0.0);
        assert_eq!(to_number(Some(&json!(true))), 1.0);
        assert_eq!(to_number(Some(&json!("  41.5  "))), 41.5);
        assert_eq!(to_number(Some(&json!(""))), 0.0);
        assert!(to_number(Some(&json!("41.5abc"))).is_nan());
        assert!(to_number(Some(&json!("inf"))).is_nan());
        assert_eq!(to_number(Some(&json!([]))), 0.0);
        assert_eq!(to_number(Some(&json!([7]))), 7.0);
        assert!(to_number(Some(&json!({}))).is_nan());
    }

    #[test]
    fn parse_float_reads_a_prefix() {
        assert_eq!(parse_float(Some(&json!("20 m³"))), 20.0);
        assert_eq!(parse_float(Some(&json!("1e3 units"))), 1000.0);
        assert_eq!(parse_float(Some(&json!("1e"))), 1.0);
        assert!(parse_float(Some(&json!("m³"))).is_nan());
        assert!(parse_float(None).is_nan());
        assert!(parse_float(Some(&Value::Null)).is_nan());
    }

    #[test]
    fn utf16_truncation_counts_code_units() {
        assert_eq!(slice_utf16("ğüşiöç", 3), "ğüş");
        assert_eq!(slice_utf16("ab😀", 4), "ab😀");
        // Where JavaScript would keep half of the pair, this drops it.
        assert_eq!(slice_utf16("ab😀", 3), "ab");
    }

    #[test]
    fn dates_parse_like_the_engine() {
        assert_eq!(date_parse("2026-09-09T21:53:06.204Z"), Some(1788990786204));
        assert_eq!(date_parse("2024-05-01"), Some(1714521600000));
        assert_eq!(date_parse("2024-05-01T00:00:00+03:00"), Some(1714510800000));
        // A day past the end of its month rolls forward, as the engine does.
        assert_eq!(date_parse("2024-02-30").and_then(to_iso_string).as_deref(), Some("2024-03-01T00:00:00.000Z"));
        assert_eq!(date_parse("2026-13-45"), None);
        assert_eq!(date_parse("2026-01-00"), None);
        assert_eq!(date_parse("2024-5-1"), None);
        assert_eq!(date_parse("not a date"), None);
        assert_eq!(to_iso_string(1788990786204).as_deref(), Some("2026-09-09T21:53:06.204Z"));
    }
}
