#!/usr/bin/env bash
set -euo pipefail

: "${ELIXPO_POLLINATIONS_API_KEY:?missing ELIXPO_POLLINATIONS_API_KEY}"

CONFIG_ROOT="${1:-.}"
CCR_HOME="$HOME/.claude-code-router"
mkdir -p "$CCR_HOME"
cp "$CONFIG_ROOT"/.github/ccr-adapters/*.js "$CCR_HOME/"

read_config() {
  python3 -c "import sys; sys.path.insert(0, '$CONFIG_ROOT/.github'); from ci_config import $1; print($1)"
}

AGENT_MODEL="${ELIXPO_CCR_AGENT_MODEL:-$(read_config LLM_MODEL_AGENT)}"
CODE_MODEL="${ELIXPO_CCR_CODE_MODEL:-$(read_config LLM_MODEL_CODE)}"
THINK_MODEL="${ELIXPO_CCR_THINK_MODEL:-$(read_config LLM_MODEL_THINKING)}"
SEARCH_MODEL="${ELIXPO_CCR_SEARCH_MODEL:-$(read_config LLM_MODEL_SEARCH)}"
AGENT_TOKENS="${ELIXPO_CCR_AGENT_TOKENS:-$(read_config LLM_MAX_TOKENS_AGENT)}"
CODE_TOKENS="${ELIXPO_CCR_CODE_TOKENS:-$(read_config LLM_MAX_TOKENS_CODE)}"
THINK_TOKENS="${ELIXPO_CCR_THINK_TOKENS:-$(read_config LLM_MAX_TOKENS_THINKING)}"
SEARCH_TOKENS="${ELIXPO_CCR_SEARCH_TOKENS:-$(read_config LLM_MAX_TOKENS_SEARCH)}"

NORMALIZER="$CCR_HOME/openai-normalize.js"
TOOL_PATCHER="$CCR_HOME/tool-schema-patcher.js"
RTK_GOVERNOR="$CCR_HOME/rtk-context-governor.js"

RTK_CONTEXT_CHARS="${ELIXPO_CCR_CONTEXT_CHARS:-48000}"
RTK_RESULT_CHARS="${ELIXPO_CCR_RESULT_CHARS:-6000}"
RTK_STALE_CHARS="${ELIXPO_CCR_STALE_CHARS:-800}"
RTK_RECENT_RESULTS="${ELIXPO_CCR_RECENT_RESULTS:-3}"

cat > "$CCR_HOME/config.json" <<EOF
{
  "LOG": true,
  "LOG_LEVEL": "error",
  "NON_INTERACTIVE_MODE": true,
  "API_TIMEOUT_MS": 600000,
  "HOST": "127.0.0.1",
  "PORT": ${ELIXPO_CCR_PORT:-3456},
  "APIKEY": "ccr-pollinations",
  "transformers": [
    {"path": "$NORMALIZER"},
    {"path": "$RTK_GOVERNOR", "options": {"max_context_chars": $RTK_CONTEXT_CHARS, "tool_result_max_chars": $RTK_RESULT_CHARS, "stale_tool_result_chars": $RTK_STALE_CHARS, "recent_tool_results": $RTK_RECENT_RESULTS}},
    {"path": "$TOOL_PATCHER"}
  ],
  "Providers": [
    {
      "name": "pollinations-agent",
      "api_base_url": "https://gen.pollinations.ai/v1/chat/completions",
      "api_key": "$ELIXPO_POLLINATIONS_API_KEY",
      "models": ["$AGENT_MODEL"],
      "transformer": {"use": ["openai-normalize", "rtk-context-governor", "openai", "tool-schema-patcher", ["maxtoken", {"max_tokens": $AGENT_TOKENS}]]}
    },
    {
      "name": "pollinations-code",
      "api_base_url": "https://gen.pollinations.ai/v1/chat/completions",
      "api_key": "$ELIXPO_POLLINATIONS_API_KEY",
      "models": ["$CODE_MODEL"],
      "transformer": {"use": ["openai-normalize", "rtk-context-governor", "openai", "tool-schema-patcher", ["maxtoken", {"max_tokens": $CODE_TOKENS}]]}
    },
    {
      "name": "pollinations-thinking",
      "api_base_url": "https://gen.pollinations.ai/v1/chat/completions",
      "api_key": "$ELIXPO_POLLINATIONS_API_KEY",
      "models": ["$THINK_MODEL"],
      "transformer": {"use": ["openai-normalize", "rtk-context-governor", "openai", "tool-schema-patcher", ["maxtoken", {"max_tokens": $THINK_TOKENS}]]}
    },
    {
      "name": "pollinations-search",
      "api_base_url": "https://gen.pollinations.ai/v1/chat/completions",
      "api_key": "$ELIXPO_POLLINATIONS_API_KEY",
      "models": ["$SEARCH_MODEL"],
      "transformer": {"use": ["openai-normalize", "rtk-context-governor", "openai", "tool-schema-patcher", ["maxtoken", {"max_tokens": $SEARCH_TOKENS}]]}
    }
  ],
  "Router": {
    "default": "pollinations-agent,$AGENT_MODEL",
    "background": "pollinations-code,$CODE_MODEL",
    "think": "pollinations-thinking,$THINK_MODEL",
    "webSearch": "pollinations-search,$SEARCH_MODEL"
  }
}
EOF

echo "CCR routes: default=$AGENT_MODEL background=$CODE_MODEL think=$THINK_MODEL webSearch=$SEARCH_MODEL"

# Recent harness versions pass their selected Anthropic model name through the
# gateway. Point those aliases at configured free models so Pollinations does
# not reject an otherwise correctly routed request during model resolution.
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "ANTHROPIC_DEFAULT_SONNET_MODEL=$AGENT_MODEL"
    echo "ANTHROPIC_DEFAULT_OPUS_MODEL=$AGENT_MODEL"
    echo "ANTHROPIC_DEFAULT_HAIKU_MODEL=$CODE_MODEL"
  } >> "$GITHUB_ENV"
fi
