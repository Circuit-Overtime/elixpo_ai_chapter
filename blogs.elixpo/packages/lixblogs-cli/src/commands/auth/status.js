/**
 * lixblogs auth status
 *
 * Shows whether the given profile (or all profiles) is logged in, and
 * whether its token is expired. Never prints the token itself — only
 * derived, safe-to-display metadata (per #135's redaction requirement).
 */

/**
 * @param {Object} params
 * @param {import("../../config/CredentialStore.js").CredentialStore} params.credentialStore
 * @param {string} [params.profileId] - if omitted, reports on all profiles
 * @returns {Promise<Array<{ profileId: string, loggedIn: boolean, expired?: boolean, scopes?: string[] }>>}
 */
export async function authStatus({ credentialStore, profileId }) {
  const profileIds = profileId ? [profileId] : await credentialStore.listProfiles();

  const results = [];
  for (const id of profileIds) {
    const credentials = await credentialStore.get(id);
    if (!credentials) {
      results.push({ profileId: id, loggedIn: false });
      continue;
    }
    results.push({
      profileId: id,
      loggedIn: true,
      expired: Date.now() >= credentials.expiresAt,
      scopes: credentials.scopes,
    });
  }
  return results;
}
