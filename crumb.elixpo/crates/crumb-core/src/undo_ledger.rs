//! Session-scoped, in-memory record of state-changing shell commands, so a
//! later turn can answer "what did I just do" / "undo that" without
//! re-parsing raw session-journal digests (which are one-way hashes and
//! cannot be reversed back into command text by design).
//!
//! This is deliberately **not** persisted across process restarts -- that
//! is the separate, opt-in `cross-session-memory` skill's job. This module
//! performs no I/O and holds nothing beyond the current process's memory.

use std::collections::VecDeque;
use std::num::NonZeroUsize;

use crate::dry_run::{BlastRadiusAssessment, assess_shell_command};
use crate::secrets::redact_sensitive_text;

/// One recorded state-changing command.
#[derive(Clone, Debug, PartialEq)]
pub struct LedgerEntry {
    /// Monotonically increasing within one `UndoLedger` instance. Not reset
    /// when older entries are evicted, so it stays a stable reference even
    /// after eviction.
    pub sequence: u64,
    pub command: String,
    pub assessment: BlastRadiusAssessment,
}

/// Bounded, session-scoped ledger of state-changing commands. Only commands
/// [`assess_shell_command`] classifies as destructive are recorded -- a
/// plain `ls` or `git status` never takes a slot.
#[derive(Debug)]
pub struct UndoLedger {
    entries: VecDeque<LedgerEntry>,
    capacity: NonZeroUsize,
    next_sequence: u64,
}

impl UndoLedger {
    #[must_use]
    pub fn new(capacity: NonZeroUsize) -> Self {
        Self {
            entries: VecDeque::with_capacity(capacity.get()),
            capacity,
            next_sequence: 0,
        }
    }

    /// Classifies `command` and records it if it is state-changing.
    /// Returns the recorded entry, or `None` if the command was not
    /// state-changing and so was not recorded.
    ///
    /// When the ledger is at capacity, the oldest entry is evicted first.
    pub fn record(&mut self, command: &str) -> Option<&LedgerEntry> {
        let assessment = assess_shell_command(command);
        if !assessment.is_destructive() {
            return None;
        }
        if self.entries.len() == self.capacity.get() {
            self.entries.pop_front();
        }
        let entry = LedgerEntry {
            sequence: self.next_sequence,
            command: redact_sensitive_text(command).0.trim_end().to_owned(),
            assessment,
        };
        self.next_sequence += 1;
        self.entries.push_back(entry);
        self.entries.back()
    }

    /// The most recently recorded entry, if any -- the natural target of an
    /// "undo that" request.
    #[must_use]
    pub fn most_recent(&self) -> Option<&LedgerEntry> {
        self.entries.back()
    }

    /// Up to `count` most recent entries, newest first.
    pub fn recent(&self, count: usize) -> impl Iterator<Item = &LedgerEntry> {
        self.entries.iter().rev().take(count)
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use std::num::NonZeroUsize;

    use super::UndoLedger;

    fn ledger(capacity: usize) -> UndoLedger {
        UndoLedger::new(NonZeroUsize::new(capacity).expect("test capacity is nonzero"))
    }

    #[test]
    fn destructive_command_is_recorded() {
        let mut ledger = ledger(10);
        let recorded = ledger.record("rm -rf ./build");
        assert!(recorded.is_some());
        assert_eq!(ledger.len(), 1);
        assert_eq!(ledger.most_recent().unwrap().command, "rm -rf ./build");
    }

    #[test]
    fn non_destructive_command_is_not_recorded() {
        let mut ledger = ledger(10);
        let recorded = ledger.record("git status");
        assert!(recorded.is_none());
        assert!(ledger.is_empty());
        assert_eq!(ledger.most_recent(), None);
    }

    #[test]
    fn destructive_commands_are_redacted_before_retention() {
        let mut ledger = ledger(10);
        let token = ["ghp_", "A1b2C3d4E5f6G7h8I9j0"].concat();
        ledger.record(&format!("rm -rf build # {token}"));

        let retained = &ledger.most_recent().unwrap().command;
        assert!(!retained.contains(&token));
        assert!(retained.contains("[sensitive output redacted]"));
    }

    #[test]
    fn mixed_stream_only_keeps_destructive_entries() {
        let mut ledger = ledger(10);
        ledger.record("ls -la");
        ledger.record("rm -rf ./build");
        ledger.record("cat README.md");
        ledger.record("git push --force origin main");
        assert_eq!(ledger.len(), 2);
        let commands: Vec<&str> = ledger
            .recent(10)
            .map(|entry| entry.command.as_str())
            .collect();
        assert_eq!(
            commands,
            vec!["git push --force origin main", "rm -rf ./build"]
        );
    }

    #[test]
    fn capacity_evicts_oldest_first() {
        let mut ledger = ledger(2);
        ledger.record("rm -rf a");
        ledger.record("rm -rf b");
        ledger.record("rm -rf c");
        assert_eq!(ledger.len(), 2);
        let commands: Vec<&str> = ledger
            .recent(10)
            .map(|entry| entry.command.as_str())
            .collect();
        assert_eq!(commands, vec!["rm -rf c", "rm -rf b"]);
    }

    #[test]
    fn sequence_numbers_are_monotonic_even_across_eviction() {
        let mut ledger = ledger(1);
        let first_sequence = ledger.record("rm -rf a").unwrap().sequence;
        let second_sequence = ledger.record("rm -rf b").unwrap().sequence;
        assert!(second_sequence > first_sequence);
    }

    #[test]
    fn recent_respects_requested_count() {
        let mut ledger = ledger(10);
        ledger.record("rm -rf a");
        ledger.record("rm -rf b");
        ledger.record("rm -rf c");
        let commands: Vec<&str> = ledger
            .recent(2)
            .map(|entry| entry.command.as_str())
            .collect();
        assert_eq!(commands, vec!["rm -rf c", "rm -rf b"]);
    }

    #[test]
    fn empty_ledger_reports_correctly() {
        let ledger = ledger(5);
        assert!(ledger.is_empty());
        assert_eq!(ledger.len(), 0);
        assert_eq!(ledger.recent(5).count(), 0);
    }
}
