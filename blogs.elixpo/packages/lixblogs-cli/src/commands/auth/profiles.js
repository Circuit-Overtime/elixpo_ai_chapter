/** List known profiles without exposing credentials. */
export async function authProfiles({ credentialStore, profileRegistry }) {
  const activeProfile = await profileRegistry.getActive();
  const profileIds = await credentialStore.listProfiles();
  const profiles = [];
  for (const profileId of profileIds) {
    const credentials = await credentialStore.get(profileId);
    profiles.push({
      profileId,
      active: profileId === activeProfile,
      loggedIn: Boolean(credentials),
      expired: credentials ? Date.now() >= credentials.expiresAt : undefined,
      scopes: credentials?.scopes || [],
    });
  }
  return { activeProfile, profiles };
}

/** Select the profile used when --profile is omitted. */
export async function authUse({ credentialStore, profileRegistry, profileId }) {
  const credentials = await credentialStore.get(profileId);
  if (!credentials) {
    return { ok: false, reason: `Profile "${profileId}" is not logged in.` };
  }
  await profileRegistry.setActive(profileId);
  return { ok: true, profileId };
}
