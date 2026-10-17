/**
 * Prefixed opaque ids (Stripe-style) so an id is self-describing in logs.
 */

const PREFIXES = {
    merchant: "mer",
    app: "app",
    providerConnection: "pc",
    product: "prod",
    price: "price",
    customer: "cus",
    checkoutSession: "cs",
    transaction: "txn",
    subscription: "sub",
    entitlement: "ent",
    grant: "grant",
    webhookEndpoint: "whe",
    webhookDelivery: "whd",
    providerWebhookEvent: "pwe",
    ledger: "le",
    ledgerGroup: "leg",
    refund: "rfnd",
    payoutAccount: "pa",
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
    return new Date(Date.now() + days * 86_400_000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
}
