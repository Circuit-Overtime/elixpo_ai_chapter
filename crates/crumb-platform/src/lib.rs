//! Compile-time host platform detection.

use std::fmt;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
compile_error!("crumb currently supports Linux, macOS, and Windows");

/// Platforms supported by crumb's native-shell architecture.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Platform {
    Linux,
    MacOs,
    Windows,
}

impl Platform {
    /// Returns the platform targeted by this build.
    #[must_use]
    pub const fn current() -> Self {
        #[cfg(target_os = "linux")]
        {
            Self::Linux
        }
        #[cfg(target_os = "macos")]
        {
            Self::MacOs
        }
        #[cfg(target_os = "windows")]
        {
            Self::Windows
        }
    }
}

impl fmt::Display for Platform {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Linux => "linux",
            Self::MacOs => "macos",
            Self::Windows => "windows",
        };
        formatter.write_str(name)
    }
}

#[cfg(test)]
mod tests {
    use super::Platform;

    #[test]
    fn current_platform_matches_the_build_target() {
        #[cfg(target_os = "linux")]
        assert_eq!(Platform::current(), Platform::Linux);
        #[cfg(target_os = "macos")]
        assert_eq!(Platform::current(), Platform::MacOs);
        #[cfg(target_os = "windows")]
        assert_eq!(Platform::current(), Platform::Windows);
    }

    #[test]
    fn display_is_stable_and_lowercase() {
        assert_eq!(Platform::Linux.to_string(), "linux");
        assert_eq!(Platform::MacOs.to_string(), "macos");
        assert_eq!(Platform::Windows.to_string(), "windows");
    }
}
