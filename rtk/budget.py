"""Per-task token budget with a hard kill switch.

A task gets a soft budget. Calls that would push spend over the budget are
refused (BudgetExceeded). An absolute ceiling at `kill_multiple` x budget is the
runaway backstop. Pure in-memory and synchronous — trivially unit-testable.
"""

from __future__ import annotations


class BudgetExceeded(RuntimeError):
    """Raised when a charge would breach the task ceiling."""


class Budget:
    def __init__(self, task_id: str, limit: int = 100_000, kill_multiple: float = 3.0):
        self.task_id = task_id
        self.limit = int(limit)
        self.ceiling = int(limit * kill_multiple)
        self.spent = 0

    def remaining(self) -> int:
        return max(0, self.limit - self.spent)

    def would_exceed(self, tokens: int) -> bool:
        """True if charging `tokens` would cross the soft budget."""
        return self.spent + tokens > self.limit

    def check(self, tokens: int) -> None:
        """Pre-call gate. Raise only past the hard ceiling; soft budget is advisory."""
        if self.spent + tokens > self.ceiling:
            raise BudgetExceeded(
                f"{self.task_id}: charge {tokens} would breach ceiling "
                f"{self.ceiling} (spent {self.spent})"
            )

    def charge(self, tokens: int) -> int:
        """Record real spend after a call. Returns new total."""
        self.spent += max(0, int(tokens))
        return self.spent
