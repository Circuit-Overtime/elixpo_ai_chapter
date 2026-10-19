#![cfg(target_os = "macos")]

use std::io::Read;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::Result;
use crumb_native::{NativeShell, ShellKind};
use crumb_pty::{CommandSpec, SystemPty, TerminalSize};

struct DeterministicZsh;

impl NativeShell for DeterministicZsh {
    fn kind(&self) -> ShellKind {
        ShellKind::Zsh
    }

    fn command_spec(&self) -> CommandSpec {
        CommandSpec::new("zsh").arg("-f").arg("-i")
    }
}

#[test]
fn zsh_state_persists_in_one_resizable_pty() {
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let result = exercise_persistent_zsh();
        sender
            .send(result)
            .expect("test receiver should remain open");
    });

    let output = receiver
        .recv_timeout(Duration::from_secs(5))
        .expect("interactive Zsh should exit within five seconds")
        .expect("PTY session should succeed");
    worker.join().expect("PTY worker should not panic");

    assert!(
        output.contains("__CRUMB_STATE__ cwd=/ env=ready"),
        "unexpected PTY output: {output:?}"
    );
}

fn exercise_persistent_zsh() -> Result<String> {
    let mut process = DeterministicZsh.spawn(&SystemPty, TerminalSize::new(24, 80))?;
    let mut reader = process.try_clone_reader()?;

    process.resize(TerminalSize::new(40, 120))?;
    process.write_input(
        b"cd /\nexport CRUMB_WP003_STATE=ready\nprintf '__CRUMB_STATE__ cwd=%s env=%s\\n' \"$PWD\" \"$CRUMB_WP003_STATE\"\nexit\n",
    )?;

    let mut output = String::new();
    reader.read_to_string(&mut output)?;
    process.wait()?;
    Ok(output)
}
