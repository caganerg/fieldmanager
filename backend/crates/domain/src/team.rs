//! The vocabulary the people in a workspace are described with, plus the
//! activity log — the Rust half of `src/lib/team.ts`.
//!
//! The people themselves are accounts (`crate::auth`). Roles live here rather
//! than there because the activity log and the field data reference them too,
//! and `field_data` must be able to name a role without knowing anything about
//! passwords.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::js::{self, JsNumber};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    Agronomist,
    Operator,
    Viewer,
}

pub const USER_ROLES: [UserRole; 4] =
    [UserRole::Admin, UserRole::Agronomist, UserRole::Operator, UserRole::Viewer];

impl UserRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Agronomist => "agronomist",
            Self::Operator => "operator",
            Self::Viewer => "viewer",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        USER_ROLES.into_iter().find(|role| role.as_str() == value)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    FieldAdd,
    FieldEdit,
    FieldDelete,
    GroupAdd,
    UserAdd,
    UserEdit,
    Import,
    Default,
}

impl ActivityType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FieldAdd => "field_add",
            Self::FieldEdit => "field_edit",
            Self::FieldDelete => "field_delete",
            Self::GroupAdd => "group_add",
            Self::UserAdd => "user_add",
            Self::UserEdit => "user_edit",
            Self::Import => "import",
            Self::Default => "default",
        }
    }

    /// An unrecognised type lands on the least meaningful option rather than
    /// on whichever one happens to be listed first.
    pub fn parse_or_default(value: Option<&Value>) -> Self {
        const TYPES: [ActivityType; 8] = [
            ActivityType::FieldAdd,
            ActivityType::FieldEdit,
            ActivityType::FieldDelete,
            ActivityType::GroupAdd,
            ActivityType::UserAdd,
            ActivityType::UserEdit,
            ActivityType::Import,
            ActivityType::Default,
        ];
        js::as_str(value)
            .and_then(|found| TYPES.into_iter().find(|kind| kind.as_str() == found))
            .unwrap_or(Self::Default)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActivityItem {
    pub id: String,
    pub user: String,
    pub action: String,
    pub timestamp: JsNumber,
    #[serde(rename = "type")]
    pub kind: ActivityType,
}

pub fn default_activity() -> ActivityItem {
    ActivityItem {
        id: "act-init".to_string(),
        user: "Field Manager".to_string(),
        action: "Workspace initialized and ready".to_string(),
        timestamp: JsNumber(js::now_ms() as f64),
        kind: ActivityType::Default,
    }
}

/// Oldest entries fall off; the log is a recent history, not an audit trail.
pub const ACTIVITY_LIMIT: usize = 50;
