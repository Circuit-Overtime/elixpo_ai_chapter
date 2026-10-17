import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, setSessionCookie, getRedirectUri } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  // Verify state
  const savedState = request.cookies.get("oauth_state")?.value;
  if (!savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/?error=invalid_state", request.url));
  }

  try {
    const redirectUri = getRedirectUri(request);
    const tokens = await exchangeCode(code, redirectUri);

    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.append("Set-Cookie", setSessionCookie(tokens.access_token, tokens.refresh_token, tokens.expires_in));
    // Clear oauth_state
    response.headers.append("Set-Cookie", `oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

    return response;
  } catch (err) {
    console.error("Callback error:", err);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
