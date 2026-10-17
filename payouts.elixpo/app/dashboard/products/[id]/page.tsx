"use client";

export const runtime = "edge";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import LaunchIcon from "@mui/icons-material/Launch";
import SendIcon from "@mui/icons-material/Send";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ChangeIdDialog from "@/components/change-id-dialog";
import ConfirmDialog from "@/components/confirm-dialog";
import { formatMoney, GlassCard, StatCard } from "@/components/dashboard-ui";
import RotateDialog, { type GraceKey } from "@/components/rotate-dialog";

export default function ProductDetailPage() {
    const id = String(useParams().id);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [err, setErr] = useState("");
    const [creds, setCreds] = useState<{
        clientId: string;
        secret: string;
    } | null>(null);
    const [secretHidden, setSecretHidden] = useState(false);
    const [regenBusy, setRegenBusy] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [confirmRegen, setConfirmRegen] = useState(false);
    const [archiveBusy, setArchiveBusy] = useState(false);
    const [webhook, setWebhook] = useState<any>(null);
    const [webhookUrl, setWebhookUrl] = useState("");
    const [availableEvents, setAvailableEvents] = useState<any[]>([]);
    const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
    const [webhookSecretOnce, setWebhookSecretOnce] = useState<string | null>(
        null,
    );
    const [webhookSecretHidden, setWebhookSecretHidden] = useState(false);
    const [webhookBusy, setWebhookBusy] = useState(false);
    const [confirmWebhookRegen, setConfirmWebhookRegen] = useState(false);
    // Name editing
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [nameBusy, setNameBusy] = useState(false);
    // Change client_id
    const [changeIdOpen, setChangeIdOpen] = useState(false);
    const [changeIdBusy, setChangeIdBusy] = useState(false);
    const [changeIdErr, setChangeIdErr] = useState("");
    // Test send
    const [testEmailInput, setTestEmailInput] = useState("");
    const [testEmailChips, setTestEmailChips] = useState<string[]>([]);
    const [testSendBusy, setTestSendBusy] = useState(false);
    const [testSendResults, setTestSendResults] = useState<
    Array<{
        email: string;
        ok: boolean;
        error?: string;
    }>
    >([]);

    const commitEmailInput = () => {
        const raw = testEmailInput.trim();
        if (!raw) return;
        const incoming = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        setTestEmailChips(prev => [...prev, ...incoming.filter(e => !prev.includes(e))]);
        setTestEmailInput("");
    };

    const removeEmailChip = (email: string) =>
        setTestEmailChips(prev => prev.filter(e => e !== email));

    const doTestSend = async () => {
        if (testEmailChips.length === 0) return;
        setTestSendBusy(true);
        setTestSendResults([]);
        try {
            const r = await fetch(`/api/dashboard/products/${id}/test-send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ emails: testEmailChips }),
            });
            const d = (await r.json()) as Record<string, unknown>;
            if (!r.ok)
                throw new Error(
                    String(d.error_description || d.error || "failed"),
                );
            setTestSendResults(
                (d.results as Array<{
                    email: string;
                    ok: boolean;
                    error?: string;
                }>) ?? [],
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setTestSendResults(testEmailChips.map(email => ({ email, ok: false, error: msg })));
        } finally {
            setTestSendBusy(false);
        }
    };
    // App links (homepage / pricing) editing
    const [homepageDraft, setHomepageDraft] = useState("");
    const [pricingDraft, setPricingDraft] = useState("");
    const [linksBusy, setLinksBusy] = useState(false);
    const [linksErr, setLinksErr] = useState("");
    const [linksSaved, setLinksSaved] = useState(false);
    // Permanent delete
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteErr, setDeleteErr] = useState("");

    const copyWebhookSecret = async () => {
        if (!webhookSecretOnce) return;
        try {
            await navigator.clipboard.writeText(webhookSecretOnce);
            setWebhookSecretHidden(true);
        } catch {
            // ignore
        }
    };

    const load = async () => {
        const r = await fetch(`/api/dashboard/products/${id}`, {
            credentials: "include",
        });
        if (!r.ok) {
            setData(null);
            setLoading(false);
            return;
        }
        const d: any = await r.json();
        setData(d);
        setHomepageDraft(d?.product?.homepage_url || "");
        setPricingDraft(d?.product?.pricing_url || "");
        setLoading(false);
    };

    const loadWebhook = async () => {
        const r = await fetch(`/api/dashboard/products/${id}/webhook`, {
            credentials: "include",
        });
        if (!r.ok) return;
        const d: any = await r.json();
        setWebhook(d.endpoint);
        setWebhookUrl(d.endpoint?.url || "");
        setAvailableEvents(d.available_events || []);
        setWebhookEvents(
            d.endpoint?.events ||
                (d.available_events || [])
                    .filter((e: any) => e.required)
                    .map((e: any) => e.type),
        );
    };

    const toggleWebhookEvent = (type: string, on: boolean) => {
        setWebhookEvents((prev) =>
            on ? [...new Set([...prev, type])] : prev.filter((t) => t !== type),
        );
    };

    const saveWebhook = async () => {
        setWebhookBusy(true);
        setErr("");
        try {
            const r = await fetch(`/api/dashboard/products/${id}/webhook`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    url: webhookUrl.trim(),
                    events: webhookEvents,
                }),
            });
            const d: any = await r.json();
            if (!r.ok)
                throw new Error(d.error_description || d.error || "failed");
            if (d.signing_secret) {
                setWebhookSecretHidden(false);
                setWebhookSecretOnce(d.signing_secret);
            }
            await loadWebhook();
        } catch (e: any) {
            setErr(e?.message || "Could not save webhook");
        } finally {
            setWebhookBusy(false);
        }
    };

    const regenWebhookSecret = async (grace: GraceKey) => {
        setWebhookBusy(true);
        setErr("");
        try {
            const r = await fetch(`/api/dashboard/products/${id}/webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ grace }),
            });
            const d: any = await r.json();
            if (!r.ok)
                throw new Error(d.error_description || d.error || "failed");
            setWebhookSecretHidden(false);
            setWebhookSecretOnce(d.signing_secret);
            await loadWebhook();
        } catch (e: any) {
            setErr(e?.message || "Could not regenerate secret");
        } finally {
            setWebhookBusy(false);
            setConfirmWebhookRegen(false);
        }
    };

    const saveName = async () => {
        const name = nameDraft.trim();
        if (!name || name === data?.product?.app_name) {
            setEditingName(false);
            return;
        }
        setNameBusy(true);
        try {
            const r = await fetch(`/api/dashboard/products/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ app_name: name }),
            });
            if (!r.ok) throw new Error("failed");
            await load();
            setEditingName(false);
        } catch {
            setErr("Could not rename product");
        } finally {
            setNameBusy(false);
        }
    };

    const doChangeId = async (next: string) => {
        setChangeIdBusy(true);
        setChangeIdErr("");
        try {
            const r = await fetch(`/api/dashboard/products/${id}/change-id`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ client_id: next }),
            });
            const d: any = await r.json();
            if (!r.ok)
                throw new Error(d.error_description || d.error || "failed");
            setChangeIdOpen(false);
            await load();
            await loadWebhook();
        } catch (e: any) {
            setChangeIdErr(e?.message || "Could not change client id");
        } finally {
            setChangeIdBusy(false);
        }
    };

    const saveLinks = async () => {
        setLinksBusy(true);
        setLinksErr("");
        setLinksSaved(false);
        try {
            const r = await fetch(`/api/dashboard/products/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    homepage_url: homepageDraft.trim(),
                    pricing_url: pricingDraft.trim(),
                }),
            });
            const d: any = await r.json().catch(() => ({}));
            if (!r.ok) {
                throw new Error(
                    d.error === "invalid_homepage_url"
                        ? "Homepage must be a https:// URL"
                        : d.error === "invalid_pricing_url"
                          ? "Pricing page must be a https:// URL"
                          : d.error_description || d.error || "failed",
                );
            }
            setLinksSaved(true);
            await load();
        } catch (e: any) {
            setLinksErr(e?.message || "Could not save links");
        } finally {
            setLinksBusy(false);
        }
    };

    const doDelete = async () => {
        setDeleteBusy(true);
        setDeleteErr("");
        try {
            const r = await fetch(`/api/dashboard/products/${id}/delete`, {
                method: "POST",
                credentials: "include",
            });
            const d: any = await r.json().catch(() => ({}));
            if (!r.ok) {
                throw new Error(d.error_description || d.error || "failed");
            }
            window.location.href = "/dashboard/products";
        } catch (e: any) {
            setDeleteErr(e?.message || "Could not delete product");
            setDeleteBusy(false);
        }
    };

    useEffect(() => {
        load();
        loadWebhook();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const doArchive = async () => {
        setArchiveBusy(true);
        await fetch(`/api/dashboard/products/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        setArchiveBusy(false);
        setConfirmArchive(false);
        await load();
    };

    const doUnarchive = async () => {
        setArchiveBusy(true);
        await fetch(`/api/dashboard/products/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ active: true }),
        });
        setArchiveBusy(false);
        await load();
    };

    const doRegenerate = async (grace: GraceKey) => {
        setRegenBusy(true);
        setErr("");
        try {
            const r = await fetch(
                `/api/dashboard/products/${id}/regenerate-secret`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ grace }),
                },
            );
            const d: any = await r.json();
            if (!r.ok)
                throw new Error(d.error_description || d.error || "failed");
            setSecretHidden(false);
            setCreds({ clientId: d.client_id, secret: d.client_secret });
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setRegenBusy(false);
            setConfirmRegen(false);
        }
    };

    const copySecret = async () => {
        if (!creds) return;
        try {
            await navigator.clipboard.writeText(creds.secret);
            setSecretHidden(true);
        } catch {
            // ignore
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "#9b7bf7" }} />
            </Box>
        );
    }
    if (!data) {
        return (
            <GlassCard sx={{ textAlign: "center", py: 6 }}>
                <Typography sx={{ color: "var(--app-fg-muted)" }}>
                    Product not found.
                </Typography>
                <Button
                    component={Link}
                    href="/dashboard/products"
                    sx={{ mt: 2, textTransform: "none", color: "#9b7bf7" }}
                >
                    ← Back to products
                </Button>
            </GlassCard>
        );
    }

    const { product, stats } = data;
    const tiers: any[] = data.tiers ?? [];
    const primary = stats.revenue?.[0];

    const graceUntil = (s?: string | null) => {
        if (!s) return null;
        const d = new Date(`${s.replace(" ", "T")}Z`);
        if (d <= new Date()) return null;
        return d.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        });
    };
    const slugGrace = graceUntil(product.prev_slug_expires_at);
    const keyGrace = graceUntil(product.prev_api_key_expires_at);
    const webhookGrace = graceUntil(webhook?.prev_secret_expires_at);

    return (
        <Box>
            <Button
                component={Link}
                href="/dashboard/products"
                startIcon={
                    <ArrowBackIcon sx={{ fontSize: "1rem !important" }} />
                }
                sx={{
                    textTransform: "none",
                    color: "var(--app-fg-muted)",
                    mb: 2,
                    px: 0,
                    "&:hover": { color: "var(--app-fg)", background: "transparent" },
                }}
            >
                Products
            </Button>

            {/* Header */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 3 }}
            >
                <Box>
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                    >
                        {editingName ? (
                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <TextField
                                    value={nameDraft}
                                    onChange={(e) =>
                                        setNameDraft(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") saveName();
                                        if (e.key === "Escape")
                                            setEditingName(false);
                                    }}
                                    size="small"
                                    autoFocus
                                    sx={{
                                        ...field,
                                        "& .MuiOutlinedInput-input": {
                                            fontSize: "1.3rem",
                                            fontWeight: 800,
                                            py: 0.6,
                                        },
                                    }}
                                />
                                <Button
                                    onClick={saveName}
                                    disabled={nameBusy}
                                    sx={{
                                        minWidth: 0,
                                        textTransform: "none",
                                        fontWeight: 700,
                                        color: "#c4b5fd",
                                    }}
                                >
                                    {nameBusy ? "…" : "Save"}
                                </Button>
                                <Button
                                    onClick={() => setEditingName(false)}
                                    disabled={nameBusy}
                                    sx={{
                                        minWidth: 0,
                                        textTransform: "none",
                                        color: "var(--app-fg-muted)",
                                    }}
                                >
                                    Cancel
                                </Button>
                            </Stack>
                        ) : (
                            <>
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: "1.7rem",
                                        letterSpacing: "-0.02em",
                                    }}
                                >
                                    {product.app_name}
                                </Typography>
                                <Box
                                    component="button"
                                    onClick={() => {
                                        setNameDraft(product.app_name);
                                        setEditingName(true);
                                    }}
                                    aria-label="Rename product"
                                    sx={{
                                        display: "grid",
                                        placeItems: "center",
                                        width: 28,
                                        height: 28,
                                        borderRadius: "8px",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--app-fg-muted)",
                                        background: "transparent",
                                        "&:hover": {
                                            color: "#c4b5fd",
                                            background:
                                                "rgba(155,123,247,0.08)",
                                        },
                                    }}
                                >
                                    <EditIcon sx={{ fontSize: 16 }} />
                                </Box>
                            </>
                        )}
                        <Chip
                            label={product.active ? "Active" : "Archived"}
                            size="small"
                            sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                color: product.active ? "#4ade80" : "#9ca3af",
                                bgcolor: product.active
                                    ? "rgba(34,197,94,0.1)"
                                    : "rgba(156,163,175,0.1)",
                                border: `1px solid ${product.active ? "rgba(34,197,94,0.25)" : "rgba(156,163,175,0.2)"}`,
                            }}
                        />
                    </Stack>
                    <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                        sx={{ mt: 0.6 }}
                        flexWrap="wrap"
                    >
                        <Typography
                            sx={{
                                fontFamily: "var(--font-geist-mono)",
                                fontSize: "0.8rem",
                                color: "#c4b5fd",
                            }}
                        >
                            Client ID: {product.client_id}
                        </Typography>
                        <Box
                            component="button"
                            onClick={() => {
                                setChangeIdErr("");
                                setChangeIdOpen(true);
                            }}
                            sx={{
                                border: "none",
                                cursor: "pointer",
                                background: "transparent",
                                color: "var(--app-fg-muted)",
                                fontSize: "0.76rem",
                                textDecoration: "underline",
                                textUnderlineOffset: "2px",
                                "&:hover": { color: "#c4b5fd" },
                            }}
                        >
                            Change ID
                        </Box>
                        {slugGrace && (
                            <Typography
                                sx={{ fontSize: "0.72rem", color: "#fbbf24" }}
                            >
                                old ID <strong>{product.prev_slug}</strong>{" "}
                                works until {slugGrace}
                            </Typography>
                        )}
                    </Stack>
                    {product.description && (
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.9rem",
                                mt: 1,
                                maxWidth: 620,
                            }}
                        >
                            {product.description}
                        </Typography>
                    )}
                </Box>
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    sx={{
                        justifyContent: { xs: "flex-start", sm: "flex-end" },
                    }}
                >
                    {product.homepage_url && (
                        <Button
                            component="a"
                            href={product.homepage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            startIcon={
                                <LaunchIcon
                                    sx={{ fontSize: "0.95rem !important" }}
                                />
                            }
                            sx={purpleOutlineBtn}
                        >
                            Homepage
                        </Button>
                    )}
                    {product.pricing_url && (
                        <Button
                            component="a"
                            href={product.pricing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            startIcon={
                                <LaunchIcon
                                    sx={{ fontSize: "0.95rem !important" }}
                                />
                            }
                            sx={purpleOutlineBtn}
                        >
                            Pricing
                        </Button>
                    )}
                    {product.active === 1 ? (
                        <Button
                            onClick={() => setConfirmArchive(true)}
                            sx={{
                                textTransform: "none",
                                fontWeight: 600,
                                color: "rgba(248,113,113,0.85)",
                                border: "1px solid rgba(239,68,68,0.25)",
                                borderRadius: "10px",
                                px: 2,
                            }}
                        >
                            Archive
                        </Button>
                    ) : (
                        <Button
                            onClick={doUnarchive}
                            disabled={archiveBusy}
                            sx={{
                                textTransform: "none",
                                fontWeight: 700,
                                color: "#fff",
                                borderRadius: "10px",
                                px: 2.2,
                                background:
                                    "linear-gradient(135deg, #9b7bf7 0%, #7c5cff 100%)",
                                "&:hover": {
                                    background:
                                        "linear-gradient(135deg, #b094ff 0%, #8a6dff 100%)",
                                },
                                "&.Mui-disabled": {
                                    opacity: 0.5,
                                    color: "#fff",
                                },
                            }}
                        >
                            {archiveBusy ? "Unarchiving…" : "Unarchive"}
                        </Button>
                    )}
                </Stack>
            </Stack>

            {product.active !== 1 && (
                <Box
                    sx={{
                        mb: 3,
                        px: 2,
                        py: 1.4,
                        borderRadius: "12px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        color: "rgba(248,113,113,0.9)",
                        fontSize: "0.88rem",
                    }}
                >
                    <strong>
                        This product is archived — payments are paused.
                    </strong>{" "}
                    Checkout can't resolve it and entitlements won't be granted.
                    Click <strong>Unarchive</strong> to resume.
                </Box>
            )}

            {/* Stats */}
            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                        xs: "1fr 1fr",
                        md: "repeat(3, 1fr)",
                    },
                    mb: 3,
                }}
            >
                <StatCard
                    label="Revenue"
                    value={
                        primary
                            ? formatMoney(primary.total, primary.currency)
                            : "—"
                    }
                    sub={
                        stats.revenue.length > 1
                            ? `+${stats.revenue.length - 1} more currency`
                            : "captured"
                    }
                    accent="#86efac"
                />
                <StatCard
                    label="Active members"
                    value={String(stats.activeMembers)}
                    sub="entitlements live"
                    accent="#9b7bf7"
                />
                <StatCard
                    label="Paid txns"
                    value={String(stats.paidTransactions)}
                    sub="lifetime"
                    accent="#fbbf24"
                />
            </Box>

            {/* Developer credentials */}
            <GlassCard sx={{ mb: 2 }}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    spacing={1.5}
                    sx={{ mb: 1.5 }}
                >
                    <Box>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.1rem" }}
                        >
                            Developer credentials
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.82rem",
                            }}
                        >
                            Use the Client ID + secret to call the entitlements
                            API.
                        </Typography>
                        {keyGrace && (
                            <Typography
                                sx={{
                                    fontSize: "0.74rem",
                                    color: "#fbbf24",
                                    mt: 0.4,
                                }}
                            >
                                Previous key still works until {keyGrace}.
                            </Typography>
                        )}
                    </Box>
                    <Button
                        onClick={() => setConfirmRegen(true)}
                        disabled={regenBusy}
                        startIcon={
                            <AutorenewIcon
                                sx={{ fontSize: "1rem !important" }}
                            />
                        }
                        sx={{
                            textTransform: "none",
                            fontWeight: 600,
                            color: "#c4b5fd",
                            border: "1px solid rgba(155,123,247,0.3)",
                            borderRadius: "10px",
                            px: 1.8,
                            "&.Mui-disabled": { opacity: 0.5 },
                        }}
                    >
                        {regenBusy ? "Regenerating…" : "Regenerate secret"}
                    </Button>
                </Stack>

                <Typography
                    sx={{
                        fontSize: "0.7rem",
                        color: "var(--app-fg-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        mb: 0.5,
                    }}
                >
                    Client ID
                </Typography>
                <Box sx={{ ...mono, color: "#c4b5fd", mb: creds ? 2 : 0 }}>
                    {product.client_id}
                </Box>

                {creds && (
                    <>
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                color: "var(--app-fg-faint)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                mb: 0.5,
                            }}
                        >
                            New client secret
                        </Typography>
                        {secretHidden ? (
                            <Box
                                sx={{
                                    ...mono,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    color: "var(--app-fg-muted)",
                                }}
                            >
                                <CheckCircleIcon
                                    sx={{ fontSize: 16, color: "#86efac" }}
                                />
                                Copied & hidden — the old secret no longer
                                works. Store this as ELIXPO_PAY_API_KEY.
                            </Box>
                        ) : (
                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <Box
                                    sx={{
                                        ...mono,
                                        flexGrow: 1,
                                        overflowX: "auto",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {creds.secret}
                                </Box>
                                <Button
                                    onClick={copySecret}
                                    startIcon={
                                        <ContentCopyIcon
                                            sx={{ fontSize: "1rem !important" }}
                                        />
                                    }
                                    sx={{
                                        textTransform: "none",
                                        fontWeight: 600,
                                        color: "#fff",
                                        px: 2,
                                        background: "#7c5cff",
                                        borderRadius: "10px",
                                        "&:hover": { background: "#8a6dff" },
                                    }}
                                >
                                    Copy
                                </Button>
                            </Stack>
                        )}
                    </>
                )}
                {err && (
                    <Typography
                        sx={{ color: "#f87171", fontSize: "0.85rem", mt: 1 }}
                    >
                        {err}
                    </Typography>
                )}
            </GlassCard>

            {/* Entitlement webhook */}
            <GlassCard sx={{ mb: 2 }}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    spacing={1.5}
                    sx={{ mb: 1.5 }}
                >
                    <Box>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.1rem" }}
                        >
                            Entitlement webhook
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.82rem",
                            }}
                        >
                            We POST <code>entitlement.updated</code> here after
                            each payment. Your app verifies it with the signing
                            secret.
                        </Typography>
                    </Box>
                    {webhook?.has_secret && (
                        <Button
                            onClick={() => setConfirmWebhookRegen(true)}
                            disabled={webhookBusy}
                            startIcon={
                                <AutorenewIcon
                                    sx={{ fontSize: "1rem !important" }}
                                />
                            }
                            sx={{
                                textTransform: "none",
                                fontWeight: 600,
                                color: "#c4b5fd",
                                border: "1px solid rgba(155,123,247,0.3)",
                                borderRadius: "10px",
                                px: 1.8,
                                "&.Mui-disabled": { opacity: 0.5 },
                            }}
                        >
                            Roll secret
                        </Button>
                    )}
                </Stack>

                <Typography
                    sx={{
                        fontSize: "0.7rem",
                        color: "var(--app-fg-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        mb: 0.5,
                    }}
                >
                    Endpoint URL
                </Typography>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                >
                    <TextField
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://yourapp.com/api/billing/grant"
                        size="small"
                        fullWidth
                        sx={field}
                    />
                    <Button
                        onClick={saveWebhook}
                        disabled={
                            webhookBusy ||
                            !webhookUrl.trim() ||
                            (webhookUrl.trim() === webhook?.url &&
                                JSON.stringify([...webhookEvents].sort()) ===
                                    JSON.stringify(
                                        [...(webhook?.events || [])].sort(),
                                    ))
                        }
                        sx={{
                            textTransform: "none",
                            fontWeight: 600,
                            color: "#fff",
                            px: 2.4,
                            py: 0.9,
                            borderRadius: "10px",
                            background: "#7c5cff",
                            whiteSpace: "nowrap",
                            "&:hover": { background: "#8a6dff" },
                            "&.Mui-disabled": { opacity: 0.5, color: "#fff" },
                        }}
                    >
                        {webhookBusy ? "Saving…" : webhook ? "Update" : "Save"}
                    </Button>
                </Stack>

                {availableEvents.length > 0 && (
                    <Box sx={{ mt: 2.5 }}>
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                color: "var(--app-fg-faint)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                mb: 1,
                            }}
                        >
                            Events to send
                        </Typography>
                        <Stack spacing={1}>
                            {availableEvents.map((ev: any) => {
                                const on =
                                    ev.required ||
                                    webhookEvents.includes(ev.type);
                                return (
                                    <Stack
                                        key={ev.type}
                                        direction="row"
                                        alignItems="flex-start"
                                        justifyContent="space-between"
                                        spacing={1.5}
                                        sx={{
                                            p: 1.4,
                                            borderRadius: "12px",
                                            border: "1px solid var(--app-border)",
                                            background:
                                                "var(--app-overlay)",
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                alignItems="center"
                                                sx={{ mb: 0.2 }}
                                            >
                                                <Box
                                                    component="code"
                                                    sx={{
                                                        ...mono,
                                                        fontSize: "0.8rem",
                                                        color: "#c4b5fd",
                                                        p: 0,
                                                        background: "none",
                                                        border: "none",
                                                    }}
                                                >
                                                    {ev.type}
                                                </Box>
                                                {ev.required && (
                                                    <Chip
                                                        label="required"
                                                        size="small"
                                                        sx={{
                                                            height: 18,
                                                            fontSize: "0.6rem",
                                                            color: "var(--app-fg-muted)",
                                                            bgcolor:
                                                                "var(--app-overlay)",
                                                        }}
                                                    />
                                                )}
                                            </Stack>
                                            <Typography
                                                sx={{
                                                    color: "var(--app-fg-muted)",
                                                    fontSize: "0.8rem",
                                                }}
                                            >
                                                {ev.description}
                                            </Typography>
                                        </Box>
                                        <Switch
                                            size="small"
                                            checked={on}
                                            disabled={ev.required}
                                            onChange={(e) =>
                                                toggleWebhookEvent(
                                                    ev.type,
                                                    e.target.checked,
                                                )
                                            }
                                        />
                                    </Stack>
                                );
                            })}
                        </Stack>
                    </Box>
                )}

                {webhookSecretOnce ? (
                    <Box sx={{ mt: 2 }}>
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                color: "var(--app-fg-faint)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                mb: 0.5,
                            }}
                        >
                            Signing secret — shown once
                        </Typography>
                        {webhookSecretHidden ? (
                            <Box
                                sx={{
                                    ...mono,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    color: "var(--app-fg-muted)",
                                }}
                            >
                                <CheckCircleIcon
                                    sx={{ fontSize: 16, color: "#86efac" }}
                                />
                                Copied &amp; hidden — store it as
                                ELIXPO_PAY_WEBHOOK_SECRET. It won't be shown
                                again.
                            </Box>
                        ) : (
                            <>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                >
                                    <Box
                                        sx={{
                                            ...mono,
                                            flexGrow: 1,
                                            overflowX: "auto",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {webhookSecretOnce}
                                    </Box>
                                    <Button
                                        onClick={copyWebhookSecret}
                                        startIcon={
                                            <ContentCopyIcon
                                                sx={{
                                                    fontSize: "1rem !important",
                                                }}
                                            />
                                        }
                                        sx={{
                                            textTransform: "none",
                                            fontWeight: 600,
                                            color: "#fff",
                                            px: 2,
                                            background: "#7c5cff",
                                            borderRadius: "10px",
                                            "&:hover": {
                                                background: "#8a6dff",
                                            },
                                        }}
                                    >
                                        Copy
                                    </Button>
                                </Stack>
                                <Typography
                                    sx={{
                                        color: "var(--app-fg-muted)",
                                        fontSize: "0.78rem",
                                        mt: 0.8,
                                    }}
                                >
                                    Store this as{" "}
                                    <code>ELIXPO_PAY_WEBHOOK_SECRET</code> in
                                    your app. It won't be shown again.
                                </Typography>
                            </>
                        )}
                    </Box>
                ) : null}
                {webhookGrace && (
                    <Typography
                        sx={{ fontSize: "0.74rem", color: "#fbbf24", mt: 1 }}
                    >
                        Dual-signing with the previous secret until{" "}
                        {webhookGrace}.
                    </Typography>
                )}
            </GlassCard>

            {/* Tiers (read-only — managed from code via the sync API) */}
            <GlassCard>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    sx={{ mb: 2 }}
                >
                    <Box>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.1rem" }}
                        >
                            Tiers
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.82rem",
                            }}
                        >
                            Each tier and its regional prices, managed from your
                            code. They can't be edited here.
                        </Typography>
                    </Box>
                    {tiers.length > 0 && (
                        <Chip
                            label={`${tiers.length} tier${tiers.length === 1 ? "" : "s"}`}
                            size="small"
                            sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "#c4b5fd",
                                bgcolor: "rgba(155,123,247,0.12)",
                                border: "1px solid rgba(155,123,247,0.25)",
                            }}
                        />
                    )}
                </Stack>

                {tiers.length === 0 ? (
                    <Box
                        sx={{
                            borderRadius: "12px",
                            border: "1px dashed var(--app-border)",
                            background: "var(--app-overlay)",
                            p: 2.5,
                            textAlign: "center",
                        }}
                    >
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.9rem",
                                mb: 0.5,
                            }}
                        >
                            No tiers yet.
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-faint)",
                                fontSize: "0.82rem",
                            }}
                        >
                            Define them in your catalog file and run the sync
                            (below) so they can be sold.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={1.5}>
                        {tiers.map((t: any) => (
                            <Box
                                key={t.id}
                                sx={{
                                    borderRadius: "14px",
                                    border: "1px solid var(--app-border)",
                                    background: "var(--app-overlay)",
                                    p: { xs: 1.8, sm: 2.2 },
                                    opacity: t.active ? 1 : 0.5,
                                }}
                            >
                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="center"
                                    sx={{ mb: 1.4 }}
                                >
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        flexWrap="wrap"
                                    >
                                        <Typography
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: "1rem",
                                                color: "var(--app-fg)",
                                            }}
                                        >
                                            {t.name}
                                        </Typography>
                                        <Box
                                            component="code"
                                            sx={{
                                                fontFamily:
                                                    "var(--font-geist-mono)",
                                                fontSize: "0.72rem",
                                                color: "#c4b5fd",
                                                px: 0.8,
                                                py: 0.2,
                                                borderRadius: "6px",
                                                background:
                                                    "rgba(155,123,247,0.1)",
                                            }}
                                        >
                                            {t.tier}
                                        </Box>
                                    </Stack>
                                    <Chip
                                        label={t.active ? "active" : "inactive"}
                                        size="small"
                                        sx={{
                                            height: 20,
                                            fontSize: "0.62rem",
                                            fontWeight: 700,
                                            color: t.active
                                                ? "#86efac"
                                                : "#9ca3af",
                                            bgcolor: t.active
                                                ? "rgba(134,239,172,0.12)"
                                                : "rgba(156,163,175,0.12)",
                                            border: `1px solid ${t.active ? "rgba(134,239,172,0.3)" : "rgba(156,163,175,0.25)"}`,
                                        }}
                                    />
                                </Stack>

                                {t.prices.length === 0 ? (
                                    <Typography
                                        sx={{
                                            color: "var(--app-fg-faint)",
                                            fontSize: "0.82rem",
                                        }}
                                    >
                                        No prices on this tier yet.
                                    </Typography>
                                ) : (
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gap: 1,
                                            gridTemplateColumns: {
                                                xs: "1fr",
                                                sm: "repeat(auto-fill, minmax(180px, 1fr))",
                                            },
                                        }}
                                    >
                                        {t.prices.map((pr: any) => (
                                            <Box
                                                key={pr.id}
                                                sx={{
                                                    p: 1.4,
                                                    borderRadius: "10px",
                                                    border: "1px solid var(--app-border)",
                                                    background:
                                                        "rgba(0,0,0,0.18)",
                                                    opacity: pr.active
                                                        ? 1
                                                        : 0.5,
                                                }}
                                            >
                                                <Stack
                                                    direction="row"
                                                    justifyContent="space-between"
                                                    alignItems="center"
                                                >
                                                    <Typography
                                                        sx={{
                                                            fontWeight: 800,
                                                            fontSize: "1.25rem",
                                                        }}
                                                    >
                                                        {formatMoney(
                                                            pr.unit_amount,
                                                            pr.currency,
                                                        )}
                                                    </Typography>
                                                    <Stack
                                                        direction="row"
                                                        spacing={0.6}
                                                        alignItems="center"
                                                    >
                                                        {pr.type ===
                                                            "recurring" && (
                                                            <Box
                                                                sx={{
                                                                    fontSize:
                                                                        "0.62rem",
                                                                    fontWeight: 700,
                                                                    color: "#86efac",
                                                                    textTransform:
                                                                        "uppercase",
                                                                    letterSpacing:
                                                                        "0.06em",
                                                                    px: 0.7,
                                                                    py: 0.15,
                                                                    borderRadius:
                                                                        "6px",
                                                                    background:
                                                                        "rgba(134,239,172,0.1)",
                                                                    border: "1px solid rgba(134,239,172,0.3)",
                                                                }}
                                                            >
                                                                Auto-pay
                                                            </Box>
                                                        )}
                                                        {pr.region && (
                                                            <Box
                                                                sx={{
                                                                    fontSize:
                                                                        "0.66rem",
                                                                    fontWeight: 700,
                                                                    color: "var(--app-fg-muted)",
                                                                    px: 0.7,
                                                                    py: 0.15,
                                                                    borderRadius:
                                                                        "6px",
                                                                    border: "1px solid var(--app-border)",
                                                                }}
                                                            >
                                                                {pr.region}
                                                            </Box>
                                                        )}
                                                    </Stack>
                                                </Stack>
                                                <Typography
                                                    sx={{
                                                        color: "var(--app-fg-muted)",
                                                        fontSize: "0.76rem",
                                                        mt: 0.2,
                                                    }}
                                                >
                                                    {pr.nickname
                                                        ? `${pr.nickname} · `
                                                        : ""}
                                                    {pr.type === "recurring"
                                                        ? "every "
                                                        : "per "}
                                                    {pr.interval_count > 1
                                                        ? `${pr.interval_count} `
                                                        : ""}
                                                    {pr.interval}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                )}
                            </Box>
                        ))}
                    </Stack>
                )}
            </GlassCard>
            
            <GlassCard sx={{ mt: 2 }}>
                <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
                        Test send
                    </Typography>
                    <Typography
                        sx={{
                            color: "rgba(245,245,244,0.5)",
                            fontSize: "0.82rem",
                        }}
                    >
                        Simulate a completed checkout for one or more email
                        addresses without a real payment. Disabled in
                        production.
                    </Typography>
                </Box>

                {/* Chip input */}
                <Box
                    sx={{
                        minHeight: 48,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.75,
                        alignItems: "center",
                        p: 1,
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.02)",
                        cursor: "text",
                        "&:focus-within": {
                            borderColor: "#9b7bf7",
                        },
                    }}
                    onClick={() =>
                        document
                            .getElementById("test-send-email-input")
                            ?.focus()
                    }
                >
                    {testEmailChips.map((email) => (
                        <Tooltip key={email} title="Remove" placement="top">
                            <Chip
                                label={email}
                                size="small"
                                onDelete={() => removeEmailChip(email)}
                                sx={{
                                    height: 26,
                                    fontSize: "0.78rem",
                                    color: "#c4b5fd",
                                    bgcolor: "rgba(155,123,247,0.12)",
                                    border: "1px solid rgba(155,123,247,0.3)",
                                    "& .MuiChip-deleteIcon": {
                                        color: "rgba(196,181,253,0.5)",
                                        "&:hover": { color: "#c4b5fd" },
                                    },
                                }}
                            />
                        </Tooltip>
                    ))}
                    <Box
                        id="test-send-email-input"
                        component="input"
                        value={testEmailInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setTestEmailInput(e.target.value)
                        }
                        onKeyDown={(
                            e: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                            if (
                                e.key === "Enter" ||
                                e.key === "Tab" ||
                                e.key === ","
                            ) {
                                e.preventDefault();
                                commitEmailInput();
                            }
                            if (
                                e.key === "Backspace" &&
                                testEmailInput === "" &&
                                testEmailChips.length > 0
                            ) {
                                removeEmailChip(
                                    testEmailChips[testEmailChips.length - 1],
                                );
                            }
                        }}
                        onBlur={commitEmailInput}
                        placeholder={
                            testEmailChips.length === 0
                                ? "Enter emails separated by commas…"
                                : ""
                        }
                        sx={{
                            flexGrow: 1,
                            minWidth: 180,
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: "#e5e7eb",
                            fontSize: "0.85rem",
                            fontFamily: "inherit",
                            "::placeholder": {
                                color: "rgba(245,245,244,0.35)",
                            },
                        }}
                    />
                </Box>

                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mt: 1.5 }}
                >
                    {testEmailChips.length > 0 && (
                        <Typography
                            sx={{
                                fontSize: "0.76rem",
                                color: "rgba(245,245,244,0.4)",
                            }}
                        >
                            {testEmailChips.length} recipient
                            {testEmailChips.length !== 1 ? "s" : ""}
                        </Typography>
                    )}
                    <Box sx={{ ml: "auto" }}>
                        <Button
                            onClick={doTestSend}
                            disabled={
                                testSendBusy ||
                                testEmailChips.length === 0
                            }
                            startIcon={
                                testSendBusy ? (
                                    <CircularProgress
                                        size={14}
                                        sx={{ color: "#fff" }}
                                    />
                                ) : (
                                    <SendIcon
                                        sx={{
                                            fontSize: "1rem !important",
                                        }}
                                    />
                                )
                            }
                            sx={{
                                textTransform: "none",
                                fontWeight: 600,
                                color: "#fff",
                                px: 2.2,
                                py: 0.85,
                                borderRadius: "10px",
                                background:
                                    "linear-gradient(135deg, #9b7bf7 0%, #7c5cff 100%)",
                                "&:hover": {
                                    background:
                                        "linear-gradient(135deg, #b094ff 0%, #8a6dff 100%)",
                                },
                                "&.Mui-disabled": {
                                    opacity: 0.4,
                                    color: "#fff",
                                },
                            }}
                        >
                            {testSendBusy ? "Sending…" : "Send test"}
                        </Button>
                    </Box>
                </Stack>

                {/* Per-email results */}
                {testSendResults.length > 0 && (
                    <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                        {testSendResults.map((r) => (
                            <Stack
                                key={r.email}
                                direction="row"
                                spacing={1}
                                alignItems="center"
                            >
                                <CheckCircleIcon
                                    sx={{
                                        fontSize: 15,
                                        color: r.ok
                                            ? "#86efac"
                                            : "rgba(248,113,113,0.85)",
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontSize: "0.82rem",
                                        color: r.ok
                                            ? "rgba(245,245,244,0.75)"
                                            : "rgba(248,113,113,0.85)",
                                        fontFamily: "var(--font-geist-mono)",
                                    }}
                                >
                                    {r.email}
                                    {!r.ok && r.error
                                        ? ` — ${r.error === "invalid_email" ? "invalid email address" : r.error}`
                                        : ""}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                )}
            </GlassCard>
            {/* Developer: how to sync tiers (full guide lives in the docs) */}
            
            <Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}>
                <Button
                    component={Link}
                    href="/docs/catalog"
                    target="_blank"
                    endIcon={
                        <LaunchIcon sx={{ fontSize: "1rem !important" }} />
                    }
                    sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        color: "#c4b5fd",
                        border: "1px solid rgba(155,123,247,0.3)",
                        borderRadius: "12px",
                        px: 3,
                        py: 1.1,
                        "&:hover": {
                            borderColor: "rgba(155,123,247,0.6)",
                            background: "rgba(155,123,247,0.06)",
                        },
                    }}
                >
                    Sync tiers from code — developer guide
                </Button>
            </Box>

            {/* App links — homepage & pricing page (editable) */}
            <GlassCard sx={{ mt: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem" }}>Links</Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", mb: 2 }}>
                    Your homepage and pricing page — shown to buyers and surfaced on this product.
                </Typography>
                <Stack spacing={1.6}>
                    <Box>
                        <Typography sx={{ fontSize: "0.7rem", color: "var(--app-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.5 }}>
                            Homepage URL
                        </Typography>
                        <TextField
                            value={homepageDraft}
                            onChange={(e) => setHomepageDraft(e.target.value)}
                            placeholder="https://yourapp.com"
                            size="small"
                            fullWidth
                            sx={field}
                        />
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: "0.7rem", color: "var(--app-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.5 }}>
                            Pricing page URL
                        </Typography>
                        <TextField
                            value={pricingDraft}
                            onChange={(e) => setPricingDraft(e.target.value)}
                            placeholder="https://yourapp.com/pricing"
                            size="small"
                            fullWidth
                            sx={field}
                        />
                    </Box>
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.8 }}>
                    <Button
                        onClick={saveLinks}
                        disabled={
                            linksBusy ||
                            (homepageDraft.trim() === (product.homepage_url || "") &&
                                pricingDraft.trim() === (product.pricing_url || ""))
                        }
                        sx={{ textTransform: "none", fontWeight: 600, color: "#fff", px: 2.4, py: 0.9, borderRadius: "10px", background: "#7c5cff", "&:hover": { background: "#8a6dff" }, "&.Mui-disabled": { opacity: 0.5, color: "#fff" } }}
                    >
                        {linksBusy ? "Saving…" : "Save links"}
                    </Button>
                    {linksSaved && (
                        <Typography sx={{ color: "#86efac", fontSize: "0.82rem" }}>Saved ✓</Typography>
                    )}
                    {linksErr && (
                        <Typography sx={{ color: "#f87171", fontSize: "0.82rem" }}>{linksErr}</Typography>
                    )}
                </Stack>
                <Typography sx={{ color: "var(--app-fg-faint)", fontSize: "0.72rem", mt: 1 }}>
                    Must be a <code>https://</code> URL. Leave blank to clear.
                </Typography>
            </GlassCard>

            {/* Danger zone — permanent delete */}
            <GlassCard sx={{ mt: 2, border: "1px solid rgba(239,68,68,0.3)" }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: "#f87171" }}>
                    Danger zone
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1.5} sx={{ mt: 1 }}>
                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.85rem", maxWidth: 540 }}>
                        Permanently delete this product and everything in it — all tiers, prices,
                        webhook config, and API credentials. This <strong>cannot be undone</strong>.
                        Prefer <strong>Archive</strong> if you might bring it back.
                    </Typography>
                    <Button
                        onClick={() => {
                            setDeleteErr("");
                            setConfirmDelete(true);
                        }}
                        sx={{ textTransform: "none", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", px: 2.4, py: 0.9, borderRadius: "10px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", "&:hover": { background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)" } }}
                    >
                        Delete product
                    </Button>
                </Stack>
                {deleteErr && (
                    <Typography sx={{ color: "#f87171", fontSize: "0.82rem", mt: 1.2 }}>{deleteErr}</Typography>
                )}
            </GlassCard>

            <ConfirmDialog
                open={confirmArchive}
                destructive
                busy={archiveBusy}
                title="Archive this product?"
                confirmLabel="Archive product"
                message={
                    <>
                        This <strong>pauses all payments</strong> for{" "}
                        <strong>{product.app_name}</strong> — checkout stops
                        working and no new entitlements are granted. Existing
                        members keep their access until it expires. You can
                        unarchive anytime to resume.
                    </>
                }
                onConfirm={doArchive}
                onClose={() => setConfirmArchive(false)}
            />

            <RotateDialog
                open={confirmRegen}
                busy={regenBusy}
                title="Rotate the secret key?"
                confirmLabel="Rotate key"
                message={
                    <>
                        A new secret key is issued. Pick how long the{" "}
                        <strong>current key</strong> keeps working so your app
                        (checkout + entitlements API) can redeploy without
                        failures.
                    </>
                }
                onConfirm={doRegenerate}
                onClose={() => setConfirmRegen(false)}
            />

            <RotateDialog
                open={confirmWebhookRegen}
                busy={webhookBusy}
                title="Roll the webhook signing secret?"
                confirmLabel="Roll secret"
                message={
                    <>
                        A new <code>whsec_</code> is issued. During the grace
                        window we sign each delivery with <strong>both</strong>{" "}
                        secrets, so your app keeps verifying while you update{" "}
                        <code>ELIXPO_PAY_WEBHOOK_SECRET</code>.
                    </>
                }
                onConfirm={regenWebhookSecret}
                onClose={() => setConfirmWebhookRegen(false)}
            />

            <ChangeIdDialog
                open={changeIdOpen}
                currentId={product.client_id}
                graceHours={5}
                busy={changeIdBusy}
                error={changeIdErr}
                onConfirm={doChangeId}
                onClose={() => {
                    setChangeIdOpen(false);
                    setChangeIdErr("");
                }}
            />

            <ConfirmDialog
                open={confirmDelete}
                destructive
                busy={deleteBusy}
                title="Permanently delete this product?"
                confirmLabel="Delete forever"
                message={
                    <>
                        This <strong>permanently deletes {product.app_name}</strong> and
                        everything in it — all tiers, prices, webhook configuration, and
                        API credentials. This <strong>cannot be undone</strong>. (Products
                        with captured payments can't be deleted — archive those instead.)
                    </>
                }
                onConfirm={doDelete}
                onClose={() => setConfirmDelete(false)}
            />
        </Box>
    );
}

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

const mono = {
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.82rem",
    p: 1.2,
    borderRadius: "10px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--app-border)",
    overflowX: "auto",
    whiteSpace: "nowrap",
};

const purpleOutlineBtn = {
    textTransform: "none",
    fontWeight: 600,
    color: "#c4b5fd",
    border: "1px solid rgba(155,123,247,0.3)",
    borderRadius: "10px",
    px: 2,
    "&:hover": {
        borderColor: "rgba(155,123,247,0.6)",
        background: "rgba(155,123,247,0.06)",
    },
};
