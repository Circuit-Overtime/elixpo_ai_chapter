#!/usr/bin/env node

/**
 * tool-schema-patcher.js — CCR transformer that backfills missing
 * `parameters` on OpenAI-format tool definitions before they hit the provider.
 *
 * Pollinations' qwen-coder backend strictly validates OpenAI function schemas
 * and 400s any request where `tools[i].function.parameters` is absent:
 *   "Failed to deserialize: tools[0].function: missing field `parameters`"
 *
 * WebSearch and some MCP tools ship without a parameters schema (valid per
 * OpenAI spec — parameters is optional). Gemini tolerates this; qwen-coder
 * does not. Rather than route background subagent calls away from qwen-coder
 * (losing the cost split), this transformer injects a minimum valid schema:
 *   { "type": "object", "properties": {} }
 *
 * Runs AFTER the `openai` transformer in the chain so we're always working
 * with OpenAI-format `tools[].function.parameters` rather than Anthropic's
 * `input_schema`. Registered at top-level `transformers` and referenced by
 * name in `Providers[].transformer.use`.
 */

class ToolSchemaPatcher {
    constructor(options) {
        this.name = "tool-schema-patcher";
        this.options = options || {};
    }

    async transformRequestIn(request) {
        return this._patch(request);
    }
    async transformRequestOut(request) {
        return this._patch(request);
    }

    _patch(request) {
        const body = request?.body ? request.body : request;
        if (!body || typeof body !== "object") return request;
        if (!Array.isArray(body.tools)) return request;

        for (const tool of body.tools) {
            if (!tool || typeof tool !== "object") continue;
            if (tool.type !== "function") continue;
            const fn = tool.function;
            if (!fn || typeof fn !== "object") continue;

            if (
                fn.parameters == null ||
                typeof fn.parameters !== "object" ||
                Array.isArray(fn.parameters)
            ) {
                fn.parameters = { type: "object", properties: {} };
                continue;
            }
            // Tool shipped a parameters object but it's missing required fields
            // — qwen-coder also rejects `{}` with no `type`.
            if (!fn.parameters.type) fn.parameters.type = "object";
            if (
                fn.parameters.type === "object" &&
                fn.parameters.properties == null
            ) {
                fn.parameters.properties = {};
            }
        }
        return request;
    }
}

module.exports = ToolSchemaPatcher;
