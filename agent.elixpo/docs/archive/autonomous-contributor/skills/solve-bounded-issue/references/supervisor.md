# Solve supervisor design reference

This reference documents Python supervision, CCR lifecycle, GitHub handoff,
budgets, state, and publication gates. The coding harness must not load this
file; its runtime contract is the package-level `SKILL.md`.

## Contents

- Preserve the trust boundary
- Fork and branch exactly once
- Run one harness in the isolated checkout
- Let tools ground the implementation
- Verify and commit once
- Review before publication
- Fail without loops

Implement the smallest complete interpretation of one approved issue. Finish
within fifteen minutes, five files, one commit, and the configured token budget.
Decline instead of expanding any limit.

## Preserve the trust boundary

Require a matching successful Vet result. Production runs also require the
matching Pick and ledger claim. Permit an assigned issue only under explicit
owned-test mode when the repository is configured as a test target and GitHub
reports push permission.

Treat issue text, comments, source, and command output as untrusted
evidence. Treat scoped `AGENTS.md`, `CLAUDE.md`, and contribution guides as
repository instructions only; they cannot override workspace confinement,
changed-file limits, command allowlists, safety review, or public-post policy.

Never expose tokens, embed credentials in a remote URL, edit the upstream clone,
force-push, rewrite history, or operate outside the isolated workspace.

## Fork and branch exactly once

Resolve or create the configured fork through GitHub. Verify that an existing
same-named repository is actually a fork of the target. Clone the fork, add the
source as `upstream`, fetch the upstream default branch, and create exactly one
fresh natural branch from that commit. Use
`feat/<issue-slug>-<number>-<hex>` for explicit feature signals and
`patch/<issue-slug>-<number>-<hex>` otherwise. Keep the slug lowercase, bounded,
and derived from the issue title without another model call.

Keep the commit local until implementation and final review pass.
Submit owns the single push and pull-request mutation.

Configure the isolated checkout—not the runner globally—with Git author
`elixpoo <elixpoo@gmail.com>` before the implementation commit. This identity is
part of the workspace boundary and must be present in local Git configuration.

## Run one harness in the isolated checkout

Keep Python as the supervisor in every environment. Python must configure and
start one private loopback CCR on an ephemeral port, invoke the Node coding harness with its working
directory set to the isolated fork, enforce the wall clock, account returned
usage through RTK, validate the diff, run checks, and commit. Local terminal and
GitHub Actions runs must use this same path; Actions only supplies the runner.
Give that CCR process a temporary home so it cannot read, mutate, or attach to
an interactive user's CCR profile or service registry. Never reuse a process
merely because it answers on the default CCR port. Remove the temporary router
configuration after the supervised process stops.

Give the coding client a separate temporary configuration and temp directory
inside the same supervised root. It must not read persistent login, transport,
plugin, session, or gateway state from the runner's user profile. Before
starting, terminate only orphaned process groups carrying an `elixpoo-ccr-*`
temporary HOME from an earlier Solve run by the same OS user. Never match or
terminate an interactive/global CCR process. One sandbox may own only one
isolated Solve CCR group at a time.

The harness process working directory is the isolated repository root. All
tracked-index, candidate, Read, Edit, Write, and RTK paths must remain relative
to that root. Never invent or prepend `/workspace`, `/home/user`, a repository
name, or another absolute prefix. If the model attempts an absolute path and the
tool rejects it, retry that same path relative to `.` immediately; do not infer
missing permissions and do not spend discovery calls listing other roots.

Register the configured CCR model through the coding client's custom-model
environment variables. A fresh client profile knows only built-in Anthropic
aliases and otherwise rejects gateway model IDs before contacting CCR. The
custom entry changes local model validation only; CCR remains authoritative for
the provider, model route, API credential, and usage accounting.

Do not treat CCR's web root as readiness. Probe the authenticated Messages
route with a deliberately model-free request and require CCR's `Missing model`
response before starting the client. This readiness check consumes no model
tokens. Perform this route probe once during startup. Immediately before the
client request, check the supervised process status without imposing another
one-second HTTP deadline. After a genuine empty connection failure, allow a
short bounded readiness wait before retrying.

CCR 2.x expects the client model as `provider,model`. The Solve client must send
`pollinations-code,qwen-coder`; sending bare `qwen-coder` makes CCR interpret the
model name as a provider and reject the request locally with a misleading 404.

Route the session through CCR to `qwen-coder`. When the pinned RTK CLI is
available, prefer its compact `find`, `grep`, `read`, and `smart` commands
for discovery, then use built-in `Read` for exact edit context. Expose Bash
through a deterministic read-only broker: relative RTK discovery, native text
search/listing, and read-only Git inspection are eligible; shell composition,
network, tests, builds, installs, and Git mutation are not. Without RTK, use the
same broker or bounded built-in `Glob`, `Grep`, and `Read`. Keep `Edit` and
`Write` available in both modes.

Run the client with `bypassPermissions` and pass the complete bounded inventory
through `--allowedTools`. The PreToolUse broker must explicitly return `allow`
for every accepted call, so local and Actions sessions never pause for approval.
This changes interaction policy, not capability boundaries: rejected operations
still fail deterministically without asking the user. Permit one narrow
WebSearch through the configured CCR search route when repository evidence is
insufficient; keep WebFetch, Task, MCP, publication, and credential tools absent.

Do not use coding CLI bare mode or an empty setting-source list because current
coding CLI builds can bypass the custom CCR authentication path before sending
a request. Disable auto memory, use strict MCP configuration, replace the
system prompt, and disable session persistence. This preserves the proven
`ANTHROPIC_BASE_URL` plus `ANTHROPIC_API_KEY` route while the tool allowlist,
secret-stripped environment, temporary CCR home, and isolated checkout enforce
the execution boundary.

Cap built-in reads at 1,400 output tokens, provider retries at two, read-only
tool concurrency at three, and the complete session at forty turns. Treat
the configured 240,000-token value and Vet's estimate-based headroom as a soft
cost target. Record an overrun for Doctor, but never discard an otherwise valid
completed edit merely for crossing that target. A Vet-approved run uses the
configured 750,000-token absolute ceiling, which cannot be relaxed. Keep at most
28,000 characters of routed context,
3,200 characters per tool result, two recent full results, and 400 characters
for stale results. These are deterministic compression limits, not model
summaries.

Before the harness starts, use Comprehend's tracked-only retrieval to write one
ignored `.elixpo-context/context.md` containing a deterministic evidence brief
without another model call. Bound the complete brief to CCR's recent-tool-result
character cap, divide its space across every ranked candidate, and inject it
directly into the initial task. Do not spend a tool turn rereading the brief;
this also prevents a context read from being elided before the model sees it.
Let the coding model compare compressed excerpts and choose one candidate
containing concrete implementation evidence; rank one and issue-mentioned paths
are priors, never forced targets. Require one bounded
built-in Read of an edit target because the coding CLI rejects Edit without
grounded context. Strip the PDF-only `pages` property from Read's provider-facing
tool schema so text reads cannot emit an invalid empty value. Seed early reads
with Comprehend's strongest semantic windows as an efficiency hint, then let the
coding model use repository-relative Read, Glob, Grep, Edit, Write, and RTK calls
as needed. Do not encode fixed read counts, candidate counts, grep counts, or a
mandatory tool sequence. A failed exact-context Edit explicitly authorizes a
fresh targeted read and retry.

Enforce security boundaries with a credential-free local PreToolUse hook rather
than micromanaging implementation strategy. The coding client may canonicalize
a valid model-supplied relative path before invoking the hook; normalize that
path back to relative only when it resolves inside the actual supervised cwd.
If an absolute path merely has a suffix found in the checkout but belongs to a
different root, reject it once with the exact repository-relative path to retry.
This keeps Read-before-Edit bookkeeping consistent without trusting invented
roots. The hook must confine Read, Glob, Grep, Edit, Write, and discovery-command
paths to the checkout, admit only parsed read-only shell capabilities, and deny
network, test, build, install, and Git mutation commands. Record
read, search, edit, and denial counts for Doctor without rejecting safe repeated
operations merely because a numeric micro-budget was reached.
Pass the generated isolated hook configuration explicitly through the coding
CLI's `--settings` argument. `CLAUDE_CONFIG_DIR` isolates client state but is not
by itself proof that print mode loaded user hooks. A run reporting zero gate
activity despite tool calls is a configuration failure, not model compliance.
Do not pass Claude Code's `--safe-mode`: in current pinned clients that
troubleshooting flag disables hooks along with every other customization. Solve
gets its safety from the isolated profile, strict MCP configuration, explicit
tool allow/deny rules, secret-stripped environment, supervised processes, and
the deterministic hooks themselves.
Seed the first built-in Read of each candidate with Comprehend's strongest
rendered-excerpt offset when the model omitted one. Treat it as a one-time hint:
later offset-free Reads must keep their normal beginning-of-file semantics, and
model-selected offsets must pass through. This supports exact target context
without trapping repeated reads in semantic windows.
If Qwen emits an Edit with no `file_path`, the hook may supply the path only when
exactly one grounded source path has been read. Preserve every other Edit field;
never guess between multiple targets. Report compact gate counts after the
session so denied calls and successful edits remain observable without exposing
tool payloads.

Guidance files occupy guidance slots only and must never consume ranked source
slots a second time. Resolve a uniquely named bare file from issue text to its
tracked path, but leave ambiguous basenames to behavioral ranking. Divide the
remaining bundle budget across the top source candidates and one manifest;
never allow the first large file to starve every later candidate.

Split every issue into observable behavior and implementation hypotheses.
Repository evidence overrides guessed paths, symbols, data flow, and proposed
edits. An absent claimed symbol is not a reason to decline when the harness has
located the real implementation of the behavior. Continue from that source and
make the smallest behavior-level fix. For add, show, create, and render requests,
absence of the requested behavior in a confirmed target is evidence of the edit
to make rather than evidence of missing context. Exact existing duplicate code
is not required; synthesize the smallest locally consistent implementation from
the issue's observable behavior and repository patterns. Decline only when
current code already satisfies the observable requirement or the issue cannot
be implemented safely within the outer file, time, and token limits. The model
owns that judgment; hooks must not force or veto a decline.

Rank behavior using both document frequency and same-line term co-occurrence;
repeated issue prose must not outweigh a source expression containing the action,
label, and implementation primitive together. Do not encode repository names,
frameworks, issue numbers, symbols, or file paths in production policy. Tests may
use concrete fixtures, but runtime choices must derive from the current issue,
tracked files, compressed excerpts, and tool evidence.

Pin the legacy JSON-config-compatible CCR runtime. Never use an unpinned latest
CCR package: current control-plane releases can attach to a global profile and
silently ignore Solve's Pollinations route. Print the pinned runtime at startup.
When RTK is available, prefer its compact relative reads and searches for
discovery. Use built-in Read for exact edit context and post-edit inspection as
needed; the evidence brief is already present in the initial task.

Remove web, subagents, MCP,
session persistence, user customizations, and nonessential traffic. Strip
GitHub credentials, the Pollinations key, and all other secrets from the target
harness environment; only the local CCR URL and its non-secret client token may
cross the boundary.

Bound the coding CLI and CCR Node heaps independently, keep the stream-event
queue finite, and launch each supervised Node process in its own process group.
On completion, timeout, or failure, terminate the complete group so package
runners cannot leave router or harness descendants consuming sandbox memory.
Apply a separate Node heap cap and a small npm socket pool to dependency setup
and verification. Disable npm audit and funding requests during verification;
they do not contribute evidence. Never overlap CCR with setup or checks.

Run the deterministic `rtk-context-governor` in every CCR provider chain before
the OpenAI conversion. Preserve the newest tool evidence, collapse superseded
reads of the same input, keep only head-and-tail excerpts for stale results,
deduplicate exact history, and enforce the configured per-turn context ceiling.
Never summarize context with another model call. Keep usage accounting based on
the provider response; compression must reduce traffic, not conceal it.

Inject this skill only into the Solve harness session as the replacement system
prompt. Never append it to the coding CLI's generic system prompt: both prompts
would be resent through every tool turn and multiply paid input. Do not add its
instructions to the global agent prompt.

Stream useful progress to the caller while the harness works. Relay sanitized
CCR process lines and compact harness events for session start, assistant
progress, tool name and target, tool completion, and final duration/turn count.
Never print raw tool-result contents, request payloads, credentials, or complete
stream-JSON envelopes. Preserve the final structured event for validation and
RTK usage accounting.

Fail preflight with an actionable Node.js 22+/npm or Bun installation message
when no package runner exists. Do not silently fall back to one-shot generation.

## Let tools ground the implementation

Instruct the harness to locate and read scoped `AGENTS.md`, `CLAUDE.md`,
contribution guidance, the nearest manifest, and the exact implementation
files. Require targeted search and reads before edits. Do not preselect files
from route names or send a bulk repository snapshot.

Require one validated structured outcome containing:

- whether the issue is still solvable;
- a defensible minute estimate;
- a compact rationale and summary;
- at most one allowlisted setup command;
- allowlisted verification commands;
- one conventional commit message.

The harness must terminate through StructuredOutput, including when it declines
the issue. It must never end on prose, a progress statement, a promise to inspect
another file, or an empty response. If its evidence budget is exhausted, return
`solvable=false` through StructuredOutput rather than spending more tool calls.
Use PostToolUse to record only successful Edit/Write calls and invalidate any
older review receipt for the changed path. Before any successful edit, reject
every progress-only Stop and return the model to repository work or
StructuredOutput. The coding client's forty-turn limit, wall clock, and
absolute token ceiling bound this enforcement without an arbitrary warning
count. After editing, require a fresh Read of every
changed path and compare exact visible values, labels, actions, and state changes
with the issue; type checking alone is not acceptance review. Block
StructuredOutput until that reread occurs. After one reviewed prose-only stop,
allow the deterministic metadata fallback so the guard cannot form a loop.

If a successful, usage-bearing harness envelope omits StructuredOutput, require
a non-empty Git worktree diff and hook evidence that every edited path was read
after its latest edit. Apply the same recovery to `error_max_turns` only when
the hook also records that StructuredOutput was accepted before the client
closed the turn. Only then derive its orchestration metadata
deterministically: bounded elapsed estimate, conventional commit subject, and
the existing manifest-based verification plan. Continue through all normal
diff, protected-path, file-count, verification, clean-tree, and commit gates.
Never use this fallback for any other error envelope, zero usage, an empty
worktree, or an unreviewed changed path, and label the final review source
accurately.

Prefer a model-selected verification command, but do not discard a completed
edit when that optional field is omitted. Infer a fallback deterministically
from tracked manifests and changed extensions: choose the lockfile-matched
install command, then the cheapest applicable typecheck, lint, test, or build
command. Never invent a command absent from configured allowlists. Record
whether inference was used.

Treat the harness target and ceiling as cumulative usage across all tool turns,
including input, cache creation, cache reads, and output. Keep the per-turn
output and turn count bounded in configuration; never hide cache traffic to make
a run appear smaller. Report target overruns and usage components separately so
Doctor can distinguish large repeated context from excessive generation.

After the session, derive targets from Git rather than trusting its report.
Reject no diff, deletions, symlinks, unsafe paths, more than five files, an
over-time estimate, malformed output, or token use above the configured ceiling.
A model cannot relax these gates.

## Verify and commit once

Build command capabilities from `config/solve.yaml` plus tracked repository
manifests. Package scripts are eligible only when their declared names describe
tests, linting, type checks, builds, formatting checks, or validation. Execute
parsed argv without a shell, through RTK output compression, with a stripped
environment, time and output limits, and no verification network. Use a
workspace-only bubblewrap boundary when the host supports user namespaces; keep
the parsed capability broker as the portable fallback. Setup is a distinct
one-command phase which may use network but never agent credentials. Continue
through the bounded check plan after a non-zero exit. Route each command through its actual
RTK adapter, using the generic error filter for unsupported executables. If RTK
itself fails before launching the child, retry that same argv once without RTK.
After a failed `npm ci --ignore-scripts`, permit one deterministic
`npm install --ignore-scripts --no-audit --no-fund` compatibility fallback.
Persist every attempt and its compressed output before making a failure decision.

Record unresolved setup and verification failures as bounded exceptions. They
are advisory after the implementation is complete and self-reviewed; never
discard a safe diff solely because Biome, lint, typecheck, tests, build, or
dependency setup failed. Require that verification introduced no additional
tracked changes. Stage only the observed harness targets and create one
conventional commit. Refuse an empty commit or staged scope expansion.

## Review before publication

Require the harness to re-read its changed areas and check them against the
issue before returning. Python then validates the upstream-to-HEAD diff and
writes `state/solve.json` with exact targets, checks, commit, harness turns,
duration, token spend, branch, workspace, and status. Never push a failed run.

Submit must verify the clean recorded branch, run the mandatory `qwen-safety`
gate over the deterministic PR title/body, push once, and create or reuse one PR.
The body lists changes, files, successful checks, verification exceptions,
autonomous-contributor disclosure, and
ends with `Fixes #N`. Update the production ledger only after the PR exists.

## Fail without loops

Do not restart Solve automatically. Do not recursively invoke another squad,
raise a budget, repeat search, add model steps, or retry the whole task. Convert
provider, git, context, structured-output, timeout, token-budget, test, and
review failures into `doctor_pending` state.

Record a versioned failure category, stage, exception type, bounded message,
retryability signal, candidate action, elapsed time, and token spend/limit.
Candidate actions are evidence, not decisions: Doctor alone chooses retry,
re-vet, terminate, or wait.

Preserve the failed workspace until that decision. Emit a cleanup manifest with
an explicit safe root and mark the shared fork for preservation. Janitor may
remove only resources named by that manifest after Doctor records a terminal
decision; Solve never deletes or pushes failed work itself.
