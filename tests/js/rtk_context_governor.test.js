#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");

const adapterPath = path.resolve(
    __dirname,
    "../../.github/ccr-adapters/rtk-context-governor.js",
);
const { governMessages } = require(adapterPath);

const oldResult = "old-line\n".repeat(500);
const newResult = "new-line\n".repeat(500) + "LATEST_SENTINEL";
const read = '{"file_path":"src/app.ts"}';
const messages = [
    { role: "system", content: "bounded solve instructions" },
    {
        role: "user",
        content:
            "issue context\n" +
            `Earlier I ran Read with ${read}. It returned: ${oldResult}` +
            `Earlier I ran Read with ${read}. It returned: ${newResult}`,
    },
];

const governed = governMessages(messages, {
    max_context_chars: 2000,
    message_max_chars: 1600,
    tool_result_max_chars: 900,
    stale_tool_result_chars: 120,
    recent_tool_results: 2,
});
const rendered = governed.map((message) => message.content).join("\n");

assert.match(rendered, /superseded by a newer result/);
assert.match(rendered, /LATEST_SENTINEL/);
assert.ok(rendered.length <= 2000);
assert.ok(rendered.length < oldResult.length + newResult.length);

console.log("rtk-context-governor: ok");
