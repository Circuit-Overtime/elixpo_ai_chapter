#!/usr/bin/env node

/**
 * Deterministic RTK context governor for CCR coding loops.
 *
 * openai-normalize turns Anthropic tool results into user-message narratives.
 * Without a governor, every later model call resends every full Read/Grep result.
 * This adapter keeps recent evidence intact, replaces superseded calls with a
 * receipt, trims stale results head-and-tail, and enforces a per-turn character
 * ceiling before the request reaches Pollinations. It never alters tool schemas,
 * the current response, or usage returned by the provider.
 */

const TOOL_MARKER_RE = /(?=Earlier I ran |Earlier tool output:)/g;
const TOOL_CALL_RE = /^Earlier I ran ([^\s]+) with ([\s\S]*?)\. It returned: ([\s\S]*)$/;

function asText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function positiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function headTail(text, limit) {
    if (text.length <= limit) return text;
    const marker = `\n... [${text.length - limit} chars elided by RTK] ...\n`;
    const available = Math.max(0, limit - marker.length);
    const head = Math.ceil(available * 0.6);
    const tail = available - head;
    return text.slice(0, head) + marker + (tail ? text.slice(-tail) : "");
}

function splitNarratives(content) {
    const parts = asText(content).split(TOOL_MARKER_RE).filter(Boolean);
    return parts.map((text) => {
        const match = text.match(TOOL_CALL_RE);
        if (!match) return { text, tool: null, key: null, prefix: "" };
        const [, tool, input, result] = match;
        return {
            text,
            tool,
            key: `${tool}:${input}`,
            prefix: `Earlier I ran ${tool} with ${input}. It returned: `,
            result,
        };
    });
}

function governMessages(messages, options) {
    const recentCount = positiveInt(options.recent_tool_results, 3);
    const recentLimit = positiveInt(options.tool_result_max_chars, 6000);
    const staleLimit = positiveInt(options.stale_tool_result_chars, 800);
    const messageLimit = positiveInt(options.message_max_chars, 24000);
    const contextLimit = positiveInt(options.max_context_chars, 48000);

    const parsed = messages.map((message) => ({
        ...message,
        _parts: splitNarratives(message?.content),
    }));
    const toolParts = parsed.flatMap((message) => message._parts.filter((part) => part.tool));
    const latestByKey = new Map();
    toolParts.forEach((part, index) => latestByKey.set(part.key, index));
    const recentStart = Math.max(0, toolParts.length - recentCount);

    let toolIndex = 0;
    for (const message of parsed) {
        const rendered = [];
        for (const part of message._parts) {
            if (!part.tool) {
                rendered.push(part.text);
                continue;
            }
            const currentIndex = toolIndex++;
            if (latestByKey.get(part.key) !== currentIndex) {
                rendered.push(
                    `Earlier ${part.tool} call superseded by a newer result for the same input.\n`,
                );
                continue;
            }
            const limit = currentIndex >= recentStart ? recentLimit : staleLimit;
            rendered.push(part.prefix + headTail(part.result, limit));
        }
        message.content = headTail(rendered.join(""), messageLimit);
        delete message._parts;
    }

    // Drop exact repeated non-system messages, preserving their newest copy.
    const seen = new Set();
    const deduped = [];
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
        const message = parsed[index];
        const fingerprint = `${message.role}:${asText(message.content)}`;
        if (message.role !== "system" && seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        deduped.push(message);
    }
    deduped.reverse();

    let total = deduped.reduce((sum, message) => sum + asText(message.content).length, 0);
    for (let index = 0; total > contextLimit && index < deduped.length - 1; index += 1) {
        const message = deduped[index];
        if (message.role === "system") continue;
        const before = asText(message.content).length;
        const allowance = Math.max(300, before - (total - contextLimit));
        message.content = headTail(asText(message.content), allowance);
        total -= before - asText(message.content).length;
    }
    return deduped;
}

class RTKContextGovernor {
    constructor(options) {
        this.name = "rtk-context-governor";
        this.options = options || {};
    }

    async transformRequestIn(request) {
        return this._govern(request);
    }

    async transformRequestOut(request) {
        return this._govern(request);
    }

    _govern(request) {
        const body = request?.body ? request.body : request;
        if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return request;
        body.messages = governMessages(body.messages, this.options);
        return request;
    }
}

module.exports = RTKContextGovernor;
module.exports.governMessages = governMessages;
