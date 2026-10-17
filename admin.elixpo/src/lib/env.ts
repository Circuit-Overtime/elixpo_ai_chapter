/**
 * Centralized env access. On Cloudflare Pages, secrets live on the request
 * context's `env`; in local dev they're on process.env. We try the binding
 * first, then fall back to process.env so the same getter works in both.
 * Mirrors payouts.elixpo's env helper.
 */

async function fromContext(name: string): Promise<string | undefined> {
    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const env = (getRequestContext() as any).env;
        if (env?.[name] != null) return String(env[name]);
    } catch {
        // not on Cloudflare runtime
    }
    return process.env[name];
}

export async function getEnv(name: string): Promise<string | undefined> {
    return fromContext(name);
}

export async function requireEnv(name: string): Promise<string> {
    const v = await fromContext(name);
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
}

/** Public app origin, e.g. https://admin.elixpo.com (no trailing slash). */
export async function appUrl(): Promise<string> {
    const v = (await getEnv("NEXT_PUBLIC_APP_URL")) || "http://localhost:3000";
    return v.replace(/\/$/, "");
}

/** Elixpo Accounts SSO base URL (no trailing slash). */
export async function accountsUrl(): Promise<string> {
    const v =
        (await getEnv("NEXT_PUBLIC_ACCOUNTS_URL")) ||
        "https://accounts.elixpo.com";
    return v.replace(/\/$/, "");
}

/** OAuth redirect URI registered with the Accounts OAuth app. */
export async function redirectUri(): Promise<string> {
    const v = await getEnv("NEXT_PUBLIC_REDIRECT_URL");
    if (v) return v;
    return `${await appUrl()}/api/auth/callback`;
}
