#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");

const adapterPath = path.resolve(
    __dirname,
    "../../.github/ccr-adapters/tool-schema-patcher.js",
);
const ToolSchemaPatcher = require(adapterPath);
const patcher = new ToolSchemaPatcher();

const request = {
    body: {
        tools: [
            {
                type: "function",
                function: {
                    name: "Read",
                    parameters: {
                        type: "object",
                        properties: {
                            file_path: { type: "string" },
                            pages: { type: "string" },
                        },
                        required: ["file_path", "pages"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "Edit",
                    parameters: {
                        type: "object",
                        properties: { file_path: { type: "string" } },
                        required: ["file_path"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "OtherTool",
                    parameters: {
                        type: "object",
                        properties: { pages: { type: "string" } },
                    },
                },
            },
        ],
    },
};

patcher.transformRequestOut(request).then((patched) => {
    const read = patched.body.tools[0].function.parameters;
    const other = patched.body.tools[1].function.parameters;
    assert.equal(read.properties.pages, undefined);
    assert.deepEqual(read.required, ["file_path"]);
    assert.deepEqual(other.properties.pages, { type: "string" });
    assert.match(read.properties.file_path.description, /Repository-relative path/);
    assert.match(patched.body.tools[2].function.parameters.properties.file_path.description, /Absolute paths/);
    console.log("tool-schema-patcher: ok");
});
