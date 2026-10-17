import { SignJWT, jwtVerify } from 'jose';

// Define the Cloudflare KV binding interface
export interface AuthEnv {
  ELIXPO_SESSIONS: KVNamespace;
  JWT_SECRET: string;
}

export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function createSession(
  sessionData: Omit<Session, 'id'>,
  env: AuthEnv
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: Session = { ...sessionData, id: sessionId };

  // Store in KV with an expiration equivalent to the refresh token life (e.g., 30 days)
  await env.ELIXPO_SESSIONS.put(sessionId, JSON.stringify(session), {
    expirationTtl: 60 * 60 * 24 * 30, // 30 days
  });

  // Create an encrypted JWT for the cookie, wrapping the session ID
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const jwt = await new SignJWT({ sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);

  return jwt;
}

export async function validateSession(
  jwt: string,
  env: AuthEnv
): Promise<Session | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(jwt, secret);
    const sessionId = payload.sessionId as string;

    if (!sessionId) return null;

    const sessionStr = await env.ELIXPO_SESSIONS.get(sessionId);
    if (!sessionStr) return null;

    return JSON.parse(sessionStr) as Session;
  } catch (err) {
    // JWT verification failed or KV read failed
    return null;
  }
}

export async function invalidateSession(jwt: string, env: AuthEnv): Promise<void> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(jwt, secret);
    const sessionId = payload.sessionId as string;

    if (sessionId) {
      await env.ELIXPO_SESSIONS.delete(sessionId);
    }
  } catch (err) {
    // Ignore invalid JWTs on logout
  }
}
