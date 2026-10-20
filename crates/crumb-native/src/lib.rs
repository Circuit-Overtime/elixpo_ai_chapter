//! Native-shell selection and lifecycle boundaries.

pub mod protocol;
pub mod session;

use anyhow::{Context, Result};
use crumb_platform::Platform;
use crumb_pty::{CommandSpec, PtyBackend, PtyProcess, TerminalSize};

/// Native shell families supported by crumb's architecture.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShellKind {
    Bash,
    Zsh,
    PowerShell,
}

/// Common lifecycle contract for an interactive native shell.
pub trait NativeShell {
    #[must_use]
    fn kind(&self) -> ShellKind;

    #[must_use]
    fn command_spec(&self) -> CommandSpec;

    /// Built-ins that cannot be discovered by scanning `PATH`.
    #[must_use]
    fn builtin_commands(&self) -> &'static [&'static str] {
        &[]
    }

    /// Starts the native shell with the selected PTY backend.
    ///
    /// # Errors
    ///
    /// Returns an error if the backend cannot allocate a PTY or start the
    /// shell process.
    fn spawn(&self, backend: &dyn PtyBackend, size: TerminalSize) -> Result<PtyProcess> {
        backend.spawn(&self.command_spec(), size)
    }
}

/// Linux Bash implementation for WP-002.
#[derive(Clone, Copy, Debug, Default)]
pub struct LinuxBash;

impl NativeShell for LinuxBash {
    fn kind(&self) -> ShellKind {
        ShellKind::Bash
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("bash").arg("-i")
    }

    fn builtin_commands(&self) -> &'static [&'static str] {
        POSIX_BUILTINS
    }
}

/// macOS Zsh implementation for WP-003.
#[derive(Clone, Copy, Debug, Default)]
pub struct MacOsZsh;

impl NativeShell for MacOsZsh {
    fn kind(&self) -> ShellKind {
        ShellKind::Zsh
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("zsh").arg("-i")
    }

    fn builtin_commands(&self) -> &'static [&'static str] {
        POSIX_BUILTINS
    }
}

/// Windows PowerShell implementation for WP-004.
#[derive(Clone, Copy, Debug, Default)]
pub struct WindowsPowerShell;

impl WindowsPowerShell {
    fn legacy_command_spec() -> CommandSpec {
        CommandSpec::new("powershell.exe")
            .arg("-NoLogo")
            .arg("-NoExit")
    }
}

impl NativeShell for WindowsPowerShell {
    fn kind(&self) -> ShellKind {
        ShellKind::PowerShell
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("pwsh").arg("-NoLogo").arg("-NoExit")
    }

    fn builtin_commands(&self) -> &'static [&'static str] {
        POWERSHELL_BUILTINS
    }

    fn spawn(&self, backend: &dyn PtyBackend, size: TerminalSize) -> Result<PtyProcess> {
        match backend.spawn(&self.command_spec(), size) {
            Ok(process) => Ok(process),
            Err(primary_error) => backend
                .spawn(&Self::legacy_command_spec(), size)
                .with_context(|| {
                    format!("pwsh failed before Windows PowerShell fallback: {primary_error:#}")
                }),
        }
    }
}

const POSIX_BUILTINS: &[&str] = &[
    ".", "alias", "bg", "break", "builtin", "cd", "command", "continue", "declare", "dirs",
    "disown", "echo", "eval", "exec", "exit", "export", "false", "fc", "fg", "getopts", "hash",
    "help", "history", "jobs", "kill", "let", "local", "logout", "popd", "printf", "pushd", "pwd",
    "read", "readonly", "return", "set", "shift", "source", "test", "times", "trap", "true",
    "type", "typeset", "ulimit", "umask", "unalias", "unset", "wait",
];

const POWERSHELL_BUILTINS: &[&str] = &[
    "cd", "chdir", "cls", "copy", "del", "dir", "echo", "erase", "foreach", "ft", "fl", "gc",
    "gci", "gi", "gm", "gps", "help", "history", "kill", "ls", "measure", "move", "pwd", "ren",
    "rm", "rmdir", "select", "set", "sort", "where", "write", "%", "?",
];

/// Selects the native shell implemented for a platform.
#[must_use]
pub fn shell_for(platform: Platform) -> Box<dyn NativeShell> {
    match platform {
        Platform::Linux => Box::new(LinuxBash),
        Platform::MacOs => Box::new(MacOsZsh),
        Platform::Windows => Box::new(WindowsPowerShell),
    }
}

#[cfg(test)]
mod tests {
    use crumb_platform::Platform;

    use super::{ShellKind, shell_for};

    #[test]
    fn linux_selects_interactive_bash() {
        let shell = shell_for(Platform::Linux);
        let command = shell.command_spec();

        assert_eq!(shell.kind(), ShellKind::Bash);
        assert_eq!(command.program(), "bash");
        assert_eq!(command.args(), ["-i"]);
    }

    #[test]
    fn macos_selects_interactive_zsh() {
        let shell = shell_for(Platform::MacOs);
        let command = shell.command_spec();

        assert_eq!(shell.kind(), ShellKind::Zsh);
        assert_eq!(command.program(), "zsh");
        assert_eq!(command.args(), ["-i"]);
    }

    #[test]
    fn windows_selects_modern_powershell() {
        let shell = shell_for(Platform::Windows);
        let command = shell.command_spec();

        assert_eq!(shell.kind(), ShellKind::PowerShell);
        assert_eq!(command.program(), "pwsh");
        assert_eq!(command.args(), ["-NoLogo", "-NoExit"]);
    }
}
