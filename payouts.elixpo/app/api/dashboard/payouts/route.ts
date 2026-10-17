export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import type { D1Database } from "@cloudflare/workers-types";
import { requireDashboard } from "@/lib/dashboard-auth";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/ids";
import { isPlatformMerchant, PLATFORM_COMMISSION_BPS } from "@/lib/merchant";
import { razorpayFromEnv } from "@/lib/providers/razorpay";

/**
 * Connected payout account (Razorpay Route) for the signed-in merchant.
 *
 *   GET    → current connection + status + routable revenue summary
 *   PUT    → connect / update bank details { beneficiary_name, account_number, ifsc, razorpay_account_id? }
 *   DELETE → disconnect
 *
 * Foundation stage: stores the connection and shows status. The live Razorpay
 * linked-account creation + split `transfers` are wired in a follow-up; until
 * the merchant's `razorpay_account_id` is set + active, funds keep settling to
 * the Elixpo platform account.
 */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function getAccount(db: D1Database, merchantId: string): Promise<any | null> {
    return db
        .prepare("SELECT * FROM payout_accounts WHERE merchant_id = ?")
        .bind(merchantId)
        .first();
}

function view(row: any | null) {
    if (!row) return null;
    return {
        beneficiary_name: row.beneficiary_name,
        bank_ifsc: row.bank_ifsc,
        bank_last4: row.bank_last4,
        razorpay_account_id: row.razorpay_account_id,
        commission_bps: row.commission_bps,
        status: row.status, // pending | active | disabled
    };
}

export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const row = await getAccount(db, merchantId);

    // Revenue that would route to the merchant once Route is live (captured, by currency).
    const revenue = await db
        .prepare(
            `SELECT t.currency AS currency, COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
             FROM transactions t JOIN apps a ON t.app_id = a.id
             WHERE a.merchant_id = ? AND t.status = 'captured'
             GROUP BY t.currency`,
        )
        .bind(merchantId)
        .all();

    return NextResponse.json(
        {
            account: view(row),
            routable: revenue.results ?? [],
            platform_commission_bps: PLATFORM_COMMISSION_BPS,
            // The platform owner's products settle directly — no payout connection.
            is_platform_owner: isPlatformMerchant(merchantId),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function PUT(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    // The platform owner doesn't connect a payout account — its products settle
    // directly to the platform Razorpay account.
    if (isPlatformMerchant(merchantId)) {
        return NextResponse.json(
            {
                error: "platform_owner",
                error_description:
                    "Your products settle directly to the platform account — no payout connection needed.",
            },
            { status: 400 },
        );
    }

    const body: any = await request.json().catch(() => ({}));
    const beneficiary = String(body.beneficiary_name || "").trim().slice(0, 120);
    const ifsc = String(body.ifsc || "").trim().toUpperCase();
    const accountNumber = String(body.account_number || "").replace(/\s/g, "");
    const businessType = String(body.business_type || "individual").trim();

    if (!beneficiary) {
        return NextResponse.json({ error: "missing_beneficiary" }, { status: 400 });
    }
    if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ error: "invalid_ifsc" }, { status: 400 });
    }
    if (!/^\d{6,18}$/.test(accountNumber)) {
        return NextResponse.json({ error: "invalid_account_number" }, { status: 400 });
    }

    // Only the last 4 of the account number are persisted (display only); the
    // full number is sent to Razorpay to create the linked account, not stored.
    const last4 = accountNumber.slice(-4);

    // Self-detection: if these are the PLATFORM OWNER's own bank details, this
    // isn't a third-party split — funds already belong in the platform account.
    // Mark it 'self' (settles directly, no Route split) and flag for ownership
    // verification instead of creating a duplicate linked account.
    const ownerAccount = ((await getEnv("ELIXPO_OWNER_BANK_ACCOUNT")) || "").replace(/\s/g, "");
    const ownerIfsc = ((await getEnv("ELIXPO_OWNER_BANK_IFSC")) || "").trim().toUpperCase();
    const isOwnerBank = !!ownerAccount && !!ownerIfsc && accountNumber === ownerAccount && ifsc === ownerIfsc;

    const existing = await getAccount(db, merchantId);
    let accountId: string | null = existing?.razorpay_account_id ?? null;
    let status: string = existing?.status ?? "pending";
    let createError: string | null = null;

    if (isOwnerBank) {
        // Don't create a linked account or split — needs ownership verification.
        accountId = null;
        status = "self";
    }

    // Create the Razorpay linked account from the bank details the merchant gave
    // us (Elixpo Pay onboards them; they never touch Razorpay). Skip if they
    // already have one, or if this is the owner's own bank (self). Non-fatal: on
    // failure we save as 'pending' + surface why.
    if (!accountId && !isOwnerBank) {
        const razorpay = await razorpayFromEnv(getEnv);
        if (razorpay) {
            const merchant = (await db
                .prepare("SELECT email, name FROM merchants WHERE id = ?")
                .bind(merchantId)
                .first()) as { email: string | null; name: string | null } | null;
            try {
                const created = await razorpay.createLinkedAccount({
                    email: merchant?.email || `merchant+${merchantId}@elixpo.com`,
                    name: beneficiary,
                    beneficiaryName: beneficiary,
                    ifsc,
                    accountNumber,
                    businessType,
                });
                accountId = created.accountId;
                status = "active";
            } catch (e: any) {
                createError = e?.message || "Could not create the Razorpay account";
                status = "pending";
            }
        }
    }

    if (existing) {
        await db
            .prepare(
                `UPDATE payout_accounts
                 SET beneficiary_name = ?, bank_ifsc = ?, bank_last4 = ?,
                     razorpay_account_id = ?, status = ?, updated_at = datetime('now')
                 WHERE merchant_id = ?`,
            )
            .bind(beneficiary, ifsc, last4, accountId, status, merchantId)
            .run();
    } else {
        await db
            .prepare(
                `INSERT INTO payout_accounts
                 (id, merchant_id, provider, razorpay_account_id, beneficiary_name, bank_ifsc, bank_last4, status)
                 VALUES (?, ?, 'razorpay', ?, ?, ?, ?, ?)`,
            )
            .bind(newId("payoutAccount"), merchantId, accountId, beneficiary, ifsc, last4, status)
            .run();
    }

    return NextResponse.json({
        ok: true,
        account: view(await getAccount(db, merchantId)),
        create_error: createError,
        self: isOwnerBank,
    });
}

export async function DELETE(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    await db.prepare("DELETE FROM payout_accounts WHERE merchant_id = ?").bind(merchantId).run();
    return NextResponse.json({ ok: true });
}
