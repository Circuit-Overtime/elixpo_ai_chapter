import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getEnv } from '@/lib/db';

const ACCOUNTS_ORIGIN = 'https://accounts.elixpo.com';
const ACCOUNTS_ISSUER = ACCOUNTS_ORIGIN;
const LIXRL_AUDIENCE = 'lixrl.com';

interface AccountsMetadata {
  issuer: string;
  jwks_uri: string;
}

let metadataPromise: Promise<AccountsMetadata> | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function loadMetadata(): Promise<AccountsMetadata> {
  if (!metadataPromise) {
    metadataPromise = fetch(`${ACCOUNTS_ORIGIN}/.well-known/oauth-authorization-server`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Accounts discovery is unavailable');
      const value = await response.json() as Partial<AccountsMetadata>;
      if (value.issuer !== ACCOUNTS_ISSUER || typeof value.jwks_uri !== 'string') {
        throw new Error('Accounts discovery is invalid');
      }
      const jwksUrl = new URL(value.jwks_uri);
      if (jwksUrl.origin !== ACCOUNTS_ORIGIN) {
        throw new Error('Accounts returned an untrusted signing-key endpoint');
      }
      return { issuer: value.issuer, jwks_uri: jwksUrl.toString() };
    }).catch((error) => {
      metadataPromise = null;
      throw error;
    });
  }
  return metadataPromise;
}

export async function verifyCliAccountsAccessToken(token: string): Promise<void> {
  const clientId = getEnv().ELIXPO_LIXRL_CLI_CLIENT_ID;
  const metadata = await loadMetadata();
  if (!jwks) jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    algorithms: ['EdDSA'],
    issuer: metadata.issuer,
    audience: LIXRL_AUDIENCE,
    clockTolerance: 5,
  });
  if (
    protectedHeader.alg !== 'EdDSA' ||
    payload.type !== 'access' ||
    payload.client_id !== clientId ||
    !Array.isArray(payload.scopes) ||
    !payload.scopes.includes('openid') ||
    !payload.scopes.includes('profile') ||
    !payload.scopes.includes('email') ||
    !payload.scopes.includes('lixrl:keys:create')
  ) {
    throw new Error('Accounts access token claims are invalid');
  }
}
