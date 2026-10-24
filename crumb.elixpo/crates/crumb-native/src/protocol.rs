//! Framing for command completion metadata emitted by native shell hooks.

use std::path::PathBuf;
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Result, anyhow};

use crate::ShellKind;

const FRAME_START: &str = "__CRUMB_FRAME__";
const FRAME_END: &str = "__CRUMB_END__";
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

/// Metadata collected when a native command completes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommandCompletion {
    pub sequence: u64,
    pub exit_code: i32,
    pub cwd: PathBuf,
}

/// Visible terminal bytes and hidden lifecycle events decoded from one chunk.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DecodedChunk {
    pub visible: Vec<u8>,
    pub completions: Vec<CommandCompletion>,
}

/// Session-scoped encoder and incremental completion-frame decoder.
#[derive(Clone, Debug)]
pub struct CompletionProtocol {
    token: String,
    pending: Vec<u8>,
}

impl CompletionProtocol {
    /// Creates a protocol with a process-local, session-specific token.
    #[must_use]
    pub fn new() -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let counter = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
        Self::with_token(format!("{:x}{timestamp:x}{counter:x}", process::id()))
    }

    /// Creates a protocol with a fixed token for deterministic tests.
    ///
    /// # Panics
    ///
    /// Panics when `token` is empty or contains a non-ASCII hexadecimal byte.
    #[must_use]
    pub fn with_token(token: String) -> Self {
        assert!(
            !token.is_empty() && token.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "completion token must be non-empty ASCII hexadecimal"
        );
        Self {
            token,
            pending: Vec::new(),
        }
    }

    /// Builds the shell hook that emits lifecycle metadata after a command
    /// returns control to the interactive shell.
    #[must_use]
    pub fn bootstrap(&self, kind: ShellKind) -> String {
        match kind {
            ShellKind::Bash => format!(
                "stty -echo; PS1=''; __crumb_emit() {{ __crumb_status=$?; if [ -n \"${{__crumb_seq-}}\" ]; then stty -echo; __crumb_cwd_hex=$(printf %s \"$PWD\" | od -An -tx1 | tr -d ' \\n'); printf '__CRUMB_''FRAME__crumb:{}:%s:%s:%s__CRUMB_''END__' \"$__crumb_seq\" \"$__crumb_status\" \"$__crumb_cwd_hex\"; unset __crumb_seq; fi; }}; PROMPT_COMMAND=__crumb_emit\n",
                self.token
            ),
            ShellKind::Zsh => format!(
                "stty -echo; PS1=''; RPS1=''; unsetopt zle prompt_cr prompt_sp; __crumb_emit() {{ __crumb_status=$?; if [ -n \"${{__crumb_seq-}}\" ]; then stty -echo; __crumb_cwd_hex=$(printf %s \"$PWD\" | od -An -tx1 | tr -d ' \\n'); printf '__CRUMB_''FRAME__crumb:{}:%s:%s:%s__CRUMB_''END__' \"$__crumb_seq\" \"$__crumb_status\" \"$__crumb_cwd_hex\"; unset __crumb_seq; fi; }}; precmd_functions=(__crumb_emit)\n",
                self.token
            ),
            ShellKind::PowerShell =>
                "Remove-Module PSReadLine -ErrorAction SilentlyContinue; $global:LASTEXITCODE = $null; "
                    .to_owned(),
        }
    }

    /// Builds a shell submission that preserves state and lets the installed
    /// prompt hook emit completion metadata after the command returns.
    #[must_use]
    pub fn submission(&self, kind: ShellKind, command: &str, sequence: u64) -> String {
        match kind {
            ShellKind::Bash | ShellKind::Zsh => Self::posix_submission(command, sequence),
            ShellKind::PowerShell => self.powershell_submission(command, sequence),
        }
    }

    /// Decodes arbitrary PTY chunks while retaining incomplete frame bytes.
    ///
    /// # Errors
    ///
    /// Returns an error when a matching lifecycle frame contains invalid
    /// numeric fields or malformed hexadecimal cwd bytes.
    pub fn decode(&mut self, input: &[u8]) -> Result<DecodedChunk> {
        self.pending.extend_from_slice(input);
        let prefix = self.frame_prefix();
        let mut decoded = DecodedChunk::default();

        loop {
            let Some(start) = find_subslice(&self.pending, &prefix) else {
                let retained = matching_suffix_len(&self.pending, &prefix);
                let visible_end = self.pending.len() - retained;
                decoded.visible.extend(self.pending.drain(..visible_end));
                break;
            };

            decoded.visible.extend(self.pending.drain(..start));
            let Some(relative_end) = find_subslice(&self.pending, FRAME_END.as_bytes()) else {
                break;
            };

            let frame = self.pending[..relative_end].to_vec();
            self.pending.drain(..relative_end + FRAME_END.len());
            decoded.completions.push(self.parse_frame(&frame)?);
        }

        Ok(decoded)
    }

    fn frame_prefix(&self) -> Vec<u8> {
        format!("{FRAME_START}crumb:{}:", self.token).into_bytes()
    }

    fn posix_submission(command: &str, sequence: u64) -> String {
        let command = command.replace('\'', "'\\''");
        format!("__crumb_seq={sequence}; stty echo; eval '{command}'\n")
    }

    fn powershell_submission(&self, command: &str, sequence: u64) -> String {
        format!(
            "$global:LASTEXITCODE=$null; {command}; $__crumb_status = if ($?) {{ 0 }} elseif ($null -ne $LASTEXITCODE) {{ $LASTEXITCODE }} else {{ 1 }}; $__crumb_cwd_hex = [Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes((Get-Location).Path)).ToLowerInvariant(); [Console]::Write('__CRUMB_' + 'FRAME__crumb:{}:{sequence}:' + $__crumb_status + ':' + $__crumb_cwd_hex + '__CRUMB_' + 'END__')\r",
            self.token
        )
    }

    fn parse_frame(&self, frame: &[u8]) -> Result<CommandCompletion> {
        let text = std::str::from_utf8(frame)?;
        let payload = text
            .strip_prefix(&format!("{FRAME_START}crumb:{}:", self.token))
            .ok_or_else(|| anyhow!("completion frame has an invalid session prefix"))?;
        let mut fields = payload.splitn(3, ':');
        let sequence = fields
            .next()
            .ok_or_else(|| anyhow!("completion frame is missing its sequence"))?
            .parse()?;
        let exit_code = fields
            .next()
            .ok_or_else(|| anyhow!("completion frame is missing its exit code"))?
            .parse()?;
        let cwd_hex = fields
            .next()
            .ok_or_else(|| anyhow!("completion frame is missing its cwd"))?;
        let cwd = PathBuf::from(String::from_utf8(decode_hex(cwd_hex)?)?);

        Ok(CommandCompletion {
            sequence,
            exit_code,
            cwd,
        })
    }
}

impl Default for CompletionProtocol {
    fn default() -> Self {
        Self::new()
    }
}

fn decode_hex(input: &str) -> Result<Vec<u8>> {
    if !input.len().is_multiple_of(2) {
        return Err(anyhow!("cwd hex payload has an odd length"));
    }

    input
        .as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            let pair = std::str::from_utf8(pair)?;
            Ok(u8::from_str_radix(pair, 16)?)
        })
        .collect()
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn matching_suffix_len(input: &[u8], prefix: &[u8]) -> usize {
    let maximum = input.len().min(prefix.len().saturating_sub(1));
    (1..=maximum)
        .rev()
        .find(|length| input.ends_with(&prefix[..*length]))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{CommandCompletion, CompletionProtocol};

    #[test]
    fn submission_runs_command_before_the_completion_hook() {
        let protocol = CompletionProtocol::with_token("abc123".to_owned());

        let submission = protocol.submission(crate::ShellKind::Bash, "cd /tmp", 7);

        assert_eq!(submission, "__crumb_seq=7; stty echo; eval 'cd /tmp'\n");
    }

    #[test]
    fn posix_submission_quotes_commands_without_exposing_them_to_outer_parsing() {
        let protocol = CompletionProtocol::with_token("abc123".to_owned());

        let submission = protocol.submission(
            crate::ShellKind::Bash,
            "printf '%s\\n' \"hello world\"; echo (broken)",
            8,
        );

        assert_eq!(
            submission,
            "__crumb_seq=8; stty echo; eval 'printf '\\''%s\\n'\\'' \"hello world\"; echo (broken)'\n"
        );
    }

    #[test]
    fn powershell_submission_resets_stale_native_exit_state() {
        let protocol = CompletionProtocol::with_token("abc123".to_owned());

        let submission =
            protocol.submission(crate::ShellKind::PowerShell, "Set-Location C:\\\\", 9);

        assert_eq!(
            submission,
            "$global:LASTEXITCODE=$null; Set-Location C:\\\\; $__crumb_status = if ($?) { 0 } elseif ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 }; $__crumb_cwd_hex = [Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes((Get-Location).Path)).ToLowerInvariant(); [Console]::Write('__CRUMB_' + 'FRAME__crumb:abc123:9:' + $__crumb_status + ':' + $__crumb_cwd_hex + '__CRUMB_' + 'END__')\r"
        );
    }

    #[test]
    fn bootstrap_installs_completion_hooks() {
        let protocol = CompletionProtocol::with_token("abc123".to_owned());

        let bash = protocol.bootstrap(crate::ShellKind::Bash);
        let zsh = protocol.bootstrap(crate::ShellKind::Zsh);
        let powershell = protocol.bootstrap(crate::ShellKind::PowerShell);

        assert!(bash.contains("PROMPT_COMMAND=__crumb_emit"));
        assert!(zsh.contains("precmd_functions=(__crumb_emit)"));
        assert!(powershell.contains("Remove-Module PSReadLine"));
        for bootstrap in [bash, zsh] {
            assert!(bootstrap.contains("crumb:abc123:"));
        }
    }

    #[test]
    fn decoder_hides_a_split_frame_and_preserves_visible_output() {
        let mut protocol = CompletionProtocol::with_token("abc123".to_owned());

        let first = protocol
            .decode(b"hello\r\n__CRUMB_FRAME__crumb:abc")
            .expect("first chunk should decode");
        let second = protocol
            .decode(b"123:7:0:2f746d70__CRUMB_END__")
            .expect("second chunk should decode");

        assert_eq!(first.visible, b"hello\r\n");
        assert!(matches!(first.completions.as_slice(), []));
        assert!(matches!(second.visible.as_slice(), []));
        assert_eq!(
            second.completions,
            [CommandCompletion {
                sequence: 7,
                exit_code: 0,
                cwd: PathBuf::from("/tmp"),
            }]
        );
    }

    #[test]
    fn unrelated_control_sequences_remain_visible() {
        let mut protocol = CompletionProtocol::with_token("abc123".to_owned());

        let decoded = protocol
            .decode(b"\x1b[31mred\x1b[0m")
            .expect("ANSI output should decode");

        assert_eq!(decoded.visible, b"\x1b[31mred\x1b[0m");
        assert!(matches!(decoded.completions.as_slice(), []));
    }
}
