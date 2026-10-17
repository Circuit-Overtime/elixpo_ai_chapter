"use client";

import { Box } from "@mui/material";
import { Code, DocH2, DocLead, DocList, DocP, DocTitle } from "@/components/docs-prose";

export default function PayoutsDocs() {
    return (
        <Box>
            <DocTitle>Connected payouts</DocTitle>
            <DocLead>
                By default, payments settle into the Elixpo platform account. As a
                merchant you can connect your own bank so your app's revenue is split
                to you automatically on every payment — minus a small platform fee.
            </DocLead>

            <DocH2>How it works (Razorpay Route)</DocH2>
            <DocList
                items={[
                    "Connect your bank under Dashboard → Payouts: account holder name, account number, and IFSC. Only the last 4 digits of the account number are stored, for display.",
                    "Onboard that bank as a Razorpay linked account (acc_…) and paste the id — this is what lets Razorpay route money to you.",
                    "From then on, each captured payment is split: your share lands in your bank, and Elixpo keeps its commission. No manual settlement.",
                ]}
            />

            <DocH2>Status</DocH2>
            <DocP>
                The connect flow is live; the automatic split is rolling out. Until your
                linked account is attached and <Code>active</Code>, funds keep settling
                to the Elixpo account and are reconciled to you — nothing is lost. The
                <Code>Payouts</Code> page shows your status and everything collected so
                far.
            </DocP>

            <DocH2>Fees</DocH2>
            <DocP>
                Elixpo charges a fixed platform commission on each split — set by us,
                not configurable per merchant — and it's shown on your Payouts page. It's
                applied to every payment, so your bank receives the amount minus the fee.
            </DocP>
        </Box>
    );
}
