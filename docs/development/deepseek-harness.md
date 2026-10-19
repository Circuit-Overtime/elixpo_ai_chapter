# DeepSeek Harness adapter

Agent-bound output follows the measured [token optimization pipeline](token-optimization.md).

Branch: `feat/wp-013-deepseek-harness`

Crumb treats the Harness as an optional subprocess outside terminal startup and
native command execution. The adapter implements the public newline-delimited
JSON-RPC SDK protocol; stdout is protocol-only and stderr is bounded diagnostic
output.

## Wire contract

The supported client requests are `initialize`, `session/prompt`, and
`shutdown`. Initialization selects the workspace, provider, exact model,
optional reasoning effort, and optional output-token cap. Prompts carry a Crumb
session identifier and content blocks.

Reasoning effort is selected before process initialization. Changing provider,
model, or effort requires a clean process restart so one Harness process cannot
silently retain another route's defaults. Unsupported effort values fail before
model traffic.

The SDK wire currently has no approval request/response channel. Crumb therefore
must not expose a Harness composition containing direct mutating shell or file
tools. Executable compositions must route tools through Crumb's policy-enforcing
MCP boundary; plan-only compositions may omit tools entirely.

The executable composition is `config/harness/crumb.cordis.yml`. The launcher
supplies absolute values for `DSH_CORDIS_CONFIG`, `DSH_CWD`,
`DSH_SESSION_ROOT`, and `CRUMB_MCP_COMMAND`. It projects the selected validated
provider into the generic `llm-pi-ai` adapter through an isolated child
environment. The projection carries endpoint, protocol, exact models,
capabilities, effort maps, transport, compatibility and limits. Environment and
keyring credentials are resolved only at launch. Secret headers remain typed
environment references until Cordis resolves them inside the child; no secret
is written into Cordis, agent configuration, sessions, diagnostics, or the
non-secret process-identity fingerprint.

Changing a provider profile changes that fingerprint and forces a clean
Harness restart. The initialized request also receives the selected model's
explicit output-token ceiling. The composition contains no Harness-native
shell or filesystem tool rows.

Reasoning-capable routes declare an explicit effort map because the Harness
uses those values both as selectable capabilities and as the exact
`reasoning_effort` values sent to the OpenAI-compatible endpoint.
All Pollinations text routes use an 8,192-token output ceiling so provider
defaults cannot silently request an oversized and unnecessarily costly reply.

For repository-local development, `config/harness/launch_runtime.py` asks the
installed `deepseek-harness-runtime-bin` wheel to resolve its platform binary
and replaces itself with that process. The agent configuration selects the
Python interpreter from `crumb.elixpo/.venv-harness`; no Python-version or
platform-specific runtime path is stored in Git.

## Web search permission

The MCP server exposes `web_search` whenever a process-scoped Pollinations
credential is available. It uses the bounded `perplexity` search model by
default; an explicit web-search route may select another compatible model. The
tool is always classified as `network_access`. It runs only when the user-owned agent configuration includes
`"permissions": {"allow_network_tools": ["web_search"]}`; model output cannot
add or widen that grant. Requests, response bytes, and execution time are
bounded, and Ctrl+C cancels the in-flight HTTP future.

The provider-neutral `web_fetch` tool is registered independently of Pollinations. It accepts
public HTTPS pages only, DNS-pins each request hop to a public address, rejects URL credentials and
automatic redirects, permits text/HTML/JSON responses, and enforces byte, time, and cancellation
limits. Users grant either tool explicitly with `/permissions allow-network web_fetch` or
`/permissions allow-network web_search`. Models cannot add these grants.

## Failure and cancellation

Requests and shutdown are time-bounded. Ctrl+C first sets Crumb's shared
cancellation token, then terminates and reaps the Harness process because the
SDK protocol has no prompt-cancel method. Startup, protocol, timeout, and crash
errors return control to Crumb's native agent runtime; they never terminate the
interactive shell.

The CLI installs its interrupt bridge only when the first agent turn starts.
On Unix the Harness owns a separate process group, so hard cancellation also
terminates its MCP descendants. Native shell input remains on the existing PTY
path and does not depend on the agent runtime.

## Delivery slices

1. Typed protocol framing and compatibility fixtures.
2. Lazy subprocess lifecycle with bounded stderr and shutdown escalation. (implemented)
3. Session notification projection and committed terminal output. (projection implemented)
4. CLI fallback integration and cancellation. (implemented)
5. Provider-neutral Harness composition and effort capabilities. (implemented)
