#!/usr/bin/env node

/**
 * openai-normalize.js — CCR transformer for any non-Anthropic provider.
 *
 * Originally written for Vertex Gemini's `thought_signature` requirement, the
 * same flatten-and-strip pass is needed for every non-Anthropic model served
 * through an OpenAI-style proxy (Pollinations: kimi, qwen-coder, perplexity-*,
 * glm, gemini, gemini-search, and friends). Each validates OpenAI schema
 * strictly and rejects:
 *   - `content: [{type: 'text', text: '...'}, ...]` structured arrays,
 *   - `cache_control: {type: 'ephemeral'}` markers on text blocks,
 *   - Anthropic-style `tool_use` / `tool_result` blocks in history.
 *
 * The fix: before the request hits the proxy, collapse every message's
 * content into a plain string and drop cache_control by virtue of the join.
 *
 * Rules:
 *   1. Tool exchanges (tool_use → tool_result) become user-role narrative
 *      notes like "Earlier I ran X(args). It returned: Y".
 *   2. Assistant messages that contained ONLY tool_use (no real text) are
 *      dropped entirely — no placeholders to copy.
 *   3. Assistant messages with real text keep that text only; any tool_use
 *      blocks inside are discarded (their context moves to the next user
 *      note).
 *   4. System and user messages with array content are joined to a single
 *      string; cache_control on individual text blocks is dropped in the join.
 *   5. Consecutive user messages are merged so the proxy sees clean alternation.
 *
 * The current turn's response is untouched; real tool calls still flow.
 *
 * The filter: SKIP flattening only for models that accept Anthropic-native
 * structured content (real Claude). Everything else gets the flatten pass.
 *
 * CCR contract: `registerTransformerFromConfig` calls `new Ctor(options)`.
 * Register at top-level and reference by name:
 *
 *   {
 *     "transformers": [{"path": "/abs/path/openai-normalize.js"}],
 *     "Providers": [{
 *       "transformer": { "use": ["openai-normalize", "openai", ...] }
 *     }]
 *   }
 */

// Only SKIP flattening for models we know accept Anthropic-native structured
// content. Everything else needs the flatten pass.
const ANTHROPIC_NATIVE_RE = /^claude(-|$)/i;

function asString(x) {
    if (x == null) return "";
    if (typeof x === "string") return x;
    try {
        return JSON.stringify(x);
    } catch {
        return String(x);
    }
}

function buildToolUseIndex(messages) {
    const index = new Map();
    for (const m of messages) {
        if (m?.role !== "assistant") continue;
        if (Array.isArray(m.content)) {
            for (const b of m.content) {
                if (b?.type === "tool_use" && b.id) {
                    index.set(b.id, { name: b.name, input: asString(b.input) });
                }
            }
        } else if (Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) {
                if (tc?.id) {
                    const fn = tc.function || {};
                    index.set(tc.id, {
                        name: fn.name,
                        input: fn.arguments || "{}",
                    });
                }
            }
        }
    }
    return index;
}

function toolResultNarrative(toolUseIndex, toolUseId, resultContent) {
    const tu = toolUseIndex.get(toolUseId);
    const result = asString(resultContent);
    return tu
        ? `Earlier I ran ${tu.name} with ${tu.input}. It returned: ${result}`
        : `Earlier tool output: ${result}`;
}

function flattenTextBlocks(content) {
    // Join `[{type:'text',text:'...'}, ...]` into a single string, dropping
    // any cache_control markers and non-text blocks (images, documents, etc.).
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return asString(content);
    const parts = [];
    for (const b of content) {
        if (b && b.type === "text" && typeof b.text === "string") {
            parts.push(b.text);
        }
    }
    return parts.join("\n");
}

function flattenMessages(messages) {
    const toolUseIndex = buildToolUseIndex(messages);
    const out = [];

    for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        const role = m.role;

        // System messages: flatten content array, drop cache_control.
        if (role === "system") {
            const content = flattenTextBlocks(m.content);
            if (content) out.push({ role: "system", content });
            continue;
        }

        if (role === "assistant" && Array.isArray(m.content)) {
            const texts = [];
            for (const b of m.content) {
                if (b?.type === "text" && b.text) texts.push(b.text);
            }
            if (texts.length > 0)
                out.push({ role: "assistant", content: texts.join("\n") });
            continue;
        }

        if (
            role === "assistant" &&
            Array.isArray(m.tool_calls) &&
            m.tool_calls.length > 0
        ) {
            const c =
                typeof m.content === "string" ? m.content : asString(m.content);
            if (c) out.push({ role: "assistant", content: c });
            continue;
        }

        if (role === "assistant") {
            const c = asString(m.content);
            if (c) out.push({ role: "assistant", content: c });
            continue;
        }

        if (role === "user" && Array.isArray(m.content)) {
            const parts = [];
            for (const b of m.content) {
                if (b?.type === "text" && b.text) parts.push(b.text);
                else if (b?.type === "tool_result") {
                    parts.push(
                        toolResultNarrative(
                            toolUseIndex,
                            b.tool_use_id,
                            b.content,
                        ),
                    );
                }
            }
            if (parts.length > 0)
                out.push({ role: "user", content: parts.join("\n") });
            continue;
        }

        if (role === "tool") {
            out.push({
                role: "user",
                content: toolResultNarrative(
                    toolUseIndex,
                    m.tool_call_id,
                    m.content,
                ),
            });
            continue;
        }

        out.push(m);
    }

    const merged = [];
    for (const m of out) {
        const last = merged[merged.length - 1];
        if (last && last.role === "user" && m.role === "user") {
            last.content = `${last.content}\n${m.content}`;
        } else {
            merged.push(m);
        }
    }

    for (const m of merged) {
        if (m && typeof m === "object") {
            delete m.tool_calls;
            delete m.tool_call_id;
        }
    }
    return merged;
}

class OpenAINormalizeAdapter {
    constructor(options) {
        this.name = "openai-normalize";
        this.options = options || {};
    }

    async transformRequestIn(request) {
        return this._flatten(request);
    }
    async transformRequestOut(request) {
        return this._flatten(request);
    }

    _flatten(request) {
        const body = request?.body ? request.body : request;
        if (!body || typeof body !== "object") return request;
        if (!Array.isArray(body.messages)) return request;
        // Only pass through unchanged for real Claude models; everything else
        // (kimi, qwen, perplexity, glm, gemini, ...) gets flattened.
        if (
            typeof body.model === "string" &&
            ANTHROPIC_NATIVE_RE.test(body.model)
        ) {
            return request;
        }

        body.messages = flattenMessages(body.messages);
        return request;
    }
}

module.exports = OpenAINormalizeAdapter;
