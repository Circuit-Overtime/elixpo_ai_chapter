/**
 * redact.js — token redaction, used everywhere output could leak a
 * credential: console output, --json output, thrown errors, crash reports.
 *
 * Per #135: "Never print tokens in logs, JSON output, telemetry, or crash
 * reports." This is a hard requirement, tested in redact.test.mjs — not
 * just documented.
 */

const REDACTED = "[REDACTED]";

/**
 * Recursively walks an object/array and replaces any value under a key
 * matching a known sensitive-field name with REDACTED. Also redacts string
 * values that look like tokens even under an unrecognized key, as a
 * defense-in-depth measure (e.g. someone renames a field and forgets to
 * update this list).
 */
const SENSITIVE_KEY_PATTERN = /token|refresh|secret|password|authorization/i;

// Matches our mock token shapes (mock-access-*, mock-refresh-*) as well as
// generic bearer-token-like strings, so redaction isn't solely dependent on
// key names.
const TOKEN_LIKE_VALUE_PATTERN = /^(mock-(access|refresh)-|lix_pat_|Bearer\s+)\S+/i;

export function redactValue(value) {
  if (typeof value === "string" && TOKEN_LIKE_VALUE_PATTERN.test(value)) {
    return REDACTED;
  }
  return value;
}

export function redactObject(input) {
  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item));
  }
  if (input && typeof input === "object") {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else if (typeof value === "object" && value !== null) {
        out[key] = redactObject(value);
      } else {
        out[key] = redactValue(value);
      }
    }
    return out;
  }
  return redactValue(input);
}

/**
 * Wraps JSON.stringify to redact sensitive fields before serialization.
 * Use this for --json output and any log line, never JSON.stringify directly
 * on data that might contain credentials.
 */
export function safeJsonStringify(input, space) {
  return JSON.stringify(redactObject(input), null, space);
}

/**
 * Wraps an error for safe display/logging — strips any token-like content
 * from the error message itself, not just structured fields, since error
 * messages are free-form strings that could accidentally interpolate a
 * token (e.g. "failed to refresh mock-refresh-abc123").
 */
export function redactErrorMessage(message) {
  if (typeof message !== "string") return message;
  return message.replace(
    /(mock-(access|refresh)-\S+|lix_pat_[A-Za-z0-9_-]+|Bearer\s+\S+)/gi,
    REDACTED
  );
}
