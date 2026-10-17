// Shared username (handle) validation — used by the availability check route
// and the /api/auth/me PATCH handler so the rules stay in one place.

// 3–32 chars, lowercase alnum plus - and _, must start and end alphanumeric,
// no consecutive separators. Stored lowercase (canonical).
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|[-_](?![-_])){1,30}[a-z0-9]$/;

// Reserved handles that collide with routes or are confusing as profiles.
const RESERVED = new Set([
    "admin",
    "administrator",
    "root",
    "api",
    "oauth",
    "sso",
    "auth",
    "dashboard",
    "login",
    "logout",
    "register",
    "signup",
    "signin",
    "settings",
    "setup-name",
    "verify",
    "callback",
    "authorize",
    "me",
    "profile",
    "user",
    "users",
    "account",
    "accounts",
    "elixpo",
    "support",
    "help",
    "about",
    "docs",
    "null",
    "undefined",
    "system",
    "staff",
]);

export function normalizeUsername(raw: string): string {
    return (raw || "").trim().toLowerCase();
}

// Returns { ok: true } or { ok: false, reason } — reason is user-facing.
export function validateUsername(
    raw: string,
): { ok: true; value: string } | { ok: false; reason: string } {
    const value = normalizeUsername(raw);
    if (value.length < 3)
        return { ok: false, reason: "Username must be at least 3 characters." };
    if (value.length > 32)
        return {
            ok: false,
            reason: "Username must be 32 characters or fewer.",
        };
    if (!USERNAME_RE.test(value)) {
        return {
            ok: false,
            reason: "Use lowercase letters, numbers, - and _ only; start and end with a letter or number.",
        };
    }
    if (RESERVED.has(value))
        return { ok: false, reason: "That username is reserved." };
    return { ok: true, value };
}
