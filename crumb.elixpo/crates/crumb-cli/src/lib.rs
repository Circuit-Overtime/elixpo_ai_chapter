//! Startup lifecycle for the `crumb` executable.

use std::io::{self, BufRead, Write};

use crumb_platform::Platform;
use crumb_repl::ReplOutcome;

/// Starts crumb with injectable input and output for testing.
///
/// # Errors
///
/// Returns an error when the REPL cannot read its environment or perform
/// terminal input/output.
pub fn run<R: BufRead, W: Write>(reader: R, writer: W) -> io::Result<ReplOutcome> {
    crumb_repl::run(
        reader,
        writer,
        Platform::current(),
        env!("CARGO_PKG_VERSION"),
    )
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    #[test]
    fn application_exits_cleanly() {
        let mut output = Vec::new();

        let outcome =
            super::run(Cursor::new("/exit\n"), &mut output).expect("application should exit");

        assert_eq!(outcome, crumb_repl::ReplOutcome::Exit);
        assert!(
            String::from_utf8(output)
                .expect("output should be UTF-8")
                .starts_with("crumb:")
        );
    }
}
