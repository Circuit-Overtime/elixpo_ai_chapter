/**
 * Prefixed opaque ids (Stripe-style) so an id is self-describing in logs.
 */

const PREFIXES = {
    tenant: "tenant",
    sender: "snd",
    alias: "alias", // an additional From identity on a sender (support@, accounts@…)
    product: "prod", // groups templates + holds client_id/shared-secret
    template: "tmpl",
    webhook: "whk", // named inbound trigger on a template (1:many); public endpoint
    delivery: "dlv", // a delivery log row
    attachment: "att", // a template attachment pointer (drive/url/variable)
    suppression: "sup", // an unsubscribed/suppressed recipient (per product)
    member: "wm", // a workspace member (user ↔ workspace with a role)
    invite: "inv", // a workspace invite link
} as const;

export type IdKind = keyof typeof PREFIXES;

export function newId(kind: IdKind): string {
    const rand = crypto.randomUUID().replace(/-/g, "");
    return `${PREFIXES[kind]}_${rand}`;
}

/** ISO-8601 UTC timestamp, matching the SQL `datetime('now')` style. */
export function nowIso(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** ISO timestamp `days` days from now (UTC, second precision). */
export function isoDaysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
}
