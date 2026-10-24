//! PTY primitives isolated from crumb's shell and UI layers.

use std::env;
use std::ffi::{OsStr, OsString};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Result, anyhow};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};

/// Initial or updated dimensions for a pseudoterminal.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TerminalSize {
    pub rows: u16,
    pub cols: u16,
    pub pixel_width: u16,
    pub pixel_height: u16,
}

impl TerminalSize {
    #[must_use]
    pub const fn new(rows: u16, cols: u16) -> Self {
        Self {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

impl From<TerminalSize> for PtySize {
    fn from(size: TerminalSize) -> Self {
        Self {
            rows: size.rows,
            cols: size.cols,
            pixel_width: size.pixel_width,
            pixel_height: size.pixel_height,
        }
    }
}

/// Provider-neutral description of a process launched inside a PTY.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommandSpec {
    program: OsString,
    args: Vec<OsString>,
    current_dir: Option<PathBuf>,
}

impl CommandSpec {
    #[must_use]
    pub fn new(program: impl Into<OsString>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            current_dir: None,
        }
    }

    #[must_use]
    pub fn arg(mut self, arg: impl Into<OsString>) -> Self {
        self.args.push(arg.into());
        self
    }

    #[must_use]
    pub fn current_dir(mut self, path: impl Into<PathBuf>) -> Self {
        self.current_dir = Some(path.into());
        self
    }

    #[must_use]
    pub fn program(&self) -> &OsStr {
        &self.program
    }

    #[must_use]
    pub fn args(&self) -> &[OsString] {
        &self.args
    }

    #[must_use]
    pub fn working_directory(&self) -> Option<&Path> {
        self.current_dir.as_deref()
    }

    fn to_command_builder(&self) -> Result<CommandBuilder> {
        let mut command = CommandBuilder::new(&self.program);
        for arg in &self.args {
            command.arg(arg);
        }
        let current_dir = match &self.current_dir {
            Some(path) => path.clone(),
            None => env::current_dir()?,
        };
        command.cwd(current_dir);
        Ok(command)
    }
}

/// Backend boundary for creating PTY-backed child processes.
pub trait PtyBackend {
    /// Starts `command` inside a new pseudoterminal.
    ///
    /// # Errors
    ///
    /// Returns an error if the PTY cannot be allocated or the child cannot be
    /// spawned.
    fn spawn(&self, command: &CommandSpec, size: TerminalSize) -> Result<PtyProcess>;
}

/// The operating system's native PTY backend.
#[derive(Clone, Copy, Debug, Default)]
pub struct SystemPty;

impl PtyBackend for SystemPty {
    fn spawn(&self, command: &CommandSpec, size: TerminalSize) -> Result<PtyProcess> {
        let pair = native_pty_system().openpty(size.into())?;
        let child = pair.slave.spawn_command(command.to_command_builder()?)?;
        drop(pair.slave);
        let writer = PtyInput::new(pair.master.take_writer()?);

        // portable-pty enables ConPTY cursor inheritance. Windows starts that
        // handshake with a device-status query and will not relay child I/O
        // until the terminal reports a cursor position. Crumb owns the PTY
        // screen, so finish that exchange before sending shell input.
        #[cfg(target_os = "windows")]
        complete_cursor_inheritance_handshake(pair.master.as_ref(), writer.clone())?;

        Ok(PtyProcess {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Some(writer),
            child,
        })
    }
}

#[cfg(target_os = "windows")]
fn complete_cursor_inheritance_handshake(
    master: &dyn MasterPty,
    mut writer: PtyInput,
) -> Result<()> {
    const CURSOR_QUERY: &[u8] = b"\x1b[6n";
    const CURSOR_ORIGIN: &[u8] = b"\x1b[1;1R";

    let mut reader = master.try_clone_reader()?;
    let mut pending = Vec::with_capacity(CURSOR_QUERY.len());
    let mut buffer = [0_u8; 64];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            return Err(anyhow!(
                "ConPTY closed before completing cursor inheritance"
            ));
        }
        pending.extend_from_slice(&buffer[..bytes_read]);
        if pending
            .windows(CURSOR_QUERY.len())
            .any(|window| window == CURSOR_QUERY)
        {
            writer.write_all(CURSOR_ORIGIN)?;
            writer.flush()?;
            return Ok(());
        }

        let retained = pending.len().min(CURSOR_QUERY.len().saturating_sub(1));
        pending.drain(..pending.len() - retained);
    }
}

/// A live child process and its controlling pseudoterminal.
pub struct PtyProcess {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Option<PtyInput>,
    child: Box<dyn Child + Send + Sync>,
}

impl PtyProcess {
    /// Clones a reader for the PTY output stream.
    ///
    /// # Errors
    ///
    /// Returns an error if the operating-system PTY reader cannot be cloned.
    pub fn try_clone_reader(&self) -> Result<Box<dyn Read + Send>> {
        self.master
            .lock()
            .map_err(|_| anyhow!("PTY master lock is poisoned"))?
            .try_clone_reader()
    }

    /// Writes bytes to the PTY input stream and flushes them immediately.
    ///
    /// # Errors
    ///
    /// Returns an error if writing or flushing the PTY fails.
    pub fn write_input(&mut self, input: &[u8]) -> Result<()> {
        let writer = self
            .writer
            .as_mut()
            .ok_or_else(|| anyhow!("PTY input writer has already been taken"))?;
        writer.write_all(input)?;
        writer.flush()?;
        Ok(())
    }

    /// Clones a synchronized handle to the PTY input stream.
    ///
    /// # Errors
    ///
    /// Returns an error if ownership of the input stream was already
    /// transferred with [`Self::take_writer`].
    pub fn try_clone_input(&self) -> Result<PtyInput> {
        self.writer
            .clone()
            .ok_or_else(|| anyhow!("PTY input writer has already been taken"))
    }

    /// Transfers ownership of the PTY input stream to a relay thread.
    ///
    /// # Errors
    ///
    /// Returns an error if the writer was already taken.
    pub fn take_writer(&mut self) -> Result<Box<dyn Write + Send>> {
        self.writer
            .take()
            .map(|writer| Box::new(writer) as Box<dyn Write + Send>)
            .ok_or_else(|| anyhow!("PTY input writer has already been taken"))
    }

    /// Updates the terminal dimensions seen by the child process.
    ///
    /// # Errors
    ///
    /// Returns an error if the platform cannot resize the PTY.
    pub fn resize(&self, size: TerminalSize) -> Result<()> {
        self.resizer().resize(size)
    }

    #[must_use]
    pub fn resizer(&self) -> PtyResizer {
        PtyResizer {
            master: Arc::clone(&self.master),
        }
    }

    /// Requests termination of the child process.
    ///
    /// # Errors
    ///
    /// Returns an error if the platform cannot signal the child.
    pub fn kill(&mut self) -> Result<()> {
        Ok(self.child.kill()?)
    }

    /// Waits for the PTY child to exit.
    ///
    /// # Errors
    ///
    /// Returns an error if the child status cannot be collected.
    pub fn wait(&mut self) -> Result<()> {
        self.child.wait()?;
        Ok(())
    }

    #[must_use]
    pub fn process_id(&self) -> Option<u32> {
        self.child.process_id()
    }
}

/// Cloneable, synchronized writer for a live PTY input stream.
#[derive(Clone)]
pub struct PtyInput {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

impl PtyInput {
    fn new(writer: Box<dyn Write + Send>) -> Self {
        Self {
            writer: Arc::new(Mutex::new(writer)),
        }
    }
}

impl Write for PtyInput {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.writer
            .lock()
            .map_err(|_| io::Error::other("PTY input lock is poisoned"))?
            .write(buffer)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.writer
            .lock()
            .map_err(|_| io::Error::other("PTY input lock is poisoned"))?
            .flush()
    }
}

/// Cloneable handle used to resize a live PTY from a watcher thread.
#[derive(Clone)]
pub struct PtyResizer {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
}

impl PtyResizer {
    /// Updates the terminal dimensions seen by the child process.
    ///
    /// # Errors
    ///
    /// Returns an error if the PTY lock is poisoned or resizing fails.
    pub fn resize(&self, size: TerminalSize) -> Result<()> {
        self.master
            .lock()
            .map_err(|_| anyhow!("PTY master lock is poisoned"))?
            .resize(size.into())
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    use super::{CommandSpec, PtyInput, TerminalSize};

    struct SharedSink(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedSink {
        fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
            self.0
                .lock()
                .expect("test sink lock should be valid")
                .extend(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn terminal_size_defaults_to_no_pixel_dimensions() {
        let size = TerminalSize::new(24, 80);

        assert_eq!(size.rows, 24);
        assert_eq!(size.cols, 80);
        assert_eq!(size.pixel_width, 0);
        assert_eq!(size.pixel_height, 0);
    }

    #[test]
    fn command_spec_preserves_program_arguments_and_directory() {
        let command = CommandSpec::new("bash")
            .arg("-i")
            .current_dir("/tmp/project");

        assert_eq!(command.program(), "bash");
        assert_eq!(command.args(), ["-i"]);
        assert_eq!(command.working_directory(), Some(Path::new("/tmp/project")));
    }

    #[test]
    fn cloned_pty_inputs_share_one_writer() {
        let bytes = Arc::new(Mutex::new(Vec::new()));
        let mut first = PtyInput::new(Box::new(SharedSink(Arc::clone(&bytes))));
        let mut second = first.clone();

        first.write_all(b"one").expect("first write should succeed");
        second
            .write_all(b"two")
            .expect("second write should succeed");

        assert_eq!(
            *bytes.lock().expect("test sink lock should be valid"),
            b"onetwo"
        );
    }
}
