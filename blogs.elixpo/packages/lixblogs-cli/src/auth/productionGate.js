/**
 * Production safety gate.
 *
 * Maintainer's explicit requirement (verbatim):
 *   "Production login must remain explicitly unavailable until the real
 *   issuer, polling, refresh, scope, and revocation contract is approved —
 *   no copied cookies or fallback credentials."
 *
 * This must fail loudly and immediately — not silently degrade, not warn
 * and continue. Every call site that constructs an AuthProvider must route
 * through assertProviderAllowed() first.
 *
 * Accounts now publishes the approved RFC 8628 contract, so production is
 * enabled only for ElixpoAuthProvider. The deterministic mock remains usable
 * in explicit development/test environments and can never cross this gate.
 */

const APPROVED_PRODUCTION_PROVIDER_ID = "elixpo";

export class ProductionAuthGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductionAuthGateError";
  }
}

/**
 * @param {{ providerId: string, environment: string }} params
 *   `environment` should come from explicit config, not inferred/guessed.
 */
export function assertProviderAllowed({ providerId, environment }) {
  const isProduction = environment === "production";

  if (!isProduction) {
    return; // any provider (including mock) is fine outside production
  }

  if (providerId !== APPROVED_PRODUCTION_PROVIDER_ID) {
    throw new ProductionAuthGateError(
      `Provider "${providerId}" is not approved for production. ` +
        `Only "${APPROVED_PRODUCTION_PROVIDER_ID}" may be used in production.`
    );
  }
}
