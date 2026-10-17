import { NextRequest, NextResponse } from "next/server";
import { parseSessionCookie, getUserInfo, refreshTokens, setSessionCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Dev mode: return a mock user so the UI works without real SSO
  if (process.env.DEV_SKIP_AUTH === "true") {
    return NextResponse.json({
      user: {
        id: "dev-user-local",
        email: "dev@elixpo.local",
        displayName: "Dev User",
        isAdmin: true,
        provider: "local",
        emailVerified: true,
      },
    });
  }

  const session = parseSessionCookie(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // Try with current access token
  let user = await getUserInfo(session.accessToken);

  if (user) {
    return NextResponse.json({ user });
  }

  // Access token expired — try refreshing
  const newTokens = await refreshTokens(session.refreshToken);
  if (!newTokens) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  user = await getUserInfo(newTokens.access_token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // Return user + set new session cookie
  const response = NextResponse.json({ user });
  response.headers.append("Set-Cookie", setSessionCookie(newTokens.access_token, newTokens.refresh_token, newTokens.expires_in));
  return response;
}
