/**
 * Lazy provider-plan creation for recurring prices.
 *
 * Razorpay Plans are immutable once created and are 1:1 with our price rows.
 * Rather than minting the Plan at price-creation time (which would require the
 * provider keys to be available + the network reachable during a dashboard
 * POST), we create it on demand the first time a checkout is initiated for a
 * recurring price, and cache the returned id on `prices.provider_plan_id`.
 *
 * The cache is persisted in D1 so this only ever hits Razorpay once per price.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { PaymentProvider } from "./providers/types";
import { getPriceById, setPricePlanId } from "./repo";

export interface EnsurePlanInput {
    db: D1Database;
    provider: PaymentProvider;
    priceId: string;
    /** Display name for the upstream catalog. Defaults to `tier — interval`. */
    planName?: string;
}

export interface EnsurePlanResult {
    providerPlanId: string;
    /** True if we just created the plan upstream (vs. returned the cached id). */
    created: boolean;
}

/**
 * Returns the provider plan id for a recurring price, creating it on the
 * first call. Throws if the price row is missing or not type='recurring'.
 */
export async function ensurePlanForPrice(
    input: EnsurePlanInput,
): Promise<EnsurePlanResult> {
    const price = await getPriceById(input.db, input.priceId);
    if (!price) {
        throw new Error(`Price ${input.priceId} not found`);
    }
    if (price.type !== "recurring") {
        throw new Error(
            `Price ${input.priceId} is type='${price.type}', not 'recurring'`,
        );
    }
    if (price.provider_plan_id) {
        return { providerPlanId: price.provider_plan_id, created: false };
    }

    // Fetch the parent product so we can use its tier in the plan name —
    // makes the Razorpay catalog readable when debugging webhook payloads.
    const product = (await input.db
        .prepare("SELECT name, tier FROM products WHERE id = ?")
        .bind(price.product_id)
        .first()) as { name: string; tier: string } | null;

    const tier = product?.tier ?? "tier";
    const productName = product?.name ?? "Subscription";
    const interval = price.interval as "day" | "week" | "month" | "year";
    const intervalCount = price.interval_count;

    const planName =
        input.planName ??
        `${productName} — ${formatInterval(interval, intervalCount)}`;

    const result = await input.provider.createPlan({
        name: planName,
        description: `${tier} — auto-pay, ${formatInterval(interval, intervalCount)}`,
        amount: price.unit_amount,
        currency: price.currency,
        interval,
        intervalCount,
        referenceId: price.id,
    });

    await setPricePlanId(input.db, input.priceId, result.providerPlanId);
    return { providerPlanId: result.providerPlanId, created: true };
}

function formatInterval(interval: string, count: number): string {
    const unit = count === 1 ? interval : `${interval}s`;
    return count === 1 ? `Every ${interval}` : `Every ${count} ${unit}`;
}
