# AI-Native Cross-Platform Shell
## Master Architecture, Product Specification, and Agent Implementation Plan

> **Status:** Active architecture baseline; the settled direction is documented in [`direction.md`](direction.md)  
> **Primary implementation language:** Rust  
> **Underlying shell:** Bash on Linux, Zsh on macOS, PowerShell on Windows  
> **Primary AI provider:** Pollinations AI via BYOK/BYOP  
> **Primary agent harness:** Crumb's native Rust harness  
> **Optional compatibility harness:** DeepSeek Harness behind a replaceable adapter  
> **Token optimization:** Native filters + optional Rust Token Killer integration  
> **Product name:** Crumb

---

# 1. Product Vision

`<shellname>` is a lightweight, cross-platform, AI-native terminal environment.

It is **not intended to replace Bash, Zsh, or PowerShell as shell languages**.

Instead, `<shellname>` becomes the intelligent interactive layer that sits above the user's native shell.

The native shell remains responsible for:

- shell grammar
- pipelines
- redirects
- aliases
- shell functions
- environment variables
- shell scripts
- command substitutions
- job semantics
- OS-native command compatibility

`<shellname>` is responsible for:

- terminal UI
- prompt rendering
- command history
- autocomplete
- inline suggestions
- AI chat
- agentic workflows
- memory
- tool execution policy
- sandbox management
- project context
- session persistence
- token optimization
- model/provider integration
- permission handling
- AI-generated actions

The core principle is:

> **A normal terminal must remain a normal terminal. AI should enhance it, not replace it.**

If AI is disabled, the internet is unavailable, Pollinations is unreachable, or no API key exists, the terminal must still function as a fast normal shell environment.

---

# 2. Platform Shell Model

The default shell underlay is fixed by operating system:

| Platform | Default shell underlay |
|---|---|
| Linux | Bash |
| macOS | Zsh |
| Windows | PowerShell |

The architecture should allow future custom shell backends, but these three are the supported defaults.

Examples:

```text
Linux
<shellname>
    ↓
persistent PTY
    ↓
bash
    ↓
Linux OS
```

```text
macOS
<shellname>
    ↓
persistent PTY
    ↓
zsh
    ↓
macOS
```

```text
Windows
<shellname>
    ↓
persistent ConPTY
    ↓
pwsh / PowerShell
    ↓
Windows
```

---

# 3. The Most Important Architectural Decision

## Use a persistent native shell process

Do **not** run a fresh command such as:

```bash
bash -c "..."
```

for every user command.

That would lose persistent shell state such as:

```bash
cd projects
export API_URL=http://localhost:3000
alias gs="git status"
source .env
```

Instead, `<shellname>` should launch a **persistent Bash/Zsh/PowerShell process attached through a PTY**.

The lifecycle becomes:

```text
<shellname> starts
      │
      ▼
detect operating system
      │
      ▼
start native shell
      │
      ▼
connect through PTY
      │
      ▼
keep process alive for entire session
```

This preserves:

- current working directory
- environment mutations
- aliases
- shell functions
- shell-local variables
- activated virtual environments
- sourced scripts
- interactive programs
- shell options
- PowerShell session state

The Rust application therefore behaves like an intelligent terminal frontend around a persistent shell process.

---

# 4. System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         <shellname>                              │
│                                                                 │
│  Prompt • History • Inline Suggestions • ASCII UI • Shortcuts   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                     Input Classification
                             │
          ┌──────────────────┼─────────────────────┐
          │                  │                     │
          ▼                  ▼                     ▼
     Native command       AI question          Agent task
          │                  │                     │
          │                  │                     ▼
          │                  │              Agent Controller
          │                  │                     │
          │                  ▼                     ▼
          │             LLM Provider         Context Builder
          │                  │                     │
          │                  │               Memory / Files
          │                  │                     │
          │                  └──────────┬──────────┘
          │                             │
          │                       Tool Registry
          │                             │
          │                     Permission Engine
          │                             │
          ▼                             ▼
   Persistent PTY ◄──────────── Agent shell tools
          │
 ┌────────┼─────────┐
 │        │         │
 ▼        ▼         ▼
bash     zsh      pwsh
Linux   macOS    Windows
```

---

# 5. Input Modes

The terminal should provide four primary input paths.

## 5.1 Native shell input

Everything that does not match a `<shellname>` control prefix is passed directly to the persistent native shell.

Examples:

```bash
git status
cargo test
npm run dev
docker compose up
python app.py
ps aux | grep node
```

PowerShell example:

```powershell
Get-Process | Where-Object CPU -gt 10
```

No AI is involved.

---

## 5.2 Built-in terminal commands

Reserved namespace:

```text
/
```

Examples:

```text
/help
/session list
/memory show
/model list
/auth status
/tools
/permissions
/sandbox new
/cost
/doctor
```

These execute inside the Rust process.

---

## 5.3 AI question mode

Natural-language questions require no prefix.

Example:

```text
explain the last command error
what does this Docker command do
summarize this git diff
```

This calls the configured AI provider but does not automatically execute agent tools unless explicitly requested.

---

## 5.4 Agent mode

Natural-language tasks use the same deterministic routing path without a
special character.

Examples:

```text
inspect this repository and fix the failing tests
create an API endpoint and validate it
debug why this Rust binary crashes
optimize this Dockerfile
```

This invokes the multi-step agent runtime.

---

# 6. Product Principles

## 6.1 Terminal-first

Normal shell execution must never depend on:

- Pollinations
- DeepSeek Harness
- an internet connection
- API credentials
- embeddings
- remote services

---

## 6.2 Fast startup

The prompt should appear before any network request.

Do not initialize the AI runtime before the user actually needs it.

Do not start DeepSeek Harness during terminal startup.

---

## 6.3 Provider-neutral core

Pollinations should be the first-class default provider.

However, the Rust application should define a provider abstraction so that future providers can be added.

Possible future providers:

- local OpenAI-compatible servers
- Ollama
- LM Studio
- OpenAI-compatible gateways
- enterprise inference endpoints
- custom local inference backends

---

## 6.4 Harness-neutral agent core

DeepSeek Harness should be treated as an optional agent runtime adapter.

The shell must have enough native Rust agent functionality to work if DeepSeek Harness:

- is missing
- crashes
- changes APIs
- becomes incompatible
- cannot run on a machine

---

## 6.5 Local memory

Memory must be:

- human inspectable
- project scoped where appropriate
- removable
- editable
- versionable if the user chooses
- protected from accidental secret storage

---

## 6.6 Explicit permissions

The model never decides its own permissions.

Tool execution authorization belongs to deterministic Rust code.

---

# 7. Proposed Rust Workspace

```text
<shellname>/
├── Cargo.toml
├── crates/
│   ├── shell-cli/
│   │   └── Main executable and startup lifecycle
│   │
│   ├── shell-core/
│   │   └── Core domain types, events, traits
│   │
│   ├── shell-repl/
│   │   └── Prompt, editor, shortcuts, autocomplete
│   │
│   ├── shell-ui/
│   │   └── Terminal rendering and ASCII branding
│   │
│   ├── shell-platform/
│   │   └── OS detection and platform abstractions
│   │
│   ├── shell-pty/
│   │   └── PTY / ConPTY management
│   │
│   ├── shell-native/
│   │   └── Persistent Bash/Zsh/PowerShell integration
│   │
│   ├── shell-history/
│   │   └── Command and prompt history
│   │
│   ├── shell-config/
│   │   └── Global and project configuration
│   │
│   ├── shell-auth/
│   │   └── Credentials and OS keychain access
│   │
│   ├── shell-llm/
│   │   └── Provider-neutral model interface
│   │
│   ├── shell-pollinations/
│   │   └── Pollinations API implementation
│   │
│   ├── shell-agent/
│   │   └── Native multi-step agent loop
│   │
│   ├── shell-tools/
│   │   └── Tool schemas and guarded execution
│   │
│   ├── shell-memory/
│   │   └── MEMORY.md and structured memory
│   │
│   ├── shell-context/
│   │   └── Context assembly and budgets
│   │
│   ├── shell-token-opt/
│   │   └── Token reduction and RTK adapter
│   │
│   ├── shell-session/
│   │   └── Event logs and resumable sessions
│   │
│   ├── shell-sandbox/
│   │   └── Isolated execution environments
│   │
│   ├── shell-suggestions/
│   │   └── Local and AI completion engine
│   │
│   ├── shell-harness-dsh/
│   │   └── Optional DeepSeek Harness adapter
│   │
│   └── shell-telemetry/
│       └── Optional diagnostics
│
├── integrations/
│   └── deepseek-harness/
│
├── assets/
│   └── ascii/
│
├── docs/
│
└── tests/
```

---

# 8. Recommended Rust Dependencies

Candidates:

| Requirement | Library |
|---|---|
| Async runtime | `tokio` |
| CLI arguments | `clap` |
| Interactive line editor | `reedline` |
| Terminal control | `crossterm` |
| HTTP | `reqwest` |
| Serialization | `serde` |
| JSON | `serde_json` |
| TOML | `toml` |
| Error types | `thiserror` |
| Application error handling | `anyhow` |
| Logging | `tracing` |
| Hashing | `blake3` |
| Secrets | `keyring` |
| Async traits | `async-trait` if necessary |
| Pattern matching | `regex` |
| Fuzzy search | `nucleo` or equivalent |

PTY support should be evaluated carefully.

Possible options:

- `portable-pty`
- direct Unix PTY handling
- Windows ConPTY APIs
- platform-specific backend hidden behind a common trait

---

# 9. Persistent Native Shell Engine

The native shell should be modeled as an interface.

Example:

```rust
trait NativeShell {
    async fn start(&mut self) -> Result<()>;

    async fn send_input(
        &mut self,
        input: &str
    ) -> Result<()>;

    async fn resize(
        &mut self,
        cols: u16,
        rows: u16
    ) -> Result<()>;

    async fn interrupt(&mut self) -> Result<()>;

    async fn shutdown(&mut self) -> Result<()>;
}
```

Implementations:

```text
BashBackend
ZshBackend
PowerShellBackend
```

---

# 10. PTY Responsibilities

The PTY layer must support:

- shell stdin
- stdout
- stderr
- terminal resize
- ANSI sequences
- interactive applications
- raw terminal mode
- Ctrl+C
- Ctrl+Z where supported
- password prompts
- full-screen applications
- shell prompt synchronization
- asynchronous output

Programs that should work naturally include:

```text
vim
nano
top
htop
ssh
python
node
cargo watch
npm dev servers
git interactive commands
```

---

# 11. Prompt Synchronization

A challenge is knowing when the native shell has completed a command.

We should not guess based only on output silence.

The shell integration should inject a hidden shell hook.

Conceptually:

```text
user command
    ↓
native shell
    ↓
command executes
    ↓
shell hook emits invisible sentinel
    ↓
Rust detects sentinel
    ↓
command considered complete
```

Example internal marker:

```text
__SHELLNAME_CMD_DONE_<session-id>_<sequence-id>__
```

This marker must not be shown in normal output.

---

# 12. Shell Integration Hooks

## Bash

Use mechanisms such as:

```bash
PROMPT_COMMAND
```

or controlled shell initialization.

The integration can report:

- cwd
- exit status
- shell-ready state
- command completion

---

## Zsh

Possible integration mechanisms:

```zsh
precmd
preexec
```

---

## PowerShell

Use PowerShell profile/runtime hooks.

Potential functions:

```powershell
prompt
```

plus command lifecycle instrumentation.

The integration should not permanently modify the user's existing shell profile without permission.

Prefer runtime initialization scripts created by `<shellname>`.

---

# 13. Current Working Directory

The Rust frontend must always know the underlying shell cwd.

This matters for:

- prompt rendering
- memory workspace detection
- file tools
- Git detection
- sandbox creation
- agent context

Shell hooks should periodically synchronize cwd back into Rust.

---

# 14. Environment Variables

The native shell remains the source of truth for shell environment state.

For agent execution, Rust may need selected environment variables.

A synchronization mechanism should expose safe metadata without dumping sensitive environment values automatically.

Never automatically transmit the complete environment to an AI model.

---

# 15. Terminal UI

The UI should be visually polished but remain lightweight.

Example:

```text
╭─[ <shellname> ]─[~/projects/app]─[main +2]─[AI:deepseek]
╰─❯ cargo test
```

Agent mode:

```text
╭─[ agent • step 3 • ctx 8.4k • sandbox:local ]
╰─❯ @ fix the parser tests
```

---

# 16. ASCII Branding

On startup:

```text
 ███████╗██╗  ██╗███████╗██╗     ██╗
 ██╔════╝██║  ██║██╔════╝██║     ██║
 ███████╗███████║█████╗  ██║     ██║
 ╚════██║██╔══██║██╔══╝  ██║     ██║
 ███████║██║  ██║███████╗███████╗███████╗
 ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝
```

Actual branding will depend on final product name.

Requirements:

- compact mode
- full mode
- disabled mode
- respect `NO_COLOR`
- no expensive animation during startup

---

# 17. Inline Suggestions

Two levels of suggestions should exist.

## Level 1: local suggestions

No AI.

Sources:

- history
- executable names
- current directory files
- known aliases
- Git branches
- previous commands

These should appear nearly instantly.

---

## Level 2: AI suggestions

Optional.

Possible trigger:

- idle for 300-500 ms
- explicit shortcut
- only after enough context exists

Possible shortcut:

```text
Ctrl+Space
```

Suggested controls:

```text
Tab        accept suggestion
Alt+Right  accept next token
Esc        dismiss
Ctrl+R     history search
Ctrl+Space request AI suggestion
```

AI suggestions must never block normal typing.

---

# 18. Pollinations Provider Integration

Pollinations is the initial AI provider.

The core should define a neutral trait.

Example:

```rust
trait LlmProvider {
    async fn list_models(
        &self
    ) -> Result<Vec<ModelInfo>>;

    async fn chat_stream(
        &self,
        request: ChatRequest
    ) -> Result<ChatStream>;

    async fn embeddings(
        &self,
        request: EmbeddingRequest
    ) -> Result<EmbeddingResponse>;
}
```

Pollinations-specific code belongs only inside:

```text
shell-pollinations
```

---

# 19. Authentication

The recommended CLI experience should support:

```text
<shellname> auth login
<shellname> auth status
<shellname> auth logout
```

Preferred login flow:

```text
$ <shellname> auth login

Open the authorization URL:
https://...

Code:
ABCD-EFGH

Waiting for authorization...

✓ Authorized
✓ Credential stored securely
```

Credentials should be stored using OS credential stores where available.

Examples:

- macOS Keychain
- Windows Credential Manager
- Linux Secret Service / keyring

Also support:

```text
POLLINATIONS_API_KEY
```

for CI and advanced users.

Never store secrets in:

```text
MEMORY.md
config.toml
session logs
command history
agent transcripts
```

---

# 20. Agent Runtime

The agent runtime should have a native Rust implementation.

Basic state machine:

```text
IDLE
 ↓
USER_AGENT_REQUEST
 ↓
BUILD_CONTEXT
 ↓
MODEL_REQUEST
 ↓
MODEL_RESPONSE
 ├──────── final response ───────→ COMPLETE
 │
 └──────── tool calls
               ↓
        VALIDATE_TOOLS
               ↓
        PERMISSION_CHECK
               ↓
            EXECUTE
               ↓
        COMPRESS_OUTPUT
               ↓
          APPEND_EVENT
               ↓
         MODEL_REQUEST
```

---

# 21. Agent Limits

Every agent turn should have configurable limits.

Examples:

```text
max_steps
max_tool_calls
max_wall_time
max_context_tokens
max_output_bytes
max_shell_command_time
max_file_write_size
```

Ctrl+C must cancel the active agent.

---

# 22. Tool System

Agent tools should be Rust-owned.

Initial tools:

## Filesystem

```text
read_file
list_dir
search_files
search_text
stat_file
write_file
patch_file
mkdir
move_file
```

## Shell

```text
run_command
run_background_command
read_process_output
stop_process
```

## Git

```text
git_status
git_diff
git_log
git_branch
```

## Memory

```text
memory_read
memory_propose
memory_update
memory_forget
```

## Sandbox

```text
sandbox_create
sandbox_exec
sandbox_export
sandbox_destroy
```

---

# 23. Tool Risk Classes

Possible risk classes:

```text
ReadOnly
WriteWorkspace
ProcessExecution
NetworkAccess
SystemMutation
CredentialSensitive
Destructive
```

The permission engine evaluates risk independently of the AI.

---

# 24. Tool Approval UI

Example:

```text
Agent wants to execute:

  rm -rf target/

Directory:
  ~/project

Risk:
  WriteWorkspace

[A] Allow once
[S] Allow similar this session
[D] Deny
```

For dangerous commands, persistent blanket approval should not be available.

---

# 25. Agent Memory Filesystem

Each project can contain:

```text
.<shellname>/
```

Suggested layout:

```text
.<shellname>/
├── MEMORY.md
├── instructions.md
├── config.toml
├── permissions.toml
│
├── sessions/
│   └── <session-id>/
│       ├── meta.json
│       ├── events.jsonl
│       ├── summary.md
│       ├── todo.md
│       └── artifacts.json
│
├── memory/
│   ├── facts.jsonl
│   ├── index.json
│   └── archive/
│
├── cache/
│   ├── output/
│   └── context/
│
└── logs/
    └── agent-audit.jsonl
```

---

# 26. MEMORY.md

`MEMORY.md` is curated durable memory.

It should contain information such as:

```markdown
# Project Memory

## Architecture
- Backend is written in Rust.
- PostgreSQL is used for persistence.

## Conventions
- Use snake_case for database columns.
- All API handlers require integration tests.

## Important Commands
- `cargo test --workspace`
- `docker compose up`

## Current Decisions
- Authentication uses JWT.
- Redis is not currently required.

## Known Issues
- Windows path handling still needs investigation.
```

It should **not** contain:

- raw transcripts
- full command output
- API keys
- passwords
- private keys
- secrets
- huge source files

---

# 27. Memory Layers

Three memory scopes:

## Global memory

```text
~/.<shellname>/MEMORY.md
```

Potential contents:

- terminal preferences
- stable development preferences
- general workflow defaults

---

## Project memory

```text
<project>/.<shellname>/MEMORY.md
```

Contains project-specific context.

---

## Session memory

```text
.<shellname>/sessions/<id>/
```

Contains active task context and history.

---

# 28. Memory Commands

Examples:

```text
:memory show
:memory edit
:memory diff
:memory remember
:memory forget
:memory compact
:memory status
```

---

# 29. Session System

Sessions should be resumable.

Commands:

```text
:session new
:session list
:session resume
:session fork
:session rename
:session delete
```

Each agent turn should append to:

```text
events.jsonl
```

---

# 30. Session Event Examples

```json
{"type":"session_start","id":"abc","cwd":"~/project"}

{"type":"user_message","text":"fix the tests"}

{"type":"model_request","provider":"pollinations","model":"deepseek"}

{"type":"assistant_message","text":"I will inspect the failures."}

{"type":"tool_call","name":"run_command","command":"cargo test"}

{"type":"approval","decision":"allow_once"}

{"type":"tool_result","exit_code":101,"summary":"3 tests failed"}

{"type":"memory_patch","path":"MEMORY.md"}

{"type":"turn_end","status":"complete"}
```

Use append-only events wherever practical.

---

# 31. Context Builder

The model should never receive the whole repository blindly.

Context sources may include:

```text
system instructions
global instructions
workspace instructions
MEMORY.md
current user request
recent session turns
selected files
Git diff
tool outputs
diagnostic output
```

A context manifest should exist internally for every request.

---

# 32. Context Budgeting

Example budget:

```text
Total model budget
│
├── system policy
├── tool definitions
├── memory
├── current conversation
├── selected source files
├── recent tool output
└── reserve for response
```

Older context should be summarized rather than simply truncated.

---

# 33. Token Optimization

Token optimization should be a dedicated subsystem.

Pipeline:

```text
Raw output
   ↓
Secret redaction
   ↓
Command-aware parser
   ↓
Deduplication
   ↓
Noise removal
   ↓
Optional RTK
   ↓
Budget clipping
   ↓
Model
```

---

# 34. Command-Aware Compression

Different commands should have specialized filters.

Examples:

## `cargo test`

Keep:

- failing test names
- panic messages
- compiler errors
- relevant stack traces
- final summary

Remove/reduce:

- repeated successful tests
- duplicated warnings

---

## `npm install`

Keep:

- errors
- warnings
- package conflict information
- final status

Remove:

- repetitive progress output

---

## `git diff`

Prefer structured diff-aware context.

---

# 35. Rust Token Killer Integration

RTK should be optional.

Define:

```rust
trait TokenFilter {
    async fn compress(
        &self,
        kind: OutputKind,
        input: &[u8],
        budget: usize
    ) -> Result<CompressedOutput>;
}
```

Implementations:

```text
NativeFilter
RtkFilter
CompositeFilter
```

If RTK is not installed, the terminal must continue working.

---

# 36. DeepSeek Harness Integration

DeepSeek Harness should not be embedded into the startup-critical path.

Instead:

```text
Rust shell
    ↓
Harness adapter
    ↓
version-pinned DeepSeek Harness process
```

Potential communication methods:

```text
JSON-RPC
stdio
SDK protocol
local socket
```

The adapter owns all translation.

---

# 37. DeepSeek Harness Responsibilities

Possible uses:

- advanced planning
- specialized agent profiles
- multi-agent flows
- external tool orchestration
- subagents
- richer agent state
- optional automation

The Rust application remains responsible for:

- terminal lifecycle
- authentication
- permission enforcement
- shell PTY
- local memory
- safety policy
- configuration
- startup
- fallback behavior

---

# 38. Harness Failure Handling

If the harness:

- fails to start
- crashes
- times out
- returns invalid protocol messages
- becomes incompatible

then:

```text
Harness unavailable.
Falling back to native agent runtime.
```

Normal terminal operation must never fail.

---

# 39. Sandbox Architecture

Sandboxing should have several levels.

## Level 0: Direct

Agent runs inside current workspace.

Still protected by approval policies.

---

## Level 1: Temporary workspace

Copy or stage required project content inside a temporary directory.

Useful for:

- code generation
- experiments
- risky edits
- disposable builds

---

## Level 2: OS isolation

Platform-specific isolation.

Examples may eventually include:

- Linux namespaces
- Windows sandbox mechanisms
- macOS sandbox mechanisms

---

## Level 3: Container / remote sandbox

Optional integration:

```text
Docker
Podman
remote containers
cloud sandbox
```

This must not be required for basic installation.

---

# 40. Sandbox Security

Sandboxed agents should not automatically access:

```text
OS keychain
Pollinations API credentials
SSH private keys
browser cookies
global secret stores
```

Network access should be configurable.

---

# 41. Configuration

Global file:

```text
~/.<shellname>/config.toml
```

Example:

```toml
[ui]
theme = "auto"
logo = "compact"
ascii = true

[shell]
linux = "bash"
macos = "zsh"
windows = "pwsh"

[suggestions]
local = true
ai = true
ai_delay_ms = 450

[ai]
provider = "pollinations"
model = "deepseek"
max_steps = 12
context_budget_tokens = 48000

[memory]
global = true
workspace = true
auto_propose = true

[token_optimization]
enabled = true
rtk = "auto"

[sandbox]
default = "direct"

[privacy]
telemetry = false
persist_full_command_output = false
```

---

# 42. Configuration Precedence

Recommended:

```text
CLI flags
    ↓
environment variables
    ↓
project .<shellname>/config.toml
    ↓
global config
    ↓
defaults
```

---

# 43. Security Requirements

## Credential safety

Never write secrets into:

- logs
- history
- MEMORY.md
- session summaries
- telemetry
- crash reports

---

## AI context safety

Before sending context to a model:

```text
selected context
    ↓
secret scanner
    ↓
redaction
    ↓
token optimization
    ↓
provider
```

---

# 44. Secret Detection

Detect common patterns such as:

```text
API keys
AWS credentials
GitHub tokens
private keys
JWTs
.env values
database passwords
Authorization headers
```

Allow custom user patterns.

---

# 45. Privacy Command

Provide:

```text
:privacy inspect
```

Example result:

```text
Provider:
  Pollinations

Current model:
  deepseek

Memory:
  Global enabled
  Project enabled

Telemetry:
  Disabled

Current AI context:
  MEMORY.md
  src/parser.rs
  last cargo test result

Secrets:
  Redaction enabled
```

---

# 46. History

History should distinguish:

```text
native commands
AI questions
agent requests
internal commands
```

Avoid putting sensitive authentication input in history.

Potential storage:

```text
~/.<shellname>/history.sqlite
```

or a compact binary/JSON database.

SQLite may eventually be useful for:

- fast search
- session history
- metadata
- suggestion ranking

---

# 47. Local Autocomplete

Autocomplete sources:

```text
command history
PATH executables
filesystem paths
Git branches
Git remotes
project scripts
aliases
known shell commands
```

These should work without AI.

---

# 48. AI Autocomplete

AI completion should only receive the minimum required context.

Possible context:

```text
current command fragment
cwd
last command
last exit status
small recent history window
```

Avoid transmitting full shell history.

---

# 49. Performance Goals

Initial targets:

## Startup

Goal:

```text
interactive prompt visible in <100 ms on a normal modern machine
```

This should be treated as an aspirational benchmark and measured across platforms.

---

## Native command path

AI overhead:

```text
0 network requests
0 model initialization
0 harness initialization
```

---

## AI request

UI should stream first tokens immediately when provider response begins.

---

# 50. Lazy Initialization

After startup:

```text
show prompt
    ↓
background/lazy operations may begin
```

Possible lazy operations:

- cached model refresh
- Git status refresh
- memory index check
- completion index update

But never block initial input.

---

# 51. Installation

## Linux

Potential:

```bash
curl -fsSL https://.../install.sh | sh
```

Also:

- release tarballs
- `.deb`
- `.rpm`

---

## macOS

Preferred:

```text
Homebrew
```

Potential:

```bash
brew install <shellname>
```

---

## Windows

Preferred:

```text
winget
```

Potential:

```powershell
winget install <shellname>
```

Also:

- MSI
- Scoop later

---

# 52. Binary Packaging

Goal:

```text
single Rust binary
```

Optional external components:

```text
DeepSeek Harness runtime
RTK executable
container provider
```

These should be downloaded or detected only when required.

---

# 53. Update System

Potential command:

```text
<shellname> update
```

or native package-manager updates.

Signed release artifacts should be used.

---

# 54. Diagnostics

Provide:

```text
:doctor
```

Example:

```text
Platform             Linux x86_64
Native shell         bash 5.3
PTY                   OK
Pollinations auth     OK
Keychain              OK
Git                   OK
RTK                   Not installed
DeepSeek Harness      Disabled
Sandbox               Direct only
```

---

# 55. Error Handling

Errors should distinguish between:

```text
shell error
provider error
authentication error
agent error
tool error
permission denial
sandbox error
harness error
configuration error
```

The UI should show actionable messages.

---

# 56. Agent UI

Example:

```text
Agent Task
──────────
Goal:
  Fix failing parser tests

Step 1/12
  Reading src/parser.rs

Step 2/12
  Running cargo test

✗ 3 tests failed

Step 3/12
  Preparing patch

Permission required:
  write src/parser.rs
```

The user should always understand what the agent is doing.

---

# 57. Background Processes

The agent should be able to start background processes.

Example tools:

```text
process_start
process_status
process_output
process_stop
```

Potential UX:

```text
:jobs
```

Example:

```text
ID   Command         Status
12   npm run dev     running
13   cargo watch     running
```

---

# 58. Native Shell Jobs

Do not initially attempt to completely replace native shell job control.

Preserve native shell behavior through the PTY wherever possible.

Agent-owned processes can have a separate Rust-managed job registry.

---

# 59. First Release Scope

The first useful release should include:

- Rust executable
- Bash/Zsh/PowerShell persistent PTY
- polished prompt
- history
- native shell compatibility
- Pollinations authentication
- streamed AI question mode
- basic agent mode
- project `. <shellname>` directory
- MEMORY.md
- resumable sessions
- filesystem tools
- shell tool
- explicit permissions
- basic token optimization
- cancellation
- diagnostics

Do **not** wait for:

- perfect sandboxing
- embeddings
- AI autocomplete
- DeepSeek Harness
- remote execution
- plugin marketplace
- cloud sync

before shipping a working alpha.

---

# 60. Development Phases

## Phase 0 - Technical Spike

Goal:

Prove the architecture works.

Deliverables:

- Rust REPL
- spawn Bash on Linux
- spawn Zsh on macOS
- spawn PowerShell on Windows
- attach through PTY
- preserve cwd
- execute interactive command
- detect command completion

Exit condition:

A native shell can remain alive and behave correctly under Rust control.

---

# 61. Phase 1 - Terminal Core

Build:

- project workspace
- REPL
- PTY
- shell lifecycle
- history
- prompt
- resize handling
- Ctrl+C
- ANSI passthrough

Exit condition:

The terminal can be used as a normal daily shell without AI.

---

# 62. Phase 2 - Shell Intelligence

Build shell hooks for:

- cwd
- exit code
- command start
- command completion

Add:

- Git prompt
- command timing
- local completion

---

# 63. Phase 3 - Pollinations

Build:

- provider abstraction
- authentication
- model discovery
- chat completion
- streaming UI
- model switching

Commands:

```text
:model list
:model use
:auth login
:auth status
```

---

# 64. Phase 4 - Sessions

Implement:

```text
.<shellname>/sessions/
events.jsonl
summary.md
```

Commands:

```text
:session new
:session list
:session resume
```

---

# 65. Phase 5 - Memory

Implement:

```text
MEMORY.md
instructions.md
structured memory
```

Commands:

```text
:memory show
:memory diff
:memory edit
:memory compact
```

---

# 66. Phase 6 - Tools

Initial agent tools:

```text
read_file
list_dir
search_text
run_command
git_status
git_diff
write_file
patch_file
```

Add permission engine.

---

# 67. Phase 7 - Native Agent

Implement multi-step model/tool loop.

Requirements:

- bounded steps
- cancellation
- tool results
- session events
- memory access
- streaming output

---

# 68. Phase 8 - Token Optimization

Build:

- secret redaction
- output deduplication
- command-aware parsers
- context budgets
- RTK adapter
- compression statistics

Potential command:

```text
:tokens
```

Example:

```text
Raw tool output:       38,420 tokens estimated
After filtering:        5,310
Reduction:             86.2%
```

---

# 69. Phase 9 - Suggestions

Build:

- local ghost text
- filesystem completion
- history completion
- optional AI completion
- latency safeguards

---

# 70. Phase 10 - Sandbox

Implement:

- temporary workspace
- command timeout
- resource policies
- sandbox export

---

# 71. Phase 11 - DeepSeek Harness

Only after native agent behavior is stable.

Implement:

- version detection
- adapter protocol
- session mapping
- compatibility test
- fallback to native agent

---

# 72. Phase 12 - Release Engineering

Build:

- cross-platform installers
- signing
- checksums
- update mechanism
- benchmark suite
- security review
- migration tests
- documentation

---

# 73. Coding Agent Work Packages

Development should be broken into small agent assignments.

---

## WP-001 - Workspace Bootstrap

Create:

```text
shell-cli
shell-core
shell-repl
shell-platform
```

Requirements:

- Cargo workspace
- formatting
- linting
- CI
- basic interactive prompt

Done when:

```text
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

all pass.

---

## WP-002 - PTY Prototype

Create:

```text
shell-pty
shell-native
```

Linux first.

Requirements:

- launch Bash
- persistent session
- stdin/output
- resize
- Ctrl+C

---

## WP-003 - macOS Zsh

Implement Zsh backend.

Validate:

- cwd state
- export
- aliases
- interactive programs

---

## WP-004 - Windows PowerShell

Implement PowerShell through ConPTY.

Validate:

```powershell
Set-Location
$env:TEST = "hello"
Get-Process
```

State must persist.

---

## WP-005 - Shell Lifecycle Protocol

Create hidden command-completion markers and metadata hooks.

Collect:

```text
cwd
exit code
command start
command end
```

---

## WP-006 - UI Layer

Build:

- prompt
- ASCII logo
- colors
- plain mode
- Git segment
- execution status

---

## WP-007 - History

Add:

- persistent history
- Ctrl+R
- history search
- mode metadata

---

## WP-008 - LLM Provider Interface

Create:

```text
shell-llm
```

with mock provider.

No Pollinations code yet.

---

## WP-009 - Pollinations Adapter

Create:

```text
shell-pollinations
```

Implement:

- model list
- streaming chat
- errors
- retries
- timeouts

---

## WP-010 - Authentication

Implement secure credential storage.

Commands:

```text
:auth login
:auth status
:auth logout
```

---

## WP-011 - AI Question Mode

Implement:

```text
?
```

Example:

```text
? explain the last error
```

---

## WP-012 - Workspace State

Create:

```text
.<shellname>/
```

with safe project initialization.

---

## WP-013 - Session Event Store

Implement append-only:

```text
events.jsonl
```

---

## WP-014 - Memory

Implement:

```text
MEMORY.md
instructions.md
```

and commands.

---

## WP-015 - Tool Registry

Implement tool definitions and risk classes.

Start read-only.

---

## WP-016 - Approval Engine

Create policy rules independent of AI prompts.

---

## WP-017 - Shell Tool

Allow agent to execute commands through controlled execution.

Important:

Agent shell execution should not blindly type into the user's active interactive shell unless explicitly intended.

Prefer isolated tool execution contexts for automated commands.

---

# 74. Important Shell Tool Design

There should be two execution contexts.

## User interactive shell

The actual persistent native shell controlled by the user.

```text
User terminal
```

## Agent execution shell

A managed execution environment for agent tool calls.

```text
Agent subprocess / PTY
```

This prevents an agent from corrupting the user's live shell state unexpectedly.

The agent may request explicit interaction with the user's live shell, but this should be a separate capability.

---

# 75. Agent Command Modes

Potential tool modes:

```text
run_command isolated
run_command workspace
run_command interactive-session
```

Default:

```text
workspace isolated subprocess
```

---

# 76. Acceptance Test Matrix

## Normal terminal

- Starts without internet.
- Starts without API key.
- Bash works on Linux.
- Zsh works on macOS.
- PowerShell works on Windows.
- `cd` persists.
- environment variables persist.
- aliases persist.
- pipes work.
- redirects work.
- interactive commands work.

---

## AI

- model stream renders incrementally.
- cancellation works.
- provider failure does not kill terminal.
- authentication secrets do not appear in history.

---

## Agent

- can inspect fixture repository.
- can run tests.
- can patch a file.
- cannot bypass permission engine.
- max-step limit works.
- Ctrl+C cancels.

---

## Memory

- MEMORY.md can be created.
- memory can be edited.
- secret detection rejects likely credentials.
- session resume reconstructs useful context.

---

## Token optimization

- verbose command output is compressed.
- critical error lines remain present.
- optional RTK absence does not break agent mode.

---

## Harness

- disabled harness does not affect terminal.
- incompatible harness produces clean warning.
- native fallback works.

---

# 77. Performance Benchmarks

Track:

```text
cold startup time
warm startup time
keystroke latency
prompt render latency
command forwarding latency
AI first-token latency
memory loading time
context-build time
token compression ratio
agent step latency
```

---

# 78. Benchmark Philosophy

Do not optimize based on assumptions.

Create reproducible benchmark commands.

Example:

```text
cargo bench
```

and a cross-platform startup benchmark script.

---

# 79. Logging

Use structured logs.

Potential levels:

```text
error
warn
info
debug
trace
```

Logging must not leak:

```text
API keys
prompt secrets
raw environment secrets
password input
```

---

# 80. Telemetry

Default recommendation:

```text
off
```

If added later, telemetry should be explicitly opt-in.

Safe telemetry might include:

```text
app version
OS
startup timing
feature usage counters
crash category
```

Not:

```text
commands
prompts
file names
file contents
API keys
memory
```

---

# 81. Plugin System - Future

Eventually, the shell can support plugins.

Potential plugin types:

```text
prompt segment
completion source
LLM provider
agent tool
memory source
sandbox backend
theme
shell backend
```

Do not block MVP on a full plugin ABI.

---

# 82. Potential Command Namespace

```text
:help
:version

:session
:session new
:session list
:session resume
:session fork

:memory
:memory show
:memory edit
:memory diff
:memory compact

:model
:model list
:model use

:auth
:auth login
:auth status
:auth logout

:agent
:agent status
:agent stop

:sandbox
:sandbox new
:sandbox list
:sandbox destroy

:permissions

:tools

:jobs

:tokens

:privacy

:doctor

:config
```

---

# 83. Potential User Flow

User opens terminal:

```text
<ASCII logo>

~/project main
❯
```

Runs:

```bash
cargo test
```

Native shell executes.

Tests fail.

User enters:

```text
? explain the failures
```

AI reads selected last command output.

Then:

```text
@ fix them
```

Agent:

1. reads failure context
2. inspects repository files
3. proposes file edits
4. gets permission
5. patches code
6. runs tests in agent execution shell
7. summarizes result
8. optionally proposes memory update

The user's normal interactive Bash/Zsh/PowerShell session remains intact throughout.

---

# 84. Key Architectural Boundary

The product has three execution planes.

```text
┌─────────────────────────────────────┐
│ Plane 1: User Shell                 │
│ Bash / Zsh / PowerShell             │
│ Persistent interactive PTY          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Plane 2: Rust Control Plane         │
│ UI / sessions / memory / permissions│
│ context / providers / tools         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Plane 3: Agent Execution Plane      │
│ isolated commands / sandbox / tools │
└─────────────────────────────────────┘
```

This separation should remain one of the main design invariants.

---

# 85. What We Should Explicitly Avoid

Do not:

- rewrite Bash grammar
- rewrite Zsh grammar
- rewrite PowerShell grammar
- make every command an AI request
- run DeepSeek Harness at startup
- store API keys in config files
- automatically upload full repositories
- automatically store raw chats in MEMORY.md
- allow model prompts to override tool permissions
- let agent commands freely mutate the user's live shell state
- make Docker a hard dependency
- require embeddings for memory
- block startup while fetching models

---

# 86. Suggested MVP

A realistic high-quality MVP is:

```text
Rust terminal
+
persistent Bash/Zsh/PowerShell
+
beautiful prompt
+
history
+
Pollinations login
+
? chat mode
+
@ agent mode
+
filesystem tools
+
agent shell execution
+
permissions
+
.<shellname>/MEMORY.md
+
sessions
+
basic token optimization
```

That alone would already be a strong and differentiated product.

---

# 87. Version Roadmap

## v0.1

Normal shell foundation.

Features:

- Bash
- Zsh
- PowerShell
- PTY
- prompt
- history

---

## v0.2

AI shell.

Features:

- Pollinations
- authentication
- streamed `?` mode
- model selection

---

## v0.3

Memory shell.

Features:

- sessions
- MEMORY.md
- project instructions
- context inspection

---

## v0.4

Agent shell.

Features:

- tools
- permission system
- multi-step agent
- file patches
- tests

---

## v0.5

Efficient shell.

Features:

- RTK integration
- token filters
- context budgets
- usage statistics

---

## v0.6

Smart terminal UX.

Features:

- AI completion
- advanced prompt
- Git integrations
- agent jobs

---

## v0.7

Sandbox shell.

Features:

- temporary workspace
- resource restrictions
- export workflow

---

## v0.8

Harness integrations.

Features:

- DeepSeek Harness
- specialized agents
- optional multi-agent workflows

---

## v1.0

Stable release.

Requirements:

- reliable installers
- update path
- platform test matrix
- migration guarantees
- security review
- performance targets
- stable configuration format
- documented provider/tool APIs

---

# 88. First Coding-Agent Prompt

Use this only for the first work package.

```text
You are implementing WP-001 for <shellname>, an AI-native cross-platform
terminal environment written in Rust.

Core architecture:

- Linux uses Bash as the underlying shell.
- macOS uses Zsh.
- Windows uses PowerShell.
- <shellname> is NOT reimplementing those shell languages.
- The Rust application is the control/UI/AI layer.
- The native shell will eventually run as a persistent PTY process.
- AI must never be required for normal terminal operation.

For WP-001 only:

1. Create a Rust Cargo workspace.
2. Create:
   - shell-cli
   - shell-core
   - shell-repl
   - shell-platform
3. shell-cli starts an interactive REPL.
4. Detect Linux/macOS/Windows and expose a typed Platform enum.
5. Render a minimal prompt containing the current working directory.
6. Implement:
   - :exit
   - :version
   - :platform
7. Non-built-in input should produce a NativeInput event.
8. Do NOT execute commands yet.
9. Do NOT integrate Pollinations.
10. Do NOT integrate DeepSeek Harness.
11. Do NOT add a PTY yet.
12. Keep library code separate from main.rs.
13. Add tests.
14. Add GitHub Actions for Linux, Windows, macOS.

Definition of done:

cargo fmt --check

cargo clippy --workspace --all-targets -- -D warnings

cargo test --workspace

All must pass.

Do not expand scope beyond WP-001.
```

---

# 89. Second Coding-Agent Prompt

After WP-001 passes:

```text
Implement WP-002: persistent native shell PTY prototype.

Goal:

Connect shell-cli to a persistent native shell process.

Platform mapping:

Linux   -> bash
macOS   -> zsh
Windows -> PowerShell / pwsh

Requirements:

1. Add shell-pty and shell-native crates.
2. Define a NativeShell trait.
3. Implement process lifecycle abstraction.
4. Forward terminal input/output.
5. Resize child PTY when parent terminal resizes.
6. Ctrl+C must interrupt the child process/shell correctly.
7. Keep the native shell alive between commands.
8. Verify that state persists:
   - cd
   - environment variables
9. Do not implement AI.
10. Do not implement agent tools.
11. Keep OS-specific logic isolated.
12. Add integration tests where practical.
```

---

# 90. Architectural Invariants

These rules should be placed into the repository's agent instructions.

## Invariant 1

Normal commands never require AI.

## Invariant 2

Native shell semantics remain owned by Bash/Zsh/PowerShell.

## Invariant 3

The user's interactive shell and agent execution environment are separate.

## Invariant 4

Models cannot grant themselves permissions.

## Invariant 5

Secrets cannot be persisted in memory.

## Invariant 6

Provider implementation details do not leak into shell-core.

## Invariant 7

DeepSeek Harness is replaceable.

## Invariant 8

Token optimization must preserve critical diagnostic information.

## Invariant 9

Network activity must not block terminal startup.

## Invariant 10

The terminal must remain usable if every AI feature fails.

---

# 91. Final Product Identity

The product should eventually feel like:

> **A native terminal that happens to contain an AI engineering environment, rather than an AI chatbot pretending to be a terminal.**

That distinction drives the entire architecture.

The user should be able to spend hours in `<shellname>` doing completely normal terminal work and only invoke AI when useful.

At the same time, when agent mode is invoked, the environment should already understand:

- the repository
- the current session
- selected terminal history
- project memory
- active errors
- current branch
- previous agent actions
- available tools
- permissions
- sandbox state

without requiring the user to leave the terminal.

---

# 92. Immediate Development Sequence

Start in exactly this order:

```text
WP-001
Rust workspace + REPL

    ↓

WP-002
Persistent PTY

    ↓

WP-003 / WP-004
Zsh + PowerShell parity

    ↓

WP-005
Shell lifecycle protocol

    ↓

WP-006
UI

    ↓

WP-007
History

    ↓

WP-008
Provider abstraction

    ↓

WP-009
Pollinations

    ↓

WP-010
Authentication

    ↓

WP-011
? AI mode

    ↓

WP-012
.<shellname> workspace

    ↓

WP-013
Sessions

    ↓

WP-014
Memory

    ↓

WP-015 / WP-016
Tools + permissions

    ↓

WP-017+
Agent runtime

    ↓

Token optimization

    ↓

Suggestions

    ↓

Sandbox

    ↓

DeepSeek Harness
```

Do not skip the shell foundation.

A world-class AI terminal will still fail as a product if the normal terminal experience feels slower, less reliable, or less compatible than Bash/Zsh/PowerShell.

---

# 93. Technical References

## DeepSeek Harness

Repository:

```text
https://github.com/deepseek-ai/deepseek-harness
```

The current architecture is based around replaceable plugin services including model adapters, tools, session systems, agent loops, shell capabilities, terminal capabilities, persistence, sandboxes, and other extension seams.

Because the project is currently evolving rapidly, `<shellname>` should integrate it only through a version-pinned compatibility adapter.

---

## Pollinations

API:

```text
https://gen.pollinations.ai/
```

Pollinations is the initial provider for:

- model requests
- streaming responses
- tool-capable model interactions
- BYOK/BYOP-oriented authentication
- future embeddings if necessary

Its integration must remain isolated inside the provider crate.

---

## Rust Token Killer

Potential optimization component:

```text
https://github.com/clothbun1/Rust-Token-Killer
```

Use as an optional adapter.

Do not make it a startup dependency.

---

# 94. Definition of Project Success

The project succeeds when all of the following are true:

1. A Linux user can use it as a comfortable Bash environment.
2. A macOS user can use it as a comfortable Zsh environment.
3. A Windows user can use it as a comfortable PowerShell environment.
4. Native command behavior feels indistinguishable from using the underlying shell directly.
5. AI features remain optional.
6. AI responses stream quickly.
7. Agent workflows can safely inspect, edit, run, test, and reason about projects.
8. Memory is transparent and user-controlled.
9. The user's active shell cannot be silently corrupted by autonomous agent actions.
10. Provider or harness failures never destroy the terminal experience.
11. Token consumption stays controlled even during large developer workflows.
12. Startup remains extremely fast.
13. The architecture remains modular enough to evolve without rewriting the entire terminal.

---

# 95. Current Recommended Next Step

Begin with **WP-001**.

Do not start with:

- DeepSeek Harness
- memory
- embeddings
- sandboxing
- AI completion
- multi-agent orchestration

The first engineering milestone should be:

> **A beautiful Rust terminal frontend that launches the correct native shell and can eventually keep it alive through a reliable cross-platform PTY.**

Once that is stable, the AI architecture can be layered onto a terminal foundation that is already worth using.
