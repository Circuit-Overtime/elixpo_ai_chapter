# Terminal-configurable providers

Crumb treats OpenRouter as a preset, not a special runtime path. Every custom
provider uses the same non-secret schema in `.crumb/agent.json`; terminal
commands will validate and atomically update that schema.

```json
{
  "providers": {
    "my_gateway": {
      "display_name": "My Gateway",
      "protocol": "open_ai_completions",
      "base_url": "https://models.example.com/v1",
      "credential": {
        "source": "environment",
        "name": "MY_GATEWAY_API_KEY"
      },
      "headers": {
        "HTTP-Referer": {
          "source": "public",
          "value": "https://crumb.elixpo.com"
        }
      },
      "models": [
        {
          "id": "coding-model",
          "input": ["text", "image"],
          "tool_calling": true,
          "context_window": 131072,
          "max_output_tokens": 8192,
          "reasoning_efforts": {
            "off": null,
            "low": "low",
            "high": "high"
          }
        }
      ]
    }
  },
  "models": {
    "text": [
      {
        "provider": "my_gateway",
        "model": "coding-model",
        "effort": "high"
      }
    ]
  }
}
```

The schema also carries provider and model compatibility switches, default
modalities and token limits, reasoning budgets, cache retention, SSE/WebSocket
transport, timeouts, bounded image payloads, retries, pricing metadata, and an
optimizer selection. Sensitive headers must reference environment variables.
Credentialed remote endpoints require HTTPS; loopback development may use
HTTP.

Provider IDs and exact models are selected explicitly. When a selected route
names a configured provider, Crumb validates the model and effort locally
before any Harness process or network request starts.

The native Harness runs any provider whose `protocol` is
`open_ai_completions`, streaming `/v1/chat/completions` with tool calling.
Pollinations remains the default and falls back to the signed-in key. Any
other provider needs a `credential`, except a server on `localhost`,
`127.0.0.1`, or `::1`, which may run without one; no `Authorization` header is
sent then. That covers local runtimes such as Ollama
(`http://127.0.0.1:11434/v1`) and LM Studio (`http://localhost:1234/v1`), or
any other local server that implements the OpenAI chat-completions API:

```json
{
  "providers": {
    "ollama": {
      "display_name": "Ollama",
      "protocol": "open_ai_completions",
      "base_url": "http://127.0.0.1:11434/v1",
      "models": [{ "id": "qwen3:8b", "tool_calling": true }]
    }
  },
  "models": {
    "text": [{ "provider": "ollama", "model": "qwen3:8b" }]
  }
}
```

The agent loop depends on tool calling, so choose a local model that supports
it. A local model's answers are generated on this machine; connected providers
such as Pollinations remain remote services.

For process Harnesses, Crumb projects only the selected provider dictionary.
Credential and secret-header values are resolved at the child boundary, while
the restart fingerprint contains only non-secret configuration. The generic
DeepSeek Harness adapter receives OpenAI Completions, OpenAI Responses, and
Anthropic Messages protocol names directly.

## Terminal mutation surface

The live terminal mutation surface includes:

- `/config provider add|show|remove`
- `/config provider preset <openrouter|pollinations> [provider-id]`
- `/config provider credential set|clear`
- `/config provider header set|remove`
- `/config provider set <provider> <field> <value>`
- `/config provider retry <provider> <count> <base-ms> <max-ms>`
- `/config provider pricing set|remove`
- `/config provider compatibility set`
- `/config provider compatibility-field set|clear`
- `/config provider modality add|remove`
- `/config provider thinking-budget set|remove`
- `/config provider model add|remove`
- `/config provider discover <provider>`
- `/config provider model set|modality|effort|compatibility|compatibility-field`
- `/model use <provider>/<model>`
- `/effort use <level|default>`
- `/mode use <auto|negotiate|plan>`

Provider creation accepts only `env:NAME` or `keyring:SERVICE/ACCOUNT`
credential references. Raw secrets are never accepted as command arguments,
history, JSON, sessions, or diagnostics. Every mutation validates the complete
configuration and atomically replaces the workspace file; a rejected mutation
leaves the previous file intact.

The OpenRouter preset uses its OpenAI-compatible
`https://openrouter.ai/api/v1` endpoint, an `OPENROUTER_API_KEY` environment
reference, and public Crumb attribution headers. The Pollinations preset uses
`https://gen.pollinations.ai/v1` and a `POLLINATIONS_API_KEY` environment
reference. Presets intentionally contain no models: users add an exact model
and select it explicitly.

Model discovery is lazy and user-triggered. `/config provider discover <provider>` reads the
provider's bounded `/models` response, resolves credentials only for that request, blocks
redirects, and merges newly discovered identifiers without replacing explicit local metadata.
`/doctor` performs local route, modality, model, and effort compatibility checks without making a
network request.

The typed `set` surface covers protocol and endpoint changes, display names,
SSE/WebSocket transport, cache retention, optimizer selection, reasoning,
timeouts, payload ceilings, and default context/output limits. Provider and
model compatibility switches and wire-field names, retry policy, pricing,
thinking budgets, modalities, tool calling, exact model limits, and effort wire
mappings are independently mutable. Use `default` to clear optional scalar
settings. Display names use underscores for spaces because configuration
commands do not run through the native shell parser.

```text
/config provider set openrouter transport sse
/config provider retry openrouter 3 250 4000
/config provider compatibility set openrouter strict-tools true
/config provider pricing set openrouter input_tokens 0.25
/config provider model set openrouter vendor/model tool-calling true
/config provider model modality add openrouter vendor/model image
/config provider model effort set openrouter vendor/model high high
/model use openrouter/vendor/model
/effort use high
```
