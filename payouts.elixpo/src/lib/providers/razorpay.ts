/**
 * Razorpay (INR) adapter. P0 uses the one-time Orders API:
 * create an order, the client pays via Razorpay Checkout, and we fulfill on the
 * `payment.captured` webhook (the authoritative server-side signal).
 *
 * Docs: https://razorpay.com/docs/api/orders / .../webhooks
 */

import { hmacSha256Hex, timingSafeEqual, verifyHmacSha256Hex } from "../crypto";
import type {
    CreateCustomerInput,
    CreateCustomerResult,
    CreateOrderInput,
    CreateOrderResult,
    CreatePlanInput,
    CreatePlanResult,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    NormalizedWebhookEvent,
    PaymentProvider,
} from "./types";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export class RazorpayProvider implements PaymentProvider {
    readonly name = "razorpay";

    constructor(
        readonly keyId: string,
        private readonly keySecret: string,
        private readonly webhookSecret: string,
        readonly mode: "test" | "live" = "test",
    ) {}

    private authHeader(): string {
        // Basic auth: base64(key_id:key_secret)
        return `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`;
    }

    async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
        const res = await fetch(`${RAZORPAY_API}/orders`, {
            method: "POST",
            headers: {
                "Authorization": this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: input.amount,
                currency: input.currency,
                receipt: input.receipt,
                notes: input.notes ?? {},
                payment_capture: 1,
                // Razorpay Route split (only when a connected payout account
                // supplies transfers; otherwise omitted → settles to platform).
                ...(input.transfers?.length ? { transfers: input.transfers } : {}),
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay order create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }

        return {
            providerOrderId: raw.id,
            amount: raw.amount,
            currency: raw.currency,
            raw,
        };
    }

    /**
     * Create a Razorpay Route LINKED ACCOUNT (sub-merchant) from a merchant's
     * bank details, so payments can be split to them. Returns the `acc_…` id.
     * Throws with Razorpay's error description on failure (surfaced to the UI).
     */
    async createLinkedAccount(input: {
        email: string;
        name: string;
        beneficiaryName: string;
        ifsc: string;
        accountNumber: string;
        businessType?: string;
        accountType?: "current" | "savings";
    }): Promise<{ accountId: string; raw: any }> {
        const res = await fetch(`${RAZORPAY_API}/accounts`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: input.email,
                name: input.name,
                tnc_accepted: true,
                account_details: {
                    business_name: input.name,
                    business_type: input.businessType || "individual",
                },
                bank_account: {
                    ifsc_code: input.ifsc,
                    beneficiary_name: input.beneficiaryName,
                    account_type: input.accountType || "current",
                    account_number: input.accountNumber,
                },
            }),
        });
        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok || !raw?.id) {
            throw new Error(
                raw?.error?.description ||
                    `Razorpay linked-account create failed (${res.status})`,
            );
        }
        return { accountId: raw.id, raw };
    }

    /**
     * Client handback signature: HMAC_SHA256(key_secret, `${orderId}|${paymentId}`).
     * Razorpay Checkout returns razorpay_signature in the success callback.
     */
    async verifyPaymentSignature(
        orderId: string,
        paymentId: string,
        signature: string,
    ): Promise<boolean> {
        return verifyHmacSha256Hex(
            this.keySecret,
            `${orderId}|${paymentId}`,
            signature,
        );
    }

    /** Webhook signature: HMAC_SHA256(webhook_secret, rawBody) in X-Razorpay-Signature. */
    async verifyWebhookSignature(
        rawBody: string,
        signature: string,
    ): Promise<boolean> {
        const expected = await hmacSha256Hex(this.webhookSecret, rawBody);
        return timingSafeEqual(expected, (signature || "").trim());
    }

    parseWebhook(rawBody: string, headers: Headers): NormalizedWebhookEvent {
        const body = JSON.parse(rawBody);
        const type: string = body.event || "";
        const payment = body.payload?.payment?.entity;
        const order = body.payload?.order?.entity;
        const subscription = body.payload?.subscription?.entity;

        const isPaymentCaptured =
            type === "payment.captured" ||
            (type === "order.paid" && payment?.status === "captured");

        // Subscription lifecycle:
        //   subscription.activated  — mandate confirmed, first charge done
        //   subscription.charged    — recurring charge succeeded (renewal)
        //   subscription.cancelled  — buyer or merchant cancelled
        //   subscription.paused     — paused (Razorpay-side pause feature)
        //   subscription.halted     — repeated charge failures; buyer must
        //                             update payment method to resume
        //   subscription.completed  — ran out of total_count cycles
        // `subscription.charged` events arrive WITH a `payment.entity` too;
        // we treat them as both a subscription event AND a captured charge
        // so the same fulfillment path (`fulfillPayment`) extends the
        // entitlement and writes a ledger row per renewal.
        const isSubscriptionEvent = type.startsWith("subscription.");
        const subscriptionStatusFromType = isSubscriptionEvent
            ? type.split(".").slice(1).join(".")
            : null;

        return {
            eventId: headers.get("x-razorpay-event-id"),
            type,
            // subscription.charged carries a payment.entity → treat as captured
            isPaymentCaptured:
                isPaymentCaptured ||
                (type === "subscription.charged" &&
                    payment?.status === "captured"),
            providerOrderId: payment?.order_id || order?.id || null,
            providerPaymentId: payment?.id || null,
            amount: payment?.amount ?? order?.amount ?? null,
            currency: payment?.currency ?? order?.currency ?? null,
            raw: body,
            providerSubscriptionId:
                subscription?.id ?? payment?.subscription_id ?? null,
            subscriptionStatus: subscriptionStatusFromType,
        };
    }

    async createPlan(input: CreatePlanInput): Promise<CreatePlanResult> {
        // Razorpay Plans API: POST /v1/plans. Plans are immutable —
        // amount/period/interval can't be edited after creation, so we
        // make one plan per (price) row and reuse it for every
        // Subscription against that price.
        // Docs: https://razorpay.com/docs/api/payments/subscriptions/plans
        // Razorpay's Plans API expects the ADVERB form of the period —
        // 'daily' | 'weekly' | 'monthly' | 'yearly' — NOT the singular
        // noun like 'month'. Passing 'month' returns
        // HTTP 400 "Invalid argument for period passed". Our internal
        // schema uses the noun form (matches `prices.interval`), so we
        // map it here at the provider boundary.
        const PERIOD_MAP: Record<string, string> = {
            day: "daily",
            week: "weekly",
            month: "monthly",
            year: "yearly",
        };
        const period = PERIOD_MAP[input.interval] ?? "monthly";
        const interval = Math.max(1, input.intervalCount ?? 1);
        const res = await fetch(`${RAZORPAY_API}/plans`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                period,
                interval,
                item: {
                    name: input.name,
                    description: input.description ?? input.name,
                    amount: input.amount,
                    currency: input.currency,
                },
                notes: input.referenceId
                    ? { price_id: input.referenceId }
                    : undefined,
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay plan create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { providerPlanId: raw.id, raw };
    }

    /**
     * Razorpay enforces TWO ceilings on subscription length:
     *  1. `end_time` ≤ 2120-12-25 (Unix 4765046400) — global cap.
     *  2. UPI Autopay mandates ≤ 30 years from creation — RBI rule, the
     *     stricter of the two. Returns:
     *       "expire_at cannot be more than 30 years for upi"
     *  Card eMandate and bank eMandate also cap at 30 years per RBI.
     *
     * So 30 years (= 360 monthly cycles) is the practical universal max.
     * Plenty of headroom for any realistic SaaS subscription — buyers
     * who somehow run through 30 years of renewals can re-mint a new
     * subscription.
     */
    private safeTotalCount(input: CreateSubscriptionInput): number {
        const MONTHLY_CEILING = 360; // 30 years, RBI/UPI Autopay limit
        const requested = Math.max(1, input.totalCount);
        return Math.min(requested, MONTHLY_CEILING);
    }

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        // Razorpay Subscriptions API: POST /v1/subscriptions. Returns a
        // `short_url` that the buyer is redirected to — Razorpay's hosted
        // mandate-collection UX. After they approve, the activated webhook
        // fires and the first charge auto-runs.
        // Docs: https://razorpay.com/docs/api/payments/subscriptions/create-subscription
        const res = await fetch(`${RAZORPAY_API}/subscriptions`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                plan_id: input.providerPlanId,
                total_count: this.safeTotalCount(input),
                // Binding a customer pre-mandate is required for UPI
                // Autopay to work — without it the hosted page can't
                // generate a valid UPI Intent and the QR loops forever.
                ...(input.providerCustomerId
                    ? { customer_id: input.providerCustomerId }
                    : {}),
                // We drive all notification copy ourselves through
                // mails.elixpo (consistent branding + suppression list).
                customer_notify: input.notifyEmail ? 1 : 0,
                notes: input.notes ?? {},
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return {
            providerSubscriptionId: raw.id,
            shortUrl: raw.short_url,
            status: raw.status,
            raw,
        };
    }

    async getSubscription(
        providerSubscriptionId: string,
    ): Promise<{ status: string; shortUrl: string | null; raw: unknown }> {
        // GET /v1/subscriptions/{id} — returns the live subscription
        // including the canonical `short_url`. We use this for retries
        // (page reload, browser back) where the original short_url from
        // create-time wasn't persisted; constructing one from the sub_id
        // by string concat doesn't work — Razorpay's short URL uses a
        // separate ID namespace.
        const res = await fetch(
            `${RAZORPAY_API}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: this.authHeader(),
                    Accept: "application/json",
                },
            },
        );
        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription get failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return {
            status: raw.status,
            shortUrl: raw.short_url ?? null,
            raw,
        };
    }

    async cancelSubscription(
        providerSubscriptionId: string,
        cancelAtCycleEnd = false,
    ): Promise<{ status: string; raw: unknown }> {
        // POST /v1/subscriptions/{id}/cancel
        // cancel_at_cycle_end = 1 → keeps the entitlement until the period
        // they already paid for ends (graceful downgrade).
        // = 0 → cancels immediately, entitlement should expire now.
        const res = await fetch(
            `${RAZORPAY_API}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
            {
                method: "POST",
                headers: {
                    Authorization: this.authHeader(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
                }),
            },
        );

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription cancel failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { status: raw.status, raw };
    }

    async createCustomer(
        input: CreateCustomerInput,
    ): Promise<CreateCustomerResult> {
        // POST /v1/customers — Razorpay enforces `fail_existing=0` semantics
        // by default (returns the existing customer instead of 4xx if the
        // contact/email already exists), which makes this safe to call
        // repeatedly. We still cache the result ourselves to avoid the
        // round-trip on every checkout.
        // Docs: https://razorpay.com/docs/api/customers/create
        const body: Record<string, unknown> = {
            name: input.name,
            fail_existing: 0,
        };
        if (input.email) body.email = input.email;
        if (input.contact) body.contact = input.contact;
        if (input.referenceId) body.notes = { reference_id: input.referenceId };

        const res = await fetch(`${RAZORPAY_API}/customers`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay customer create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { providerCustomerId: raw.id, raw };
    }
}

/**
 * Build a Razorpay provider from env. Selects test vs live keys by RAZORPAY_MODE
 * (default "test"), preferring RAZORPAY_{TEST,LIVE}_* and falling back to the
 * legacy unsuffixed RAZORPAY_* vars. Returns null if no usable keys.
 */
export async function razorpayFromEnv(
    getEnv: (k: string) => Promise<string | undefined>,
): Promise<RazorpayProvider | null> {
    const mode =
        ((await getEnv("RAZORPAY_MODE")) || "test").toLowerCase() === "live"
            ? "live"
            : "test";
    const M = mode.toUpperCase();
    const pick = async (suffix: string) =>
        (await getEnv(`RAZORPAY_${M}_${suffix}`)) ||
        (await getEnv(`RAZORPAY_${suffix}`));

    const keyId = await pick("KEY_ID");
    const keySecret = await pick("KEY_SECRET");
    const webhookSecret = await pick("WEBHOOK_SECRET");
    if (!keyId || !keySecret) return null;
    return new RazorpayProvider(keyId, keySecret, webhookSecret || "", mode);
}
