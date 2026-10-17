/**
 * Payment fulfillment — the single path that turns a captured charge into a
 * grant. Called by BOTH the client-side handback (instant UX) and the Razorpay
 * webhook (authoritative). Idempotent: the transaction unique index means the
 * second caller is a no-op and we never double-grant.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { applyGrant, type EntitlementView, toView } from "./entitlements";
import {
    completeSession,
    getWebhookEndpoint,
    recordRevenueLedger,
    recordTransaction,
    upsertOneTimeSubscription,
} from "./repo";
import { fireEntitlementUpdated, firePaymentCaptured } from "./webhooks";

function periodDaysFromInterval(interval: string, count: number): number {
    const base =
        interval === "day"
            ? 1
            : interval === "week"
              ? 7
              : interval === "year"
                ? 365
                : 30; // month
    return base * Math.max(1, count);
}

export interface FulfillInput {
    session: any; // checkout_sessions row
    appSlug: string;
    providerOrderId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
    raw?: unknown;
}

export interface FulfillResult {
    alreadyFulfilled: boolean;
    entitlement: EntitlementView;
}

export async function fulfillPayment(
    db: D1Database,
    input: FulfillInput,
): Promise<FulfillResult> {
    const { session } = input;

    // 1. Record the transaction idempotently.
    const txn = await recordTransaction(db, {
        appId: session.app_id,
        customerId: session.customer_id,
        checkoutSessionId: session.id,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        currency: input.currency,
        amount: input.amount,
        status: "captured",
        raw: input.raw,
    });

    if (!txn.created) {
        // Already fulfilled by the other path — return current state, no re-grant.
        const ent = await applyGrantNoop(db, session, input.appSlug);
        return { alreadyFulfilled: true, entitlement: ent };
    }

    // 2. Ledger discipline (minimal balanced pair).
    await recordRevenueLedger(
        db,
        session.app_id,
        txn.id,
        input.currency,
        input.amount,
    );

    // 3. Resolve tier + period from the product/price on the session.
    let tier = "member";
    let periodDays = 30;
    if (session.product_id) {
        const product = (await db
            .prepare("SELECT tier FROM products WHERE id = ?")
            .bind(session.product_id)
            .first()) as { tier: string } | null;
        if (product?.tier) tier = product.tier;
    }
    if (session.price_id) {
        const price = (await db
            .prepare("SELECT interval, interval_count FROM prices WHERE id = ?")
            .bind(session.price_id)
            .first()) as { interval: string; interval_count: number } | null;
        if (price)
            periodDays = periodDaysFromInterval(
                price.interval,
                price.interval_count,
            );
    }

    // 4. Roll the subscription period forward.
    const sub = await upsertOneTimeSubscription(db, {
        appId: session.app_id,
        customerId: session.customer_id,
        productId: session.product_id,
        priceId: session.price_id,
        tier,
        periodDays,
    });

    // 5. Apply the entitlement grant (+ immutable grant log).
    const entRow = await applyGrant(db, {
        appId: session.app_id,
        externalUid: session.external_uid,
        customerId: session.customer_id,
        subscriptionId: sub.id,
        transactionId: txn.id,
        tier,
        expiresAt: sub.periodEnd,
    });

    // 6. Close the session.
    await completeSession(db, session.id, txn.id);

    const view = toView(input.appSlug, entRow, session.external_uid);

    // 7. Notify the consuming app (best-effort; logged either way). Each call is
    //    a no-op unless the endpoint is subscribed to that event type.
    const endpoint = await getWebhookEndpoint(db, session.app_id);
    if (endpoint) {
        await fireEntitlementUpdated(db, endpoint, view);
        await firePaymentCaptured(db, endpoint, {
            app: input.appSlug,
            uid: session.external_uid,
            transaction_id: txn.id,
            provider_payment_id: input.providerPaymentId,
            provider_order_id: input.providerOrderId,
            currency: input.currency,
            amount: input.amount,
            tier,
        });
    }

    return { alreadyFulfilled: false, entitlement: view };
}

async function applyGrantNoop(
    db: D1Database,
    session: any,
    appSlug: string,
): Promise<EntitlementView> {
    const row = (await db
        .prepare(
            "SELECT * FROM entitlements WHERE app_id = ? AND external_uid = ?",
        )
        .bind(session.app_id, session.external_uid)
        .first()) as any;
    return toView(appSlug, row, session.external_uid);
}
