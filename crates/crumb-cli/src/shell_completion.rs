use std::io::Write;

use anyhow::{Result, bail};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CompletionShell {
    Bash,
    Zsh,
    Fish,
    PowerShell,
}

impl CompletionShell {
    /// Parses a stable shell identifier.
    ///
    /// # Errors
    ///
    /// Returns an error for unsupported shells.
    pub fn parse(value: &str) -> Result<Self> {
        match value.to_ascii_lowercase().as_str() {
            "bash" => Ok(Self::Bash),
            "zsh" => Ok(Self::Zsh),
            "fish" => Ok(Self::Fish),
            "powershell" | "pwsh" => Ok(Self::PowerShell),
            _ => bail!("supported completion shells: bash, zsh, fish, powershell"),
        }
    }

    const fn script(self) -> &'static str {
        match self {
            Self::Bash => BASH,
            Self::Zsh => ZSH,
            Self::Fish => FISH,
            Self::PowerShell => POWERSHELL,
        }
    }
}

/// Writes a prompt-free completion script.
///
/// # Errors
///
/// Returns an error when the destination cannot be written.
pub fn write_completion(shell: CompletionShell, writer: &mut dyn Write) -> Result<()> {
    writer.write_all(shell.script().as_bytes())?;
    Ok(())
}

const BASH: &str = r#"_crumb() {
    local current previous
    COMPREPLY=()
    current="${COMP_WORDS[COMP_CWORD]}"
    previous="${COMP_WORDS[COMP_CWORD-1]}"
    if [[ ${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "auth mcp review jobs completions" -- "${current}") )
        return
    fi
    case "${COMP_WORDS[1]}" in
        auth) COMPREPLY=( $(compgen -W "login status logout" -- "${current}") ) ;;
        mcp) COMPREPLY=( $(compgen -W "serve" -- "${current}") ) ;;
        review) COMPREPLY=( $(compgen -W "export" -- "${current}") ) ;;
        jobs) COMPREPLY=( $(compgen -W "list run tick" -- "${current}") ) ;;
        completions) COMPREPLY=( $(compgen -W "bash zsh fish powershell" -- "${current}") ) ;;
    esac
}
complete -F _crumb crumb
"#;

const ZSH: &str = r#"#compdef crumb
_crumb() {
    local -a root
    root=(
        'auth:manage crumb.elixpo account access'
        'mcp:serve the Crumb MCP boundary'
        'review:export edit checkpoint metadata'
        'jobs:manage local agent jobs'
        'completions:generate a shell completion script'
    )
    if (( CURRENT == 2 )); then
        _describe 'command' root
        return
    fi
    case "${words[2]}" in
        auth) _values 'action' login status logout ;;
        mcp) _values 'action' serve ;;
        review) _values 'action' export ;;
        jobs) _values 'action' list run tick ;;
        completions) _values 'shell' bash zsh fish powershell ;;
    esac
}
compdef _crumb crumb
"#;

const FISH: &str = r"complete -c crumb -f
complete -c crumb -n '__fish_use_subcommand' -a auth -d 'Manage crumb.elixpo account access'
complete -c crumb -n '__fish_use_subcommand' -a mcp -d 'Serve the Crumb MCP boundary'
complete -c crumb -n '__fish_use_subcommand' -a review -d 'Review edit checkpoints'
complete -c crumb -n '__fish_use_subcommand' -a jobs -d 'Manage local agent jobs'
complete -c crumb -n '__fish_use_subcommand' -a completions -d 'Generate shell completions'
complete -c crumb -n '__fish_seen_subcommand_from auth' -a 'login status logout'
complete -c crumb -n '__fish_seen_subcommand_from mcp' -a serve
complete -c crumb -n '__fish_seen_subcommand_from review' -a export
complete -c crumb -n '__fish_seen_subcommand_from jobs' -a 'list run tick'
complete -c crumb -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish powershell'
";

const POWERSHELL: &str = r#"Register-ArgumentCompleter -Native -CommandName crumb -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $words = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text })
    $choices = if ($words.Count -le 1) {
        @('auth', 'mcp', 'review', 'jobs', 'completions')
    } else {
        switch ($words[1]) {
            'auth' { @('login', 'status', 'logout') }
            'mcp' { @('serve') }
            'review' { @('export') }
            'jobs' { @('list', 'run', 'tick') }
            'completions' { @('bash', 'zsh', 'fish', 'powershell') }
            default { @() }
        }
    }
    $choices | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
"#;

#[cfg(test)]
mod tests {
    use super::{CompletionShell, write_completion};

    #[test]
    fn every_supported_shell_has_a_native_registration() {
        for (shell, marker) in [
            (CompletionShell::Bash, "complete -F"),
            (CompletionShell::Zsh, "#compdef crumb"),
            (CompletionShell::Fish, "complete -c crumb"),
            (CompletionShell::PowerShell, "Register-ArgumentCompleter"),
        ] {
            let mut output = Vec::new();
            write_completion(shell, &mut output).expect("completion renders");
            let output = String::from_utf8(output).expect("completion is UTF-8");
            assert!(output.contains(marker));
            assert!(output.contains("completions"));
        }
    }

    #[test]
    fn pwsh_alias_selects_powershell() {
        assert_eq!(
            CompletionShell::parse("pwsh").expect("alias parses"),
            CompletionShell::PowerShell
        );
    }
}
