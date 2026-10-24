/**
 * LixBlogs org handles.
 *
 * LixBlogs puts usernames and org handles in one URL namespace
 * (blogs.elixpo.com/<name>). It takes each user's handle from this service and
 * cannot refuse it, so a username equal to an existing LixBlogs org shadows
 * that user's profile and posts there. That happened with `salonist`: the org
 * was created first and the username was picked here afterwards.
 *
 * LixBlogs refuses org handles that are Accounts usernames; this is the other
 * half, refusing usernames that are LixBlogs orgs.
 */

const LIXBLOGS_CHECK_NAME = "https://blogs.elixpo.com/api/check-name";

/**
 * True when `username` is an existing LixBlogs org handle.
 *
 * Fails open: Accounts is the sign-in service for every Elixpo app and must not
 * depend on the blog being up. LixBlogs also falls back to the user's posts
 * when an org shares their name, so a miss here degrades rather than breaks.
 *
 * Calls the plain check-name form on purpose: `for=org` makes LixBlogs ask
 * this service in turn, and the two would loop.
 */
export async function isLixBlogsOrgHandle(
    username: string,
    fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
    try {
        const res = await fetchImpl(
            `${LIXBLOGS_CHECK_NAME}?name=${encodeURIComponent(username)}`,
            { signal: AbortSignal.timeout(3000) },
        );
        if (!res.ok) return false;
        const body = (await res.json()) as { takenBy?: string };
        return body?.takenBy === "org";
    } catch {
        return false;
    }
}
