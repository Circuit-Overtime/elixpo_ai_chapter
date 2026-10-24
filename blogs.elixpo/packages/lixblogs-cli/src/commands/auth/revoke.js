/**
 * lixblogs auth revoke
 *
 * Revokes the token server-side (via the AuthProvider) AND clears local
 * storage. This is destructive — per #135, "destructive and publishing
 * scopes require clear consent" and "destructive commands cannot run
 * accidentally in a non-interactive session."
 *
 * This function does not itself prompt — that's the CLI shell's job
 * (interactive confirmation prompt, or requiring an explicit --yes flag in
 * non-interactive mode). This function requires the caller to have already
 * obtained consent and pass confirmed: true; if confirmed is not exactly
 * true, it refuses to proceed. This makes "forgot to check for consent"
 * impossible to do accidentally at the call site.
 */

/**
 * @param {Object} params
 * @param {import("../../auth/AuthProvider.js").AuthProvider} params.provider
 * @param {import("../../config/CredentialStore.js").CredentialStore} params.credentialStore
 * @param {string} params.profileId
 * @param {boolean} params.confirmed - must be exactly `true`; caller is
 *   responsible for having obtained real user consent before setting this.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function authRevoke({ provider, credentialStore, profileId, confirmed }) {
  if (confirmed !== true) {
    return {
      ok: false,
      reason:
        "Revoke was not confirmed. This is a destructive action and requires " +
        "explicit confirmation (interactive prompt, or --yes in a non-interactive session).",
    };
  }

  const credentials = await credentialStore.get(profileId);
  if (!credentials) {
    return { ok: false, reason: `No stored credentials for profile "${profileId}".` };
  }

  await provider.revoke({ token: credentials.refreshToken });
  await credentialStore.delete(profileId);

  return { ok: true };
}
