/**
 * Lazy provider-customer creation for autopay subscriptions.
 *
 * Razorpay's Subscriptions API allows omitting `customer_id`, but UPI
 * Autopay then can't generate a valid mandate Intent — the hosted page's
 * QR loops on "Refresh QR" forever. Card eMandate tolerates the missing
 * binding (it collects the customer inline) but UPI does not.
 *
 * To make both rails work without UX divergence, we mint a Razorpay
 * customer record on the first autopay checkout for any given local
 * customer row, then cache the returned `cust_…` id in
 * `customers.provider_customer_id` so subsequent checkouts reuse it.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { PaymentProvider } from "./providers/types";
import {
    getCustomerForProviderCreate,
    setCustomerProviderId,
} from "./repo";

export interface EnsureProviderCustomerResult {
    providerCustomerId: string;
    /** True if we just minted a new customer upstream (vs. returned cached id). */
    created: boolean;
}

/**
 * Returns the provider customer id for a local customer row, creating
 * it upstream on the first call. Idempotent — subsequent calls return
 * the cached id from D1 without hitting the provider.
 */
export async function ensureProviderCustomer(
    db: D1Database,
    provider: PaymentProvider,
    customerId: string,
): Promise<EnsureProviderCustomerResult> {
    const customer = await getCustomerForProviderCreate(db, customerId);
    if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
    }
    if (customer.provider_customer_id) {
        return {
            providerCustomerId: customer.provider_customer_id,
            created: false,
        };
    }

    // Razorpay requires a non-empty `name`. Fall back to the part of the
    // email before '@', or to the external_uid (always present), so we
    // never POST with an empty name.
    const name =
        (customer.name && customer.name.trim()) ||
        (customer.email && customer.email.split("@")[0]) ||
        customer.external_uid;

    const result = await provider.createCustomer({
        name,
        email: customer.email ?? undefined,
        referenceId: customer.id,
    });

    await setCustomerProviderId(db, customerId, result.providerCustomerId);
    return { providerCustomerId: result.providerCustomerId, created: true };
}
