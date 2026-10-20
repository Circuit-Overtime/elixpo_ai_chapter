#![cfg(target_os = "linux")]

use std::io::Read;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::Result;
use crumb_native::{NativeShell, ShellKind};
use crumb_pty::{CommandSpec, SystemPty, TerminalSize};

struct DeterministicBash;

impl NativeShell for DeterministicBash {
    fn kind(&self) -> ShellKind {
        ShellKind::Bash
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("bash")
            .arg("--noprofile")
            .arg("--norc")
            .arg("-i")
    }
}

#[test]
fn bash_state_persists_in_one_resizable_pty() {
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let result = exercise_persistent_bash();
        sender
            .send(result)
            .expect("test receiver should remain open");
    });

    let output = receiver
        .recv_timeout(Duration::from_secs(5))
        .expect("interactive Bash should exit within five seconds")
        .expect("PTY session should succeed");
    worker.join().expect("PTY worker should not panic");

    assert!(
        output.contains("__CRUMB_STATE__ cwd=/ env=ready"),
        "unexpected PTY output: {output:?}"
    );
}

fn exercise_persistent_bash() -> Result<String> {
    let mut process = DeterministicBash.spawn(&SystemPty, TerminalSize::new(24, 80))?;
    let mut reader = process.try_clone_reader()?;

    process.resize(TerminalSize::new(40, 120))?;
    process.write_input(
        b"cd /\nexport CRUMB_WP002_STATE=ready\nprintf '__CRUMB_STATE__ cwd=%s env=%s\\n' \"$PWD\" \"$CRUMB_WP002_STATE\"\nexit\n",
    )?;

    let mut output = String::new();
    reader.read_to_string(&mut output)?;
    process.wait()?;
    Ok(output)
}
