# Coding-agent backends

Crumb treats installed coding-agent CLIs as optional, replaceable Harness
backends. Discovery only checks the configured executable on the local `PATH`;
it never starts a process or contacts a provider during terminal startup.

Selection is intentionally strict. A coding CLI configuration must contain one
text route and matching capability metadata for that exact provider, model, and
effort. Multiple text routes are rejected instead of becoming a fallback chain.

```json
{
  "harness": {
    "kind": "coding_cli",
    "backend": "codex",
    "command": "codex",
    "capabilities": [
      {
        "provider": "openai",
        "model": "your-explicit-model",
        "reasoning_efforts": ["low", "medium", "high"]
      }
    ]
  },
  "models": {
    "text": [
      {
        "provider": "openai",
        "model": "your-explicit-model",
        "effort": "medium"
      }
    ]
  }
}
```

Use `"backend": "claude"` with an explicit Claude model and its supported
efforts for Claude Code. Credentials remain owned by the selected CLI through
its environment or credential store; they are not fields in `agent.json`.

Each invocation receives only Crumb's stdio MCP server (`crumb mcp serve`).
Claude uses strict inline MCP configuration without ambient built-in tools;
Codex ignores ambient user configuration and receives the same server through
per-invocation overrides. Crumb remains the owner of tool permissions,
workspace confinement, cancellation, and output filtering.

Codex runs through its documented non-interactive `exec` surface with JSONL
output, ephemeral session storage, an explicit sandbox, ignored ambient config
and rules, and per-invocation MCP overrides. See the
[official Codex command reference](https://developers.openai.com/codex/cli/reference).

`/doctor` reports the selected backend, local executable availability, exact
model and effort, and optimizer status without contacting a provider.

Capability values should follow the current provider documentation because
effort support varies by model:

- [OpenAI models](https://developers.openai.com/api/docs/models)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)

## Isolated smoke test

The checked-in [Codex](../examples/agent-config-codex.json) and
[Claude](../examples/agent-config-claude.json) examples use plan mode and do
not replace the repository configuration. Copy one into a temporary workspace:

```bash
mkdir -p /tmp/crumb-coding-smoke/.crumb
cp docs/examples/agent-config-codex.json /tmp/crumb-coding-smoke/.crumb/agent.json
cd /tmp/crumb-coding-smoke
/path/to/crumb
```

Run `/doctor`, then submit a plain-language request. Change the example model
and its declared effort metadata together when the provider account supports a
different exact model.
