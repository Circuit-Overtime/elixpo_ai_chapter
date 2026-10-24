/**
 * lixblogs auth login
 *
 * Per #135:
 * - Display verification URL, user code, expiry, and polling status;
 *   optionally open the browser
 * - Support multiple named accounts/profiles
 * - Destructive and publishing scopes require clear consent
 *
 * This command is deliberately provider-agnostic — it only calls the
 * AuthProvider interface, never a concrete implementation. In dev/tests
 * this is wired to MockAuthProvider; production wiring goes through
 * productionGate.assertProviderAllowed() before this ever runs (see
 * bin/lixblogs.mjs for where that check happens).
 */

import { redactErrorMessage } from "../../config/redact.js";

/**
 * @param {Object} params
 * @param {import("../../auth/AuthProvider.js").AuthProvider} params.provider
 * @param {import("../../config/CredentialStore.js").CredentialStore} params.credentialStore
 * @param {string} params.profileId - which named profile this login is for
 * @param {string[]} params.scopes - scopes being requested
 * @param {(url: string) => Promise<void>} [params.openBrowser] - optional browser opener
 * @param {(params: { accessToken: string, requestedProfileId: string }) => Promise<string>} [params.resolveProfileId]
 * @param {(ms: number) => Promise<void>} [params.sleep] - injectable for tests
 * @param {(...args: any[]) => void} [params.onStatus] - callback for UI updates (verification URL, polling status, etc.)
 * @returns {Promise<{ ok: true, profileId: string } | { ok: false, reason: string }>}
 */
export async function authLogin({
  provider,
  credentialStore,
  profileId,
  scopes,
  openBrowser,
  resolveProfileId,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onStatus = () => {},
}) {
  let deviceCode;
  try {
    deviceCode = await provider.requestDeviceCode({ scopes });
  } catch (err) {
    return { ok: false, reason: redactErrorMessage(err.message) };
  }

  onStatus({
    type: "verification_pending",
    verificationUri: deviceCode.verificationUri,
    verificationUriComplete: deviceCode.verificationUriComplete,
    userCode: deviceCode.userCode,
    expiresInSeconds: deviceCode.expiresInSeconds,
  });

  if (openBrowser) {
    await openBrowser(deviceCode.verificationUriComplete || deviceCode.verificationUri);
  }

  let pollIntervalMs = deviceCode.pollIntervalSeconds * 1000;
  const deadline = Date.now() + deviceCode.expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    let result;
    try {
      result = await provider.pollDeviceCode({ deviceCode: deviceCode.deviceCode });
    } catch (err) {
      return { ok: false, reason: redactErrorMessage(err.message) };
    }

    if (result.status === "approved") {
      let resolvedProfileId = profileId;
      if (resolveProfileId) {
        try {
          resolvedProfileId = await resolveProfileId({
            accessToken: result.token.accessToken,
            requestedProfileId: profileId,
          });
        } catch (err) {
          return { ok: false, reason: redactErrorMessage(err.message) };
        }
      }

      await credentialStore.set(resolvedProfileId, {
        accessToken: result.token.accessToken,
        refreshToken: result.token.refreshToken,
        expiresAt: Date.now() + result.token.expiresInSeconds * 1000,
        scopes: result.token.scopes,
      });
      onStatus({ type: "approved" });
      return { ok: true, profileId: resolvedProfileId };
    }

    if (result.status === "denied") {
      onStatus({ type: "denied" });
      return { ok: false, reason: "Login was denied." };
    }

    if (result.status === "expired") {
      onStatus({ type: "expired" });
      return { ok: false, reason: "Device code expired before login was approved." };
    }

    if (result.status === "slow_down") {
      pollIntervalMs += result.pollIntervalIncreaseSeconds * 1000;
      onStatus({ type: "slow_down", newIntervalMs: pollIntervalMs });
      continue;
    }

    // status === "pending" — keep polling
    onStatus({ type: "pending" });
  }

  return { ok: false, reason: "Device code expired before login was approved." };
}
