/**
 * providerFactory.js — the single place an AuthProvider gets constructed.
 *
 * Every call site that needs an AuthProvider goes through here, not through
 * `new MockAuthProvider()` directly, so the production gate (see
 * ../auth/productionGate.js) is impossible to bypass by accident. This is
 * intentionally a single narrow chokepoint.
 */

import { MockAuthProvider } from "../auth/MockAuthProvider.js";
import { ElixpoAuthProvider } from "../auth/ElixpoAuthProvider.js";
import { assertProviderAllowed } from "../auth/productionGate.js";

/**
 * @param {{ environment: string, authProvider: string, accountsBaseUrl?: string, clientId?: string, audience?: string }} config
 * @returns {import("../auth/AuthProvider.js").AuthProvider}
 */
export function createAuthProvider(config) {
  if (config.authProvider === "mock" && config.environment === "production") {
    throw new Error("The mock auth provider cannot run in production.");
  }
  if (config.authProvider !== "mock" && config.authProvider !== "elixpo") {
    throw new Error(`Unknown auth provider "${config.authProvider}".`);
  }

  const provider = config.authProvider === "mock"
    ? new MockAuthProvider()
    : new ElixpoAuthProvider({
      accountsBaseUrl: config.accountsBaseUrl,
      clientId: config.clientId,
      audience: config.audience,
      cliVersion: config.cliVersion || "1.2.0",
      fetchImpl: config.fetchImpl,
    });

  assertProviderAllowed({
    providerId: provider.providerId,
    environment: config.environment,
  });

  return provider;
}
