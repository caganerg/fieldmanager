//! Accounts, as far as both halves of the application agree on them — the Rust
//! half of `src/lib/auth.ts`.
//!
//! One record per person: the profile the team panel shows *and* the
//! credentials they sign in with. What varies is whether a person has a way
//! in: an account with a username and a password can sign in, one without is a
//! directory entry an administrator can hand a login to later.
//!
//! The stored account — the hash, the sessions, the file — is not here; that
//! belongs to the store. What is here is the shape a browser is allowed to see
//! and the two rules a form checks before it posts, which are deliberately
//! kept on both sides and tied together by `shared/fixtures`.

use serde::{Deserialize, Serialize};

pub use crate::team::UserRole as AccountRole;
pub use crate::team::USER_ROLES as ACCOUNT_ROLES;

/// Seeded on first run, and announced in README.md so it can be changed.
pub const DEFAULT_ADMIN_USERNAME: &str = "admin";
pub const DEFAULT_ADMIN_PASSWORD: &str = "admin";

pub const MIN_PASSWORD_LENGTH: usize = 8;
pub const MAX_PASSWORD_LENGTH: usize = 200;
pub const MAX_USERNAME_LENGTH: usize = 32;

/// Every field a person is assigned to, rather than a list of ids.
pub const ALL_FIELDS: &str = "all";

/// What the browser is allowed to see about a person: never the hash.
///
/// `last_login_at` and `must_change_password` are filled in for administrators
/// only — everyone signed in can see the directory, but which accounts are
/// still on a password somebody else chose is not everyone's business. They
/// are `Option` and left out of the JSON when absent, never written as `null`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccount {
    pub id: String,
    /// Empty when this person has no way to sign in yet.
    pub username: String,
    pub has_login: bool,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub role: AccountRole,
    /// Either the single entry "all" or specific field ids.
    pub assigned_field_ids: Vec<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub must_change_password: Option<bool>,
}

/// The signed-in account plus what this session may do with it.
///
/// Written out field by field rather than wrapping [`PublicAccount`], because
/// the key order is the one the TypeScript object spread produces and the
/// browser is reading this document unchanged.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: String,
    pub username: String,
    pub has_login: bool,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub role: AccountRole,
    pub assigned_field_ids: Vec<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<String>,
    pub must_change_password: bool,
    pub can_edit: bool,
    pub is_admin: bool,
}

/// Viewers read the workspace but never write it. Enforced on the server in
/// `/api/data`; the client uses the same rule only to grey out the controls
/// that would fail.
pub fn role_can_edit(role: AccountRole) -> bool {
    role != AccountRole::Viewer
}

pub fn to_session_user(account: PublicAccount) -> SessionUser {
    SessionUser {
        id: account.id,
        username: account.username,
        has_login: account.has_login,
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
        assigned_field_ids: account.assigned_field_ids,
        created_at: account.created_at,
        last_login_at: account.last_login_at,
        must_change_password: account.must_change_password == Some(true),
        can_edit: role_can_edit(account.role),
        is_admin: account.role == AccountRole::Admin,
    }
}

/// Usernames are compared case-insensitively and limited to characters that
/// survive a URL, a shell and a JSON file unchanged.
/// The same, for a value straight out of a request body, where "not a string
/// at all" is one of the things a username can be.
pub fn normalize_username_value(value: Option<&serde_json::Value>) -> String {
    crate::js::as_str(value).map(normalize_username).unwrap_or_default()
}

pub fn normalize_username(value: &str) -> String {
    let cleaned: String = value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
        .collect();
    crate::js::slice_utf16(&cleaned, MAX_USERNAME_LENGTH)
}

pub fn validate_username(value: &str) -> Option<String> {
    if value.chars().count() < 3 {
        return Some("Username must be at least 3 characters.".to_string());
    }
    let mut characters = value.chars();
    let first_is_alphanumeric =
        characters.next().is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit());
    let rest_is_allowed = characters.all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '.' | '_' | '-')
    });
    if !first_is_alphanumeric || !rest_is_allowed {
        return Some(
            "Username may use letters, digits, dot, dash and underscore, and must start with a letter or digit."
                .to_string(),
        );
    }
    None
}

/// Deliberately a length rule and nothing else. Composition rules push people
/// towards `Passw0rd!`; the honest defence here is length plus the fact that
/// the app is meant to sit on a trusted network.
///
/// The length is counted in UTF-16 code units, because the browser counts it
/// that way and a password the form accepts must not be one the server refuses.
pub fn validate_password(value: &str) -> Option<String> {
    let length: usize = value.chars().map(char::len_utf16).sum();
    if length < MIN_PASSWORD_LENGTH {
        return Some(format!("Password must be at least {MIN_PASSWORD_LENGTH} characters."));
    }
    if length > MAX_PASSWORD_LENGTH {
        return Some(format!("Password must be at most {MAX_PASSWORD_LENGTH} characters."));
    }
    None
}

pub fn has_all_fields(assigned_field_ids: &[String]) -> bool {
    assigned_field_ids.iter().any(|id| id == ALL_FIELDS)
}
