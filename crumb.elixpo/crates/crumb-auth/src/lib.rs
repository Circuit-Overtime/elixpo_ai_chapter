//! Secure credential storage boundaries for crumb.

use std::error::Error;
use std::fmt;
use std::sync::Mutex;

use keyring::{Entry, Error as KeyringError};
use zeroize::Zeroizing;

const SERVICE: &str = "crumb.elixpo";
const POLLINATIONS_ACCOUNT: &str = "pollinations-api-key";

pub type AuthResult<T> = Result<T, AuthError>;

/// Stable category for authentication and credential-store failures.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AuthErrorKind {
    EmptyCredential,
    StoreUnavailable,
    StoreLocked,
    StoreFailure,
}

/// Redacted authentication error safe to display in the terminal.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthError {
    pub kind: AuthErrorKind,
    message: &'static str,
}

impl AuthError {
    const fn new(kind: AuthErrorKind, message: &'static str) -> Self {
        Self { kind, message }
    }
}

impl fmt::Display for AuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for AuthError {}

/// Secret text that is redacted in diagnostics and zeroed when dropped.
pub struct SecretString {
    inner: Zeroizing<String>,
}

impl SecretString {
    /// Wraps secret text for redacted, zeroizing ownership.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            inner: Zeroizing::new(value.into()),
        }
    }

    #[must_use]
    pub fn expose(&self) -> &str {
        self.inner.as_str()
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretString([REDACTED])")
    }
}

/// Storage contract implemented by OS keychains and deterministic tests.
pub trait CredentialStore: Send + Sync {
    /// Saves or replaces the Pollinations credential.
    ///
    /// # Errors
    ///
    /// Returns a redacted error when secure storage is unavailable or fails.
    fn set(&self, secret: &SecretString) -> AuthResult<()>;

    /// Loads the Pollinations credential if configured.
    ///
    /// # Errors
    ///
    /// Returns a redacted error when secure storage is unavailable or fails.
    fn get(&self) -> AuthResult<Option<SecretString>>;

    /// Deletes only Crumb's Pollinations credential.
    ///
    /// Returns `true` when a stored credential was removed.
    ///
    /// # Errors
    ///
    /// Returns a redacted error when secure storage is unavailable or fails.
    fn delete(&self) -> AuthResult<bool>;
}

/// Platform credential store selected by the keyring backend.
pub struct OsCredentialStore {
    entry: Entry,
}

impl OsCredentialStore {
    /// Connects to the native credential-store entry without reading a secret.
    ///
    /// # Errors
    ///
    /// Returns a redacted error if the platform has no usable secure store.
    pub fn new() -> AuthResult<Self> {
        Self::named(SERVICE, POLLINATIONS_ACCOUNT)
    }

    /// Connects to an explicitly named native credential-store entry.
    ///
    /// Names are non-secret configuration; credential values remain behind
    /// the same redacted, zeroizing [`CredentialStore`] boundary.
    ///
    /// # Errors
    ///
    /// Returns a redacted error if the platform has no usable secure store.
    pub fn named(service: &str, account: &str) -> AuthResult<Self> {
        let entry = Entry::new(service, account).map_err(|error| map_keyring_error(&error))?;
        Ok(Self { entry })
    }
}

impl CredentialStore for OsCredentialStore {
    fn set(&self, secret: &SecretString) -> AuthResult<()> {
        self.entry
            .set_password(secret.expose())
            .map_err(|error| map_keyring_error(&error))
    }

    fn get(&self) -> AuthResult<Option<SecretString>> {
        match self.entry.get_password() {
            Ok(secret) => Ok(Some(SecretString::new(secret))),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(map_keyring_error(&error)),
        }
    }

    fn delete(&self) -> AuthResult<bool> {
        match self.entry.delete_credential() {
            Ok(()) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(error) => Err(map_keyring_error(&error)),
        }
    }
}

/// Credential source selected for the current process.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialSource {
    Environment,
    Keyring,
}

/// Redacted credential configuration state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CredentialStatus {
    pub configured: bool,
    pub source: Option<CredentialSource>,
}

/// Resolves credential status with an optional process-scoped override.
///
/// # Errors
///
/// Returns a redacted error when keyring access fails.
pub fn credential_status(
    store: &dyn CredentialStore,
    environment_value: Option<&str>,
) -> AuthResult<CredentialStatus> {
    if environment_value.is_some_and(|value| !value.trim().is_empty()) {
        return Ok(CredentialStatus {
            configured: true,
            source: Some(CredentialSource::Environment),
        });
    }
    let configured = store.get()?.is_some();
    Ok(CredentialStatus {
        configured,
        source: configured.then_some(CredentialSource::Keyring),
    })
}

/// Stores a non-empty credential in secure storage.
///
/// # Errors
///
/// Returns an error for empty input or secure-store failure.
pub fn login(store: &dyn CredentialStore, secret: &SecretString) -> AuthResult<()> {
    if secret.expose().trim().is_empty() {
        return Err(AuthError::new(
            AuthErrorKind::EmptyCredential,
            "Pollinations API key is empty",
        ));
    }
    store.set(secret)
}

/// In-memory credential store for deterministic tests.
#[derive(Debug, Default)]
pub struct MemoryCredentialStore {
    secret: Mutex<Option<String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn set(&self, secret: &SecretString) -> AuthResult<()> {
        let mut stored = self.lock()?;
        secret
            .expose()
            .clone_into(stored.get_or_insert_with(String::new));
        Ok(())
    }

    fn get(&self) -> AuthResult<Option<SecretString>> {
        Ok(self
            .lock()?
            .as_ref()
            .map(|value| SecretString::new(value.clone())))
    }

    fn delete(&self) -> AuthResult<bool> {
        Ok(self.lock()?.take().is_some())
    }
}

impl MemoryCredentialStore {
    fn lock(&self) -> AuthResult<std::sync::MutexGuard<'_, Option<String>>> {
        self.secret.lock().map_err(|_| {
            AuthError::new(
                AuthErrorKind::StoreFailure,
                "credential store operation failed",
            )
        })
    }
}

fn map_keyring_error(error: &KeyringError) -> AuthError {
    match error {
        KeyringError::NoDefaultStore | KeyringError::NotSupportedByStore(_) => AuthError::new(
            AuthErrorKind::StoreUnavailable,
            "secure credential store is unavailable",
        ),
        KeyringError::NoStorageAccess(_) => AuthError::new(
            AuthErrorKind::StoreLocked,
            "secure credential store is locked or inaccessible",
        ),
        _ => AuthError::new(
            AuthErrorKind::StoreFailure,
            "secure credential store operation failed",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CredentialSource, CredentialStore, MemoryCredentialStore, SecretString, credential_status,
        login,
    };

    #[test]
    fn memory_store_round_trips_and_deletes_secret() {
        let store = MemoryCredentialStore::default();
        let secret = SecretString::new("sk_fixture");

        login(&store, &secret).expect("login should succeed");
        assert_eq!(
            store
                .get()
                .expect("read should succeed")
                .expect("secret should exist")
                .expose(),
            "sk_fixture"
        );
        assert!(store.delete().expect("delete should succeed"));
        assert!(store.get().expect("read should succeed").is_none());
    }

    #[test]
    fn environment_override_wins_without_reading_secret_value() {
        let store = MemoryCredentialStore::default();
        login(&store, &SecretString::new("sk_stored")).expect("login should succeed");

        let status = credential_status(&store, Some("sk_process")).expect("status should load");

        assert!(status.configured);
        assert_eq!(status.source, Some(CredentialSource::Environment));
    }

    #[test]
    fn debug_output_never_contains_secret() {
        let secret = SecretString::new("sk_top_secret");

        let debug = format!("{secret:?}");

        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("sk_top_secret"));
    }
}
