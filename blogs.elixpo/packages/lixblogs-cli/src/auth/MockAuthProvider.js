import { AuthProvider } from "./AuthProvider.js";

/**
 * MockAuthProvider — deterministic, in-memory device-flow simulation for
 * development and tests. Never talks to a real server.
 *
 * Per maintainer direction: this exists so CLI/UI work isn't blocked while
 * accounts.elixpo.com's device-flow support has no confirmed ETA. This must
 * never be reachable in a production configuration — see
 * assertNotProduction() in productionGate.js, which every provider
 * constructor call should be routed through at the call site.
 *
 * States simulated (mirroring "Device login, refresh, logout, revocation,
 * expiry, denial, and polling errors are tested" from #135's acceptance
 * criteria):
 *   - approved (successful login)
 *   - pending (still polling)
 *   - denied
 *   - expired
 *   - invalid/unknown device code
 *   - slow_down (RFC 8628 §3.5 style rate-limit signal)
 *   - refresh success / refresh failure
 *   - revoke
 *
 * Scenario selection is deterministic and driven by the deviceCode's prefix,
 * not randomness — so tests are reproducible. See SCENARIO_PREFIX below.
 *
 * --- Open questions from elixpo/blogs.elixpo#137, resolved by implementer ---
 * - Mock states: slow_down added (see above), matching RFC 8628 rather than
 *   inventing a bespoke rate-limit shape, so the real ElixpoAuthProvider can
 *   follow the same contract later.
 * - Polling/backoff: on slow_down, caller must increase its poll interval by
 *   SLOW_DOWN_INTERVAL_INCREASE_SECONDS before polling again. No other
 *   backoff logic in the mock itself — backoff is the CLI's responsibility,
 *   not the provider's.
 * Flagged for the maintainer to override if a different behavior is wanted.
 */

const SCENARIO_PREFIX = {
  APPROVE_IMMEDIATELY: "mock-approve-",
  PENDING_THEN_APPROVE: "mock-pending-then-approve-",
  DENY: "mock-deny-",
  EXPIRE: "mock-expire-",
  SLOW_DOWN_THEN_APPROVE: "mock-slow-down-then-approve-",
};

// Mirrors RFC 8628 §3.5: on slow_down, the client must increase its polling
// interval by this many seconds. Real ElixpoAuthProvider should follow the
// same contract so CLI polling logic doesn't need a provider-specific branch.
const SLOW_DOWN_INTERVAL_INCREASE_SECONDS = 5;

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}

export class MockAuthProvider extends AuthProvider {
  constructor() {
    super();
    /** @type {Map<string, { scenario: string, pollCount: number, createdAt: number, scopes: string[] }>} */
    this._devicesCodes = new Map();
    /** @type {Set<string>} revoked tokens */
    this._revoked = new Set();
    /** @type {Set<string>} tokens that will fail on next refresh (for testing refresh failure) */
    this._refreshWillFail = new Set();
  }

  get providerId() {
    return "mock";
  }

  /**
   * @param {{ scopes: string[], scenario?: keyof typeof SCENARIO_PREFIX }} params
   *   `scenario` lets tests/dev deterministically choose which path this
   *   device code will take. Defaults to APPROVE_IMMEDIATELY.
   */
  async requestDeviceCode({ scopes, scenario = "APPROVE_IMMEDIATELY" }) {
    const prefix = SCENARIO_PREFIX[scenario] ?? SCENARIO_PREFIX.APPROVE_IMMEDIATELY;
    const deviceCode = nextId(prefix);
    const userCode = deviceCode.slice(-6).toUpperCase();

    this._devicesCodes.set(deviceCode, {
      scenario,
      pollCount: 0,
      createdAt: Date.now(),
      scopes: [...scopes],
    });

    return {
      deviceCode,
      userCode,
      verificationUri: "https://mock.lixblogs.local/device",
      verificationUriComplete: `https://mock.lixblogs.local/device?user_code=${encodeURIComponent(userCode)}`,
      expiresInSeconds: scenario === "EXPIRE" ? 1 : 600,
      pollIntervalSeconds: 1,
    };
  }

  async pollDeviceCode({ deviceCode }) {
    const record = this._devicesCodes.get(deviceCode);

    if (!record) {
      // Unknown/invalid code — distinct from "expired": this code never existed.
      return { status: "denied" };
    }

    if (record.scenario === "EXPIRE") {
      return { status: "expired" };
    }

    if (record.scenario === "DENY") {
      return { status: "denied" };
    }

    if (record.scenario === "PENDING_THEN_APPROVE") {
      record.pollCount += 1;
      if (record.pollCount < 2) {
        return { status: "pending" };
      }
      // fall through to approve on the 2nd+ poll
    }

    if (record.scenario === "SLOW_DOWN_THEN_APPROVE") {
      record.pollCount += 1;
      if (record.pollCount < 2) {
        return {
          status: "slow_down",
          pollIntervalIncreaseSeconds: SLOW_DOWN_INTERVAL_INCREASE_SECONDS,
        };
      }
      // fall through to approve on the 2nd+ poll
    }

    return {
      status: "approved",
      token: {
        accessToken: `mock-access-${deviceCode}`,
        refreshToken: `mock-refresh-${deviceCode}`,
        expiresInSeconds: 3600,
        scopes: record.scopes,
      },
    };
  }

  async refresh({ refreshToken, scopes = [] }) {
    if (this._revoked.has(refreshToken)) {
      throw new Error("refresh token has been revoked");
    }
    if (this._refreshWillFail.has(refreshToken)) {
      throw new Error("mock refresh failure (test-injected)");
    }
    return {
      accessToken: `mock-access-refreshed-${refreshToken}`,
      refreshToken,
      expiresInSeconds: 3600,
      scopes,
    };
  }

  async revoke({ token }) {
    // Must not throw if already revoked — revocation is idempotent.
    this._revoked.add(token);
  }

  /** Test helper: force the next refresh() call for this token to fail. */
  _simulateRefreshFailureFor(refreshToken) {
    this._refreshWillFail.add(refreshToken);
  }
}
