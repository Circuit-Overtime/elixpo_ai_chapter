import { colorEnabled, failureBlock, successLine } from './ui.js';

export const EXIT_CODES = Object.freeze({ OK: 0, ERROR: 1, USAGE: 2, AUTH: 4, CONFIRMATION: 5 });

export function safeJson(value) {
  return JSON.stringify(value, (key, item) => /token|secret|api.?key|authorization/i.test(key) ? '[REDACTED]' : item, 2);
}

export function requireConfirmation(options, action) {
  if (!options.yes) {
    const error = new Error(`${action} requires --yes.`);
    error.code = 'confirmation_required';
    error.exitCode = EXIT_CODES.CONFIRMATION;
    throw error;
  }
}

export function emit(value, options = {}, message = 'Done') {
  if (options.json) process.stdout.write(`${safeJson({ ok: true, data: value })}\n`);
  else if (!options.quiet) {
    process.stdout.write(`${successLine(message, colorEnabled(process.stdout))}\n`);
    const details = format(value);
    if (details) process.stdout.write(`${details}\n`);
  }
}

export function fail(error, options = {}) {
  const payload = {
    ok: false,
    error: {
      code: error?.code || 'error',
      message: String(error?.message || error).replace(/elu_[A-Za-z0-9_-]+/g, '[REDACTED]'),
      ...(error?.requestId ? { requestId: error.requestId } : {}),
    },
  };
  if (options.json) process.stderr.write(`${safeJson(payload)}\n`);
  else if (!options.quiet) process.stderr.write(`${failureBlock({
    ...payload.error,
    details: error?.details,
  }, colorEnabled(process.stderr))}\n`);
  process.exitCode = error?.exitCode || (error?.code === 'login_required' ? EXIT_CODES.AUTH : EXIT_CODES.ERROR);
}

function format(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
  return Object.entries(value || {}).map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n');
}
