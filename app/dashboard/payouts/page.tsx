"use client";

export const runtime = "edge";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { formatMoney, GlassCard } from "@/components/dashboard-ui";

const field = {
    "& .MuiOutlinedInput-root": {
        color: "var(--app-fg)",
        background: "var(--app-overlay)",
        "& fieldset": { borderColor: "var(--app-border)" },
        "&:hover fieldset": { borderColor: "rgba(155,123,247,0.4)" },
        "&.Mui-focused fieldset": { borderColor: "#9b7bf7" },
    },
    "& .MuiInputLabel-root": { color: "var(--app-fg-muted)" },
};

const labelSx = {
    fontSize: "0.7rem",
    color: "var(--app-fg-faint)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    mb: 0.5,
};

export default function PayoutsPage() {
    const [loading, setLoading] = useState(true);
    const [account, setAccount] = useState<any>(null);
    const [routable, setRoutable] = useState<any[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [feeBps, setFeeBps] = useState(0);

    const [beneficiary, setBeneficiary] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [ifsc, setIfsc] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [createError, setCreateError] = useState("");
    const [saved, setSaved] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);

    const load = async () => {
        const r = await fetch("/api/dashboard/payouts", { credentials: "include" });
        if (r.ok) {
            const d: any = await r.json();
            setAccount(d.account);
            setRoutable(d.routable || []);
            setIsOwner(!!d.is_platform_owner);
            setFeeBps(d.platform_commission_bps || 0);
            if (d.account) {
                setBeneficiary(d.account.beneficiary_name || "");
                setIfsc(d.account.bank_ifsc || "");
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const save = async () => {
        setBusy(true);
        setErr("");
        setCreateError("");
        setSaved(false);
        try {
            const r = await fetch("/api/dashboard/payouts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    beneficiary_name: beneficiary.trim(),
                    account_number: accountNumber.trim(),
                    ifsc: ifsc.trim(),
                }),
            });
            const d: any = await r.json().catch(() => ({}));
            if (!r.ok) {
                throw new Error(
                    {
                        missing_beneficiary: "Enter the account holder name.",
                        invalid_ifsc: "That IFSC doesn't look right.",
                        invalid_account_number: "Enter a valid account number.",
                    }[d.error as string] || d.error_description || d.error || "failed",
                );
            }
            setAccountNumber("");
            setSaved(true);
            // Razorpay couldn't create the linked account (e.g. KYC/details) —
            // saved as pending; show why so the merchant can fix it.
            if (d.create_error) setCreateError(d.create_error);
            await load();
        } catch (e: any) {
            setErr(e?.message || "Could not save");
        } finally {
            setBusy(false);
        }
    };

    const disconnect = async () => {
        setBusy(true);
        await fetch("/api/dashboard/payouts", { method: "DELETE", credentials: "include" });
        setConfirmDisconnect(false);
        setAccount(null);
        setBeneficiary("");
        setIfsc("");
        setBusy(false);
        await load();
    };

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "#9b7bf7" }} />
            </Box>
        );
    }

    const connected = !!account;
    const active = account?.status === "active";
    const selfAcct = account?.status === "self";

    return (
        <Box>
            <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>
                    Payouts
                </Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.92rem" }}>
                    Connect your bank to receive your app's revenue. Once live, each payment
                    is split to you automatically — you get the amount minus a{" "}
                    <Box component="span" sx={{ color: "#c4b5fd", fontWeight: 600 }}>
                        {(feeBps / 100).toFixed(feeBps % 100 ? 1 : 0)}% platform fee
                    </Box>
                    .
                </Typography>
            </Box>

            {isOwner ? (
                <GlassCard>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <AccountBalanceIcon sx={{ color: "#86efac", mt: 0.3 }} />
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                                Your products settle directly
                            </Typography>
                            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.88rem", mt: 0.5, maxWidth: 560 }}>
                                You're the platform owner, so revenue from your own products lands
                                straight in the Elixpo Razorpay account — no payout connection
                                needed. Connecting a bank is for third-party merchants whose
                                products are split to them.
                            </Typography>
                        </Box>
                    </Stack>
                    {routable.length > 0 && (
                        <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mt: 2.5 }}>
                            {routable.map((r: any) => (
                                <Box key={r.currency}>
                                    <Typography sx={{ fontWeight: 800, fontSize: "1.4rem" }}>
                                        {formatMoney(r.total, r.currency)}
                                    </Typography>
                                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.76rem" }}>
                                        {r.count} payment{r.count === 1 ? "" : "s"} · {r.currency}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </GlassCard>
            ) : (
              <>
            {/* Status */}
            {connected && (
                <GlassCard sx={{ mb: 2, border: `1px solid ${selfAcct ? "rgba(155,123,247,0.35)" : active ? "rgba(134,239,172,0.3)" : "rgba(251,191,36,0.3)"}` }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <AccountBalanceIcon sx={{ color: selfAcct ? "#c4b5fd" : active ? "#86efac" : "#fbbf24" }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography sx={{ fontWeight: 700 }}>
                                    {account.beneficiary_name}
                                </Typography>
                                <Chip
                                    label={selfAcct ? "Self" : active ? "Active" : "Pending"}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: "0.62rem",
                                        fontWeight: 700,
                                        color: selfAcct ? "#c4b5fd" : active ? "#86efac" : "#fbbf24",
                                        bgcolor: selfAcct ? "rgba(155,123,247,0.12)" : active ? "rgba(134,239,172,0.12)" : "rgba(251,191,36,0.12)",
                                        border: `1px solid ${selfAcct ? "rgba(155,123,247,0.3)" : active ? "rgba(134,239,172,0.3)" : "rgba(251,191,36,0.3)"}`,
                                    }}
                                />
                            </Stack>
                            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", mt: 0.2 }}>
                                {account.bank_ifsc} · A/C ••••{account.bank_last4}
                                {account.razorpay_account_id ? ` · ${account.razorpay_account_id}` : ""}
                            </Typography>
                        </Box>
                    </Stack>
                    {selfAcct ? (
                        <Typography sx={{ color: "#c4b5fd", fontSize: "0.8rem", mt: 1.4 }}>
                            These details match the platform's own bank — marked as{" "}
                            <strong>Self</strong>, so payments settle directly (no split).
                            Ownership verification is required before this is finalised.
                        </Typography>
                    ) : (
                        !active && (
                            <Typography sx={{ color: "rgba(251,191,36,0.85)", fontSize: "0.8rem", mt: 1.4 }}>
                                Funds currently settle to Elixpo. Routing to your bank turns on once
                                your Razorpay linked account is attached & verified.
                            </Typography>
                        )
                    )}
                </GlassCard>
            )}

            {/* Connect / edit form */}
            <GlassCard>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 0.3 }}>
                    {connected ? "Update bank details" : "Connect your bank"}
                </Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", mb: 2 }}>
                    We verify these and set up your Razorpay payout account for you — you
                    don't touch Razorpay. Your account number is never stored in full
                    (only the last 4 digits, for display).
                </Typography>
                <Stack spacing={1.8}>
                    <Box>
                        <Typography sx={labelSx}>Account holder name</Typography>
                        <TextField value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Acme Pvt Ltd" size="small" fullWidth sx={field} />
                    </Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.8}>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={labelSx}>Account number</Typography>
                            <TextField value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={connected ? `••••${account.bank_last4}` : "0000000000"} size="small" fullWidth sx={field} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={labelSx}>IFSC</Typography>
                            <TextField value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" size="small" fullWidth sx={field} />
                        </Box>
                    </Stack>
                </Stack>
                {createError && (
                    <Box sx={{ mt: 1.8, px: 1.6, py: 1.2, borderRadius: "10px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
                        <Typography sx={{ color: "#fbbf24", fontSize: "0.82rem" }}>
                            Saved, but Razorpay couldn't set up the payout account yet: {createError}
                        </Typography>
                    </Box>
                )}
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
                    <Button
                        onClick={save}
                        disabled={busy}
                        sx={{ textTransform: "none", fontWeight: 600, color: "#fff", px: 2.6, py: 0.9, borderRadius: "10px", background: "#7c5cff", "&:hover": { background: "#8a6dff" }, "&.Mui-disabled": { opacity: 0.5, color: "#fff" } }}
                    >
                        {busy ? "Saving…" : connected ? "Update" : "Connect bank"}
                    </Button>
                    {connected && (
                        <Button onClick={() => setConfirmDisconnect(true)} disabled={busy} sx={{ textTransform: "none", fontWeight: 600, color: "rgba(248,113,113,0.85)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", px: 2 }}>
                            Disconnect
                        </Button>
                    )}
                    {saved && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <CheckCircleIcon sx={{ fontSize: 16, color: "#86efac" }} />
                            <Typography sx={{ color: "#86efac", fontSize: "0.82rem" }}>Saved</Typography>
                        </Stack>
                    )}
                    {err && <Typography sx={{ color: "#f87171", fontSize: "0.82rem" }}>{err}</Typography>}
                </Stack>
            </GlassCard>

            {/* Routable revenue */}
            {routable.length > 0 && (
                <GlassCard sx={{ mt: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "1rem", mb: 1 }}>
                        Collected so far
                    </Typography>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                        {routable.map((r: any) => (
                            <Box key={r.currency}>
                                <Typography sx={{ fontWeight: 800, fontSize: "1.5rem" }}>
                                    {formatMoney(r.total, r.currency)}
                                </Typography>
                                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.78rem" }}>
                                    {r.count} payment{r.count === 1 ? "" : "s"} · {r.currency}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                    <Typography sx={{ color: "var(--app-fg-faint)", fontSize: "0.74rem", mt: 1.4 }}>
                        This is what's flowed through your apps. When Route is live, your share (after
                        the platform fee) lands in your bank automatically on each payment.
                    </Typography>
                </GlassCard>
            )}
              </>
            )}

            <ConfirmDialog
                open={confirmDisconnect}
                destructive
                busy={busy}
                title="Disconnect your bank?"
                confirmLabel="Disconnect"
                message={
                    <>
                        With no bank connected, your payments will{" "}
                        <strong>settle into the Elixpo Pay account</strong> (
                        <strong>hello@elixpo.com</strong>) until you reconnect — they won't
                        reach your bank. Your existing payments aren't affected.
                    </>
                }
                onConfirm={disconnect}
                onClose={() => setConfirmDisconnect(false)}
            />
        </Box>
    );
}
