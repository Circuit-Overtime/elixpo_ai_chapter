//! Bounded, in-memory follow-up steering for active agent turns.

use std::collections::VecDeque;

use anyhow::{Result, bail};

/// User-selected update behavior for an active turn's follow-up queue.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SteeringAction {
    Steer,
    Queue,
    Replace,
}

/// In-memory steering queue. Its contents are deliberately neither persisted
/// nor exposed through `Debug`.
pub struct SteeringQueue {
    messages: VecDeque<String>,
    bytes: usize,
    max_messages: usize,
    max_bytes: usize,
}

impl SteeringQueue {
    /// Creates a queue with caller-owned hard limits.
    ///
    /// # Errors
    ///
    /// Returns an error when either limit is zero.
    pub fn new(max_messages: usize, max_bytes: usize) -> Result<Self> {
        if max_messages == 0 || max_bytes == 0 {
            bail!("steering queue limits must be positive");
        }
        Ok(Self {
            messages: VecDeque::new(),
            bytes: 0,
            max_messages,
            max_bytes,
        })
    }

    /// Applies a queue or replace operation without persisting message text.
    ///
    /// # Errors
    ///
    /// Returns an error for empty input or when the configured limit would be
    /// exceeded. A rejected operation leaves the queue unchanged.
    pub fn submit(&mut self, action: SteeringAction, message: &str) -> Result<()> {
        let message = message.trim();
        if message.is_empty() {
            bail!("steering message cannot be empty");
        }
        if message.len() > self.max_bytes {
            bail!("steering message exceeds the queue byte limit");
        }
        let (next_messages, next_bytes) = match action {
            SteeringAction::Steer | SteeringAction::Queue => (
                self.messages.len().saturating_add(1),
                self.bytes.saturating_add(message.len()),
            ),
            SteeringAction::Replace => (1, message.len()),
        };
        if next_messages > self.max_messages || next_bytes > self.max_bytes {
            bail!("steering queue limit reached");
        }
        if action == SteeringAction::Replace {
            self.messages.clear();
            self.bytes = 0;
        }
        if action == SteeringAction::Steer {
            self.messages.push_front(message.to_owned());
        } else {
            self.messages.push_back(message.to_owned());
        }
        self.bytes += message.len();
        Ok(())
    }

    #[must_use]
    pub fn pop(&mut self) -> Option<String> {
        let message = self.messages.pop_front()?;
        self.bytes = self.bytes.saturating_sub(message.len());
        Some(message)
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.messages.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }

    pub fn clear(&mut self) {
        self.messages.clear();
        self.bytes = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::{SteeringAction, SteeringQueue};

    #[test]
    fn queue_preserves_order_within_limits() {
        let mut queue = SteeringQueue::new(2, 16).expect("valid limits");
        queue
            .submit(SteeringAction::Queue, "first")
            .expect("first message queues");
        queue
            .submit(SteeringAction::Queue, "second")
            .expect("second message queues");
        assert_eq!(queue.pop().as_deref(), Some("first"));
        assert_eq!(queue.pop().as_deref(), Some("second"));
    }

    #[test]
    fn replace_discards_pending_messages() {
        let mut queue = SteeringQueue::new(2, 16).expect("valid limits");
        queue
            .submit(SteeringAction::Queue, "first")
            .expect("message queues");
        queue
            .submit(SteeringAction::Replace, "new")
            .expect("message replaces queue");
        assert_eq!(queue.len(), 1);
        assert_eq!(queue.pop().as_deref(), Some("new"));
    }

    #[test]
    fn steer_runs_before_queued_follow_ups() {
        let mut queue = SteeringQueue::new(3, 32).expect("valid limits");
        queue
            .submit(SteeringAction::Queue, "later")
            .expect("follow-up queues");
        queue
            .submit(SteeringAction::Steer, "now")
            .expect("steering message queues first");

        assert_eq!(queue.pop().as_deref(), Some("now"));
        assert_eq!(queue.pop().as_deref(), Some("later"));
    }

    #[test]
    fn rejected_submit_does_not_mutate_the_queue() {
        let mut queue = SteeringQueue::new(1, 8).expect("valid limits");
        queue
            .submit(SteeringAction::Queue, "kept")
            .expect("message queues");
        assert!(queue.submit(SteeringAction::Queue, "extra").is_err());
        assert_eq!(queue.pop().as_deref(), Some("kept"));
    }
}
