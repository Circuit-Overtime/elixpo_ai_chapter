import { validateProfileId } from "../../config/ProfileRegistry.js";

/** Resolve the authenticated Accounts username without persisting a temporary profile. */
export async function profileAliasFromIdentity({
  accessToken,
  apiBaseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const endpoint = new URL("/api/v1/me", apiBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("LixBlogs could not resolve the signed-in username.");
  }

  if (!response.ok || typeof payload?.data?.username !== "string") {
    throw new Error(payload?.error?.message || "LixBlogs could not resolve the signed-in username.");
  }

  return validateProfileId(payload.data.username);
}
