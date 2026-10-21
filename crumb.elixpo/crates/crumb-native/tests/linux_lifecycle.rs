#![cfg(target_os = "linux")]

use std::io::Write;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::Result;
use crumb_native::protocol::CommandCompletion;
use crumb_native::session::{CommandOutcome, ShellSession};
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
fn lifecycle_frames_preserve_state_and_report_metadata() {
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let result = exercise_lifecycle();
        sender
            .send(result)
            .expect("test receiver should remain open");
    });

    let output = receiver
        .recv_timeout(Duration::from_secs(8))
        .expect("managed Bash should finish within eight seconds")
        .expect("managed Bash session should succeed");
    worker.join().expect("managed Bash worker should not panic");

    assert!(output.contains("state=ready"));
    assert!(!output.contains("\u{1e}crumb:"));
}

#[test]
fn foreground_input_and_interrupt_return_control_to_crumb() {
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let result = exercise_foreground_input_and_interrupt();
        sender
            .send(result)
            .expect("test receiver should remain open");
    });

    let output = receiver
        .recv_timeout(Duration::from_secs(8))
        .expect("foreground lifecycle should finish within eight seconds")
        .expect("foreground lifecycle should succeed");
    worker
        .join()
        .expect("foreground lifecycle worker should not panic");

    assert!(
        output.contains("prompt=answer"),
        "unexpected output: {output:?}"
    );
    assert!(
        output.contains("after-interrupt"),
        "unexpected output: {output:?}"
    );
}

fn exercise_lifecycle() -> Result<String> {
    let mut session =
        ShellSession::start(&DeterministicBash, &SystemPty, TerminalSize::new(24, 80))?;
    let mut output = Vec::new();

    let cd = completed(session.execute("cd /", &mut output)?);
    assert_eq!(cd.sequence, 1);
    assert_eq!(cd.exit_code, 0);
    assert_eq!(cd.cwd.to_string_lossy(), "/");

    session.execute("export CRUMB_LIFECYCLE_STATE=ready", &mut output)?;
    session.execute(
        "printf 'state=%s\\n' \"$CRUMB_LIFECYCLE_STATE\"",
        &mut output,
    )?;
    let failed = completed(session.execute("false", &mut output)?);
    assert_eq!(failed.exit_code, 1);
    let syntax_error = completed(session.execute("echo (broken)", &mut output)?);
    assert_ne!(syntax_error.exit_code, 0);
    assert_eq!(
        session.execute("exit", &mut output)?,
        CommandOutcome::ShellExited
    );

    Ok(String::from_utf8(output)?)
}

fn exercise_foreground_input_and_interrupt() -> Result<String> {
    let mut session =
        ShellSession::start(&DeterministicBash, &SystemPty, TerminalSize::new(24, 80))?;
    let mut output = Vec::new();

    let mut prompt_input = session.try_clone_input()?;
    let prompt_writer = thread::spawn(move || -> std::io::Result<()> {
        thread::sleep(Duration::from_millis(50));
        prompt_input.write_all(b"answer\n")?;
        prompt_input.flush()
    });
    let prompt = completed(
        session
            .submit("read -r value; printf 'prompt=%s\\n' \"$value\"")?
            .wait(&mut output)?,
    );
    prompt_writer
        .join()
        .expect("prompt input writer should not panic")?;
    assert_eq!(prompt.exit_code, 0);

    let mut interrupt_input = session.try_clone_input()?;
    let interrupt_writer = thread::spawn(move || -> std::io::Result<()> {
        thread::sleep(Duration::from_millis(100));
        interrupt_input.write_all(&[3])?;
        interrupt_input.flush()
    });
    let interrupted = completed(session.submit("sleep 10")?.wait(&mut output)?);
    interrupt_writer
        .join()
        .expect("interrupt writer should not panic")?;
    assert_eq!(interrupted.exit_code, 130);

    let resumed = completed(session.execute("printf 'after-interrupt\\n'", &mut output)?);
    assert_eq!(resumed.exit_code, 0);
    session.shutdown()?;

    Ok(String::from_utf8(output)?)
}

fn completed(outcome: CommandOutcome) -> CommandCompletion {
    match outcome {
        CommandOutcome::Completed(completion) => completion,
        CommandOutcome::ShellExited => panic!("shell exited before command completion"),
    }
}
