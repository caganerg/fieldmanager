//! Password hashing, in the format the TypeScript store already writes.
//!
//! `scrypt$<salt base64>$<hash base64>`, where the parameters are the ones
//! Node's `crypto.scrypt` uses by default — N=16384, r=8, p=1 — with a
//! 16-byte salt and a 64-byte key. Getting those right is what makes this
//! migration invisible to the people using it: every existing password keeps
//! working and nobody has to reset anything. Getting them wrong locks every
//! account out of the installation at once, which is why the cross-check
//! against a hash Bun produced is a fixture (`shared/fixtures/scrypt.json`)
//! rather than a comment.
//!
//! This is not part of what is isomorphic — the browser never hashes anything
//! — but it lives beside the account rules because the format is a contract
//! with the file that already exists, and because the slice that finally reads
//! that file should find one implementation rather than write a second.
//!
//! **Every call belongs in `spawn_blocking`.** Node hands this work to the
//! libuv pool, so `crypto.scrypt` is asynchronous and the request loop never
//! stalls. Here it is plain synchronous CPU work: N=16384 with r=8 means about
//! 16 MiB and tens of milliseconds per attempt, and a sign-in deliberately
//! hashes even for an unknown username. Called straight from a handler, that
//! is one stalled runtime worker per attempt.

use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD};
use scrypt::Params;
use subtle::ConstantTimeEq;

/// Node's defaults, spelled out: `log2(16384) = 14`.
const LOG_N: u8 = 14;
const R: u32 = 8;
const P: u32 = 1;
const SALT_BYTES: usize = 16;
const KEY_BYTES: usize = 64;

#[derive(Debug)]
pub enum PasswordError {
    /// The operating system would not give us a salt.
    Entropy,
    /// `scrypt` refused the parameters or the output length.
    Derivation,
}

impl std::fmt::Display for PasswordError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Entropy => formatter.write_str("could not read random bytes for a salt"),
            Self::Derivation => formatter.write_str("could not derive a password hash"),
        }
    }
}

impl std::error::Error for PasswordError {}

/// A fresh hash, with a random salt, in the stored format.
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    let mut salt = [0u8; SALT_BYTES];
    getrandom::fill(&mut salt).map_err(|_| PasswordError::Entropy)?;
    let derived = derive(password, &salt, KEY_BYTES)?;
    Ok(format!("scrypt${}${}", STANDARD.encode(salt), STANDARD.encode(derived)))
}

/// Whether a password matches a stored hash, in time that does not depend on
/// how much of the hash matched.
///
/// The key is derived to the length the stored hash actually has rather than
/// to [`KEY_BYTES`], which is what the TypeScript does — a hash written by
/// some earlier version with a different length still verifies or fails on its
/// own terms instead of erroring.
pub fn verify_password(password: &str, stored: &str) -> bool {
    let mut parts = stored.split('$');
    let (Some("scrypt"), Some(salt), Some(hash), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    if salt.is_empty() || hash.is_empty() {
        return false;
    }
    let (Some(salt), Some(expected)) = (decode_base64(salt), decode_base64(hash)) else {
        return false;
    };
    let Ok(derived) = derive(password, &salt, expected.len()) else {
        return false;
    };
    derived.len() == expected.len() && bool::from(derived.ct_eq(&expected))
}

fn derive(password: &str, salt: &[u8], length: usize) -> Result<Vec<u8>, PasswordError> {
    if length == 0 {
        return Err(PasswordError::Derivation);
    }
    let params = Params::new(LOG_N, R, P).map_err(|_| PasswordError::Derivation)?;
    let mut derived = vec![0u8; length];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut derived)
        .map_err(|_| PasswordError::Derivation)?;
    Ok(derived)
}

/// `Buffer.from(text, "base64")` is forgiving about padding; this is too.
fn decode_base64(text: &str) -> Option<Vec<u8>> {
    STANDARD.decode(text).or_else(|_| STANDARD_NO_PAD.decode(text)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hash_verifies_against_itself() {
        let stored = hash_password("correct horse battery staple").expect("a hash");
        assert!(stored.starts_with("scrypt$"));
        assert!(verify_password("correct horse battery staple", &stored));
        assert!(!verify_password("Correct horse battery staple", &stored));
    }

    #[test]
    fn a_malformed_hash_is_a_refusal_rather_than_a_panic() {
        assert!(!verify_password("anything", ""));
        assert!(!verify_password("anything", "scrypt$$"));
        assert!(!verify_password("anything", "bcrypt$c2FsdA==$aGFzaA=="));
        assert!(!verify_password("anything", "scrypt$not base64$aGFzaA=="));
    }
}
