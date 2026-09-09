//! The shape of a question put to the assistant — the Rust half of
//! `src/lib/ai.ts`.
//!
//! Nothing here is vendor-specific, on purpose. The three APIs disagree about
//! almost everything at the edges, and the parts they agree on are what this
//! module holds: a system prompt that travels *beside* the turns, turns that
//! alternate user and assistant, and a first turn that is always the user's.
//! Adding the adapter for a fourth vendor should not mean touching this file.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::js;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    Openai,
    Gemini,
}

impl AiProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Openai => "openai",
            Self::Gemini => "gemini",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "anthropic" => Some(Self::Anthropic),
            "openai" => Some(Self::Openai),
            "gemini" => Some(Self::Gemini),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiRole {
    User,
    Assistant,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: AiRole,
    pub content: String,
}

/// Which part of the app the question was asked from. It selects the system
/// prompt and decides what the server puts in front of the model — a soil
/// question wants the analyses, a fertilisation question wants those plus what
/// has already been applied, a crop protection question wants the treatments.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssistantTopic {
    General,
    Fertilizer,
    Soil,
    Protection,
}

impl AssistantTopic {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::Fertilizer => "fertilizer",
            Self::Soil => "soil",
            Self::Protection => "protection",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "general" => Some(Self::General),
            "fertilizer" => Some(Self::Fertilizer),
            "soil" => Some(Self::Soil),
            "protection" => Some(Self::Protection),
            _ => None,
        }
    }
}

// Ceilings, not expectations. A model call costs money per token, so unlike the
// data route — where the limits guard the disk — these guard the bill, and a
// runaway client is the thing they are guarding against.
pub const MAX_QUESTION_CHARS: usize = 2000;
pub const MAX_TURNS: usize = 40;

/// What the browser posts to `/api/ai`.
///
/// It carries no field data, only the id of the field the question is about.
/// The server already holds the document and reads the analyses and records
/// itself, which is both cheaper than shipping them up and the only version
/// that cannot be edited on the way.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantAsk {
    pub topic: AssistantTopic,
    /// Empty when the question is not about one particular field.
    pub field_id: String,
    /// The conversation so far, oldest first, ending in the new question.
    pub messages: Vec<AiMessage>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AssistantReply {
    pub reply: String,
    /// Which vendor answered. Shown to the user; never a key or an endpoint.
    pub provider: AiProvider,
    pub model: String,
}

/// Reduces whatever arrived to a conversation all three vendors will accept.
///
/// Blank turns are dropped rather than sent: an empty string is a 400 on
/// Anthropic and a wasted turn everywhere else. Consecutive turns from the same
/// role are merged — Anthropic would combine them silently and Gemini would
/// reject them, so doing it here keeps the two from disagreeing. What is left
/// is trimmed to the most recent [`MAX_TURNS`] and then to the first user turn,
/// since a window that happens to start on an assistant turn is rejected by two
/// of the three.
pub fn sanitize_messages(value: Option<&Value>) -> Vec<AiMessage> {
    let Some(Value::Array(entries)) = value else {
        return Vec::new();
    };

    let mut merged: Vec<AiMessage> = Vec::new();
    for entry in entries {
        let Some(source) = entry.as_object() else {
            continue;
        };
        let role = if js::as_str(source.get("role")) == Some("assistant") {
            AiRole::Assistant
        } else {
            AiRole::User
        };
        let content = js::as_str(source.get("content"))
            .map(|text| js::slice_utf16(js::trim(text), MAX_QUESTION_CHARS))
            .unwrap_or_default();
        if content.is_empty() {
            continue;
        }

        match merged.last_mut() {
            Some(last) if last.role == role => {
                last.content =
                    js::slice_utf16(&format!("{}\n\n{content}", last.content), MAX_QUESTION_CHARS);
            }
            _ => merged.push(AiMessage { role, content }),
        }
    }

    let recent = if merged.len() > MAX_TURNS {
        merged.split_off(merged.len() - MAX_TURNS)
    } else {
        merged
    };
    match recent.iter().position(|message| message.role == AiRole::User) {
        Some(first_user) => recent[first_user..].to_vec(),
        None => Vec::new(),
    }
}

/// Whether a sanitised conversation is something the server can actually send.
pub fn is_sendable(messages: &[AiMessage]) -> bool {
    messages.last().is_some_and(|message| message.role == AiRole::User)
}
