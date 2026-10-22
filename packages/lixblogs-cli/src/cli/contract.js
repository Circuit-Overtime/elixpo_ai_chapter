export const EXIT_CODES = Object.freeze({
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  CONFLICT: 3,
  AUTH: 4,
  CONFIRMATION: 5,
});

const TOP_LEVEL_ALIASES = Object.freeze({
  login: ['auth', 'login'],
  logout: ['auth', 'logout'],
  whoami: ['auth', 'whoami'],
  profiles: ['auth', 'profiles'],
  use: ['auth', 'use'],
});

export function normalizeCommand(positionals) {
  const [command, ...rest] = positionals;
  const alias = TOP_LEVEL_ALIASES[command];
  return alias ? [...alias, ...rest] : positionals;
}

export function errorEnvelope(error, fallbackCode = 'cli_error') {
  if (error && typeof error === 'object' && error.error && !Array.isArray(error.error)) return error;
  const value = error && typeof error === 'object' ? error : { message: String(error || 'Command failed.') };
  return {
    ok: false,
    error: {
      code: value.code || fallbackCode,
      message: value.message || 'Command failed.',
      hint: value.hint || null,
      requestId: value.requestId || null,
      ...(value.details ? { details: value.details } : {}),
    },
  };
}

export function requireConfirmation(options, action) {
  if (options.yes) return;
  const error = new Error(`${action} requires --yes in non-interactive operation.`);
  error.code = 'confirmation_required';
  error.hint = `Review the operation, then run it again with --yes.`;
  error.exitCode = EXIT_CODES.CONFIRMATION;
  throw error;
}
