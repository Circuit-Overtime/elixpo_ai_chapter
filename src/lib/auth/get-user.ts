import {
  parseSessionCookie,
  getUserInfo,
  refreshTokens,
} from "@/lib/auth";

export async function getAuthenticatedUser(cookieHeader: string | null) {
  const session = parseSessionCookie(cookieHeader);

  if (!session) {
    return null;
  }

  let user = await getUserInfo(session.accessToken);

  if (user) {
    return user;
  }

  const newTokens = await refreshTokens(session.refreshToken);

  if (!newTokens) {
    return null;
  }

  user = await getUserInfo(newTokens.access_token);

  return user;
}
