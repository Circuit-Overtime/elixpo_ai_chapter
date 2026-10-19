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
 * The coding CLI also exposes a PDF-only `pages` argument on its general Read
 * tool. Text-file edits require a prior built-in Read, but compatible models
 * sometimes emit `pages: ""`, which the CLI rejects before reading anything.
 * Solve does not inspect PDFs, so remove that property (and its required entry)
 * from Read's provider-facing schema. The runtime then receives only file_path,
 * offset, and limit.
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
            const isObjectSchema = fn.parameters.type === "object";
            const hasNoProperties = fn.parameters.properties == null;
            if (isObjectSchema && hasNoProperties) {
                fn.parameters.properties = {};
            }
            if (fn.name === "Read" && fn.parameters.properties?.pages) {
                delete fn.parameters.properties.pages;
                if (Array.isArray(fn.parameters.required)) {
                    fn.parameters.required = fn.parameters.required.filter(
                        (name) => name !== "pages",
                    );
                }
            }
            const pathField = {
                Read: "file_path",
                Edit: "file_path",
                Write: "file_path",
                Grep: "path",
                Glob: "path",
            }[fn.name];
            const pathSchema = pathField && fn.parameters.properties?.[pathField];
            if (pathSchema && typeof pathSchema === "object") {
                pathSchema.description =
                    "Repository-relative path from the current checkout, for example app/file.tsx. " +
                    "Absolute paths such as /workspace or /tmp and parent traversal are invalid.";
            }
        }
        return request;
    }
}

module.exports = ToolSchemaPatcher;
