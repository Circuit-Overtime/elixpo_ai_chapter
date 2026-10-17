import { NextResponse } from "next/server";
import { getAuthorizationUrl, getRedirectUri } from "@/lib/auth";

export async function GET(request: Request) {
  const redirectUri = getRedirectUri(request);
  // Generate a random state for CSRF protection
  const state = crypto.randomUUID();

  const authUrl = getAuthorizationUrl(redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  // Store state in a short-lived cookie for verification on callback
  response.headers.append("Set-Cookie", `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
  return response;
}
