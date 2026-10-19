# Local background jobs

Background work is opt-in and separate from Crumb's interactive shell PTY. The
ledger is opened only by an explicit `/jobs` or `crumb jobs` action, so missing
state, credentials, a scheduler, or network never affects terminal startup or
native commands.

## Commands

- `/jobs create <request>` records an immediate job and starts an isolated local
  worker.
- While an agent turn is active, type `/background` at the steering prompt to
  transfer that exact running turn into the local job ledger. The prompt is not
  submitted again, and Ctrl+C returns to foreground-only cancellation.
- `/jobs list` and `/jobs inspect <id>` show redacted metadata only.
- `/jobs cancel <id>` updates the ledger; the worker observes it and triggers
  the same cancellation token used by foreground Harness turns and tools.
- `/jobs reattach <id>` resumes the redacted session after the worker finishes.
- `/jobs schedule once <run_at_ms> <request>` explicitly opts into one run.
- `/jobs schedule recurring <seconds> <next_ms> <request>` explicitly opts into
  a recurring local run.
- `/jobs tick` or `crumb jobs tick` starts due opted-in schedules. Crumb does not
  install a daemon, cron entry, or login service automatically.

For automation, `crumb jobs list` emits prompt-free JSON and `crumb jobs run
<id>` claims exactly one due job.

## Safety boundary

Each definition snapshots the foreground `AgentConfig`, including model,
effort, permissions, limits, workspace, and optimizer selection. Provider keys
remain in the operating-system credential store or worker environment and are
never written to definitions. Credential-like requests are refused before the
job directory is created. Summaries and debug output include only request size
and SHA-256 digest; failures persist only an error digest.

State changes use a per-job lock and atomic manifest replacement. A recurring
job is requeued only after success. Cancellation never targets an unverified PID
directly; the owning worker converts the ledger request into its in-process
cancellation token.
