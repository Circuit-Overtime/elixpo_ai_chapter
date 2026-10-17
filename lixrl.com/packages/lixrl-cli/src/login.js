import { LixrlClient } from './client.js';

export async function findValidLocalLogin({
  credentials,
  profile,
  apiUrl,
  force = false,
  directKeyLogin = false,
  Client = LixrlClient,
}) {
  if (force || directKeyLogin) return null;
  const key = await credentials.get(profile);
  if (!key) return null;

  try {
    const user = await new Client({ apiUrl, apiKey: key }).me();
    return { user };
  } catch (error) {
    if (error?.code === 'login_required') return null;
    throw error;
  }
}
