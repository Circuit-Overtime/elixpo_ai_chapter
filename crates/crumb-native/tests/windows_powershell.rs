#![cfg(target_os = "windows")]

use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::{Result, bail};
use crumb_native::session::{CommandOutcome, ShellSession};
use crumb_native::{NativeShell, ShellKind};
use crumb_pty::{CommandSpec, SystemPty, TerminalSize};

const POWERSHELL_TIMEOUT: Duration = Duration::from_secs(30);

struct DeterministicPowerShell;

impl NativeShell for DeterministicPowerShell {
    fn kind(&self) -> ShellKind {
        ShellKind::PowerShell
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("pwsh")
            .arg("-NoLogo")
            .arg("-NoProfile")
            .arg("-NoExit")
    }
}

#[test]
fn powershell_state_persists_in_one_resizable_conpty() {
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let result = exercise_persistent_powershell();
        sender
            .send(result)
            .expect("test receiver should remain open");
    });

    let output = receiver
        .recv_timeout(POWERSHELL_TIMEOUT)
        .expect("interactive PowerShell should exit within thirty seconds")
        .expect("ConPTY session should succeed");
    worker.join().expect("ConPTY worker should not panic");

    assert!(
        output.contains("env=ready"),
        "unexpected ConPTY output: {output:?}"
    );
    assert!(
        output.to_ascii_lowercase().contains("cwd=c:\\windows"),
        "unexpected ConPTY output: {output:?}"
    );
}

fn exercise_persistent_powershell() -> Result<String> {
    let mut session = ShellSession::start(
        &DeterministicPowerShell,
        &SystemPty,
        TerminalSize::new(24, 80),
    )?;
    session.resize(TerminalSize::new(40, 120))?;

    let mut output = Vec::new();
    let outcome = session.execute(
        "$env:CRUMB_WP004_STATE = 'ready'; Set-Location C:\\Windows; Write-Output \"__CRUMB_STATE__ cwd=$((Get-Location).Path) env=$env:CRUMB_WP004_STATE\"",
        &mut output,
    )?;
    if !matches!(outcome, CommandOutcome::Completed(_)) {
        bail!("PowerShell exited before reporting command completion");
    }
    session.shutdown()?;
    Ok(String::from_utf8(output)?)
}
