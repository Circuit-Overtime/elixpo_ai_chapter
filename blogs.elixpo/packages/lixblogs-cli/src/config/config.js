/**
 * config.js — resolves runtime config for the CLI.
 *
 * Per #135: "Config precedence: flags → environment → named profile →
 * defaults." This module implements that precedence for the small set of
 * values the auth commands need right now (environment, active profile,
 * API base URL placeholder for later). It's deliberately minimal — full
 * config-file/profile-file handling belongs to a later CLI-shell issue,
 * not this one.
 */

const DEFAULTS = {
  environment: "production",
  profile: "default",
  accountsBaseUrl: "https://accounts.elixpo.com",
  apiBaseUrl: "https://blogs.elixpo.com",
};

const ENVIRONMENT_CLIENTS = {
  development: { clientId: "lixblogs-cli-dev", audience: "localhost" },
  staging: { clientId: "lixblogs-cli-staging", audience: "staging.blogs.elixpo.com" },
  production: { clientId: "lixblogs-cli-prod", audience: "blogs.elixpo.com" },
  test: { clientId: "lixblogs-cli-dev", audience: "localhost" },
};

/**
 * @param {Object} params
 * @param {Object} [params.flags] - parsed CLI flags, e.g. { profile, env }
 * @param {NodeJS.ProcessEnv} [params.env] - defaults to process.env
 * @returns {{ environment: string, profile: string, configAllowsProduction: boolean }}
 */
export function resolveConfig({ flags = {}, env = process.env } = {}) {
  const environment =
    flags.env ?? env.LIXBLOGS_ENV ?? DEFAULTS.environment;

  const profile =
    flags.profile ?? env.LIXBLOGS_PROFILE ?? DEFAULTS.profile;

  const environmentClient = ENVIRONMENT_CLIENTS[environment] || ENVIRONMENT_CLIENTS.production;
  const authProvider =
    flags.authProvider ??
    env.LIXBLOGS_AUTH_PROVIDER ??
    (environment === "production" ? "elixpo" : "mock");
  const accountsBaseUrl =
    flags.accountsUrl ?? env.LIXBLOGS_ACCOUNTS_URL ?? DEFAULTS.accountsBaseUrl;
  const apiBaseUrl = flags.apiUrl ?? env.LIXBLOGS_API_URL ?? DEFAULTS.apiBaseUrl;
  const clientId = flags.clientId ?? env.LIXBLOGS_CLIENT_ID ?? environmentClient.clientId;
  const audience = flags.audience ?? env.LIXBLOGS_AUDIENCE ?? environmentClient.audience;

  return {
    environment,
    profile,
    profileExplicit: flags.profile !== undefined || env.LIXBLOGS_PROFILE !== undefined,
    authProvider,
    accountsBaseUrl,
    apiBaseUrl,
    clientId,
    audience,
  };
}
