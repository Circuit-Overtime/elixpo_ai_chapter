"use client";

import { Box } from "@mui/material";
import {
    BaseUrlChip,
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
} from "@/components/docs-prose";

export default function DocsOverview() {
    return (
        <Box>
            <DocTitle>Elixpo Pay — Overview</DocTitle>
            <DocLead>
                Elixpo Pay is the payments and payouts layer for the Elixpo
                ecosystem, and an open SaaS for any developer. It abstracts
                providers behind one API plus a hosted checkout, a unified
                ledger, entitlement grants, and creator payouts.
            </DocLead>
            <BaseUrlChip />

            <DocH2>How it fits together</DocH2>
            <DocP>
                Your app never touches card data. Your server creates a checkout
                session with your secret key and redirects the buyer to our
                hosted checkout; we charge them through a provider (Razorpay for
                INR in P0), then grant an entitlement and tell your app about it
                two ways:
            </DocP>
            <DocList
                items={[
                    <>
                        a signed <Code>entitlement.updated</Code> webhook
                        delivered to your app, and
                    </>,
                    <>
                        a pull endpoint,{" "}
                        <Code>GET /v1/entitlements?app=&uid=</Code>, you can
                        call any time.
                    </>,
                ]}
            />

            <DocH2>Core concepts</DocH2>
            <DocList
                items={[
                    <>
                        <strong>Merchant</strong> — your tenant. You sign in
                        with Elixpo Accounts.
                    </>,
                    <>
                        <strong>App</strong> — a project under your merchant
                        (e.g. <Code>lixblogs</Code>), with its own API key.
                    </>,
                    <>
                        <strong>Product</strong> — a sellable tier (e.g.{" "}
                        <Code>member</Code>).
                    </>,
                    <>
                        <strong>Price</strong> — a regional/PPP variant of a
                        product in a currency. Each price has a{" "}
                        <Code>type</Code> of <Code>one_time</Code> (manual
                        re-purchase each cycle) or <Code>recurring</Code>{" "}
                        (autopay mandate, billed automatically).
                    </>,
                    <>
                        <strong>Entitlement</strong> — the tier + expiry a
                        customer currently holds.
                    </>,
                    <>
                        <strong>Subscription</strong> — for autopay prices,
                        the recurring billing mandate. We manage the
                        Razorpay subscription, the renewal charges, and
                        emit <Code>entitlement.updated</Code> on every
                        successful cycle.
                    </>,
                ]}
            />

            <DocH2>Billing modes</DocH2>
            <DocList
                items={[
                    <>
                        <strong>One-time</strong> — buyer goes through
                        Razorpay Checkout, pays once, gets entitlement for
                        the price's <Code>interval</Code> (e.g. 30 days).
                        Re-buying is manual.
                    </>,
                    <>
                        <strong>Autopay (recurring)</strong> — buyer goes
                        through Razorpay's hosted mandate page (UPI Autopay
                        or Card eMandate), and Razorpay charges them
                        automatically each cycle. You receive{" "}
                        <Code>entitlement.updated</Code> on every renewal.
                    </>,
                ]}
            />
            <DocP>
                Switch modes per price with the <Code>type</Code> field in
                your catalog JSON — no other change needed in your
                integration. See <strong>Catalog sync</strong>.
            </DocP>

            <DocH2>Cancellation</DocH2>
            <DocP>
                For autopay prices, buyers can self-serve cancel from your
                app — see <strong>Checkout sessions → Cancelling</strong>.
                Graceful by default: access continues through the paid
                period, then the entitlement expires and you get a final{" "}
                <Code>entitlement.updated</Code> with{" "}
                <Code>active: false</Code>.
            </DocP>
        </Box>
    );
}
