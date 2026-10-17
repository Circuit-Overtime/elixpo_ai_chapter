/**
 * Provider adapter interface. P0 implements Razorpay; Stripe/PayPal/etc. slot
 * in behind the same shape later (the plan's adapter pattern).
 */

export interface CreateOrderInput {
    /** Minor units (paise/cents). */
    amount: number;
    currency: string;
    /** Our checkout session id, passed through for reconciliation. */
    receipt: string;
    notes?: Record<string, string>;
    /**
     * Razorpay Route transfers — splits the captured amount to a merchant's
     * linked account (`{ account: "acc_…", amount, currency, … }`). Foundation:
     * passed through when present; the connect flow that populates it lands in a
     * follow-up. Undefined → funds settle to the platform account as today.
     */
    transfers?: Array<Record<string, unknown>>;
}

export interface CreateOrderResult {
    providerOrderId: string;
    amount: number;
    currency: string;
    raw: unknown;
}

export interface NormalizedWebhookEvent {
    /** Provider's unique event id (for replay de-dup). */
    eventId: string | null;
    type: string;
    /** True when this event means "money captured, fulfill now". */
    isPaymentCaptured: boolean;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    amount: number | null;
    currency: string | null;
    raw: unknown;
    /**
     * Subscription metadata — populated on subscription.* events. Null on
     * one-time `payment.captured` / `order.paid` events, so callers can
     * branch on (providerSubscriptionId !== null) to route into the
     * recurring fulfillment path.
     */
    providerSubscriptionId?: string | null;
    /** 'activated' | 'charged' | 'cancelled' | 'halted' | 'paused' | 'completed' | null */
    subscriptionStatus?: string | null;
}

export interface CreatePlanInput {
    /** Display name shown on the provider catalog (e.g. "Indie — Monthly"). */
    name: string;
    /** Optional longer description. */
    description?: string;
    /** Minor units (paise/cents). */
    amount: number;
    currency: string;
    /** `day` | `week` | `month` | `year` — provider may normalise these. */
    interval: "day" | "week" | "month" | "year";
    /** How many `interval` units per billing cycle (default 1). */
    intervalCount?: number;
    /** Internal price id, passed through for reconciliation if the provider supports notes. */
    referenceId?: string;
}

export interface CreatePlanResult {
    providerPlanId: string;
    raw: unknown;
}

export interface CreateSubscriptionInput {
    /** Provider plan id returned from `createPlan`. */
    providerPlanId: string;
    /** How many billing cycles to charge before auto-completing. Razorpay
     *  requires this (cap of 12*15=180 for monthly); pass a large number
     *  for "indefinite" (Razorpay's API maxes out — we re-create the sub
     *  if the user is still active when total_count is reached). */
    totalCount: number;
    /** Provider customer id (e.g. cust_xxx for Razorpay). Optional for
     *  Card eMandate, but REQUIRED for UPI Autopay — without it Razorpay's
     *  hosted mandate page can't generate a valid UPI Intent and the QR
     *  loops on "Refresh QR" forever. */
    providerCustomerId?: string;
    /** Customer-facing notify channels — Razorpay can email/SMS the buyer.
     *  Default false to keep our own notification flow authoritative. */
    notifyEmail?: boolean;
    /** Free-form key/value notes that come back on subscription.* webhooks
     *  so we can reconcile to our checkout_session / subscription rows. */
    notes?: Record<string, string>;
}

export interface CreateCustomerInput {
    /** Buyer's display name. Razorpay requires non-empty; we default to
     *  the part of the email before '@' if no name is given. */
    name: string;
    email?: string;
    /** E.164-formatted phone number. Optional; helpful for SMS receipts. */
    contact?: string;
    /** Internal reference id (e.g. our customer row id) — passed through
     *  on notes so we can correlate if needed. */
    referenceId?: string;
}

export interface CreateCustomerResult {
    providerCustomerId: string;
    raw: unknown;
}

export interface CreateSubscriptionResult {
    providerSubscriptionId: string;
    /** Hosted-checkout short URL the buyer is redirected to. */
    shortUrl: string;
    /** active | created | authenticated | activated | … (provider's status string) */
    status: string;
    raw: unknown;
}

export interface PaymentProvider {
    readonly name: string;
    createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
    /** Verify the client-side handback signature (order|payment). */
    verifyPaymentSignature(
        orderId: string,
        paymentId: string,
        signature: string,
    ): Promise<boolean>;
    /** Verify an inbound webhook's raw body against its signature header. */
    verifyWebhookSignature(
        rawBody: string,
        signature: string,
    ): Promise<boolean>;
    /** Parse a verified webhook body into a normalized event. */
    parseWebhook(rawBody: string, headers: Headers): NormalizedWebhookEvent;
    /**
     * Create a recurring billing plan on the provider. Lazily called once
     * per (price) row — `provider_plan_id` is cached on `prices` so we
     * don't re-create on every checkout.
     */
    createPlan(input: CreatePlanInput): Promise<CreatePlanResult>;
    /**
     * Create a Subscription against an existing plan. Returns a hosted
     * checkout URL the buyer is redirected to (so we don't have to build
     * a custom mandate-collection UI).
     */
    createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult>;
    /**
     * Cancel a subscription. Use `cancelAtCycleEnd=true` for graceful
     * downgrades (buyer keeps access through the period they paid for);
     * false stops billing immediately and expires the entitlement
     * straight away.
     */
    cancelSubscription(
        providerSubscriptionId: string,
        cancelAtCycleEnd?: boolean,
    ): Promise<{ status: string; raw: unknown }>;
    /**
     * Fetch a subscription. Returns its current status + the canonical
     * short_url (Razorpay regenerates this on every GET, so it's safe to
     * use for retries even after the buyer has interacted with the
     * mandate page once).
     */
    getSubscription(
        providerSubscriptionId: string,
    ): Promise<{ status: string; shortUrl: string | null; raw: unknown }>;
    /**
     * Create a buyer record on the provider, used as the customer
     * binding for subscription mandates. Lazily called once per local
     * customer row — `provider_customer_id` is cached afterwards.
     */
    createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
}
