/**
 * lixblogs auth logout
 *
 * Clears locally stored credentials for a profile. This is a *local*
 * operation — it does not revoke the token server-side (that's `revoke`).
 * A user who just wants to stop using this machine, without invalidating
 * the token everywhere, should be able to do that — this command is that
 * lighter-weight action. See revoke.js for the destructive, server-side
 * equivalent.
 */

/**
 * @param {Object} params
 * @param {import("../../config/CredentialStore.js").CredentialStore} params.credentialStore
 * @param {string} params.profileId
 * @returns {Promise<{ ok: true }>}
 */
export async function authLogout({ credentialStore, profileId }) {
  await credentialStore.delete(profileId);
  return { ok: true };
}
