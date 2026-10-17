"use client";

import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import SaveIcon from "@mui/icons-material/Save";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CustomOAuthScope } from "@/lib/oauth-scope-registry";
import { OAuthScopePicker } from "../../../components/oauth-scope-picker";

const cardSx = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    p: 3,
};

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: "#ff7759" },
    },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#ff7759" },
    "& .MuiFormHelperText-root": { color: "var(--fg-faint)" },
};

const monoBox = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    background: "var(--surface)",
    border: "1px solid rgba(255, 119, 89,0.2)",
    borderRadius: "8px",
    p: 1.5,
};

function appIconSources(homepageUrl: string, logoUrl: string): string[] {
    const sources = logoUrl ? [logoUrl] : [];
    if (!homepageUrl) return sources;
    try {
        const url = new URL(homepageUrl);
        sources.push(
            `${url.origin}/favicon.ico`,
            `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`,
        );
        return [...new Set(sources)];
    } catch {
        return sources;
    }
}

export default function OAuthAppSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const clientId = params.client_id as string;

    const [app, setApp] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);
    const [verifyingDomain, setVerifyingDomain] = useState(false);
    const [verifyMessage, setVerifyMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);
    const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
        "desktop",
    );
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(
        null,
    );
    const [regenerating, setRegenerating] = useState(false);
    const [iconStage, setIconStage] = useState(0);

    const [form, setForm] = useState({
        name: "",
        description: "",
        homepage_url: "",
        redirect_uris: [""] as string[],
        logo_url: "",
        branding_display_name: "",
        branding_primary_color: "",
        branding_accent_color: "",
        privacy_policy_url: "",
        terms_of_service_url: "",
        audience: "",
        scopes: ["openid", "profile", "email"] as string[],
        custom_scopes: [] as CustomOAuthScope[],
    });

    // ── Webhook endpoints state ─────────────────────────────────────────
    const WEBHOOK_EVENTS = [
        "user.deleted",
        "user.updated",
        "app.revoked",
        "app.authorized",
    ] as const;

    interface WebhookEndpoint {
        id: string;
        url: string;
        events: string[];
        is_active: boolean;
        label: string | null;
        created_at: string;
        secret_set_at: string;
        last_delivery_at: string | null;
        last_status_code: number | null;
        last_error: string | null;
    }
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [endpointsLoading, setEndpointsLoading] = useState(true);
    // Newly minted plaintext secrets keyed by endpoint id — surfaced once
    // after create or rotate, dismissed when the user clicks "I've saved it".
    const [revealedSecrets, setRevealedSecrets] = useState<
        Record<string, string>
    >({});
    const [endpointBusy, setEndpointBusy] = useState<string | null>(null);
    const [webhookMessage, setWebhookMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    // New-endpoint form (modeless inline panel above the table).
    const [newEndpoint, setNewEndpoint] = useState<{
        url: string;
        events: string[];
        label: string;
    }>({ url: "", events: [], label: "" });
    const [creatingEndpoint, setCreatingEndpoint] = useState(false);

    // ── Activity stats (sign-ins + webhook delivery) ────────────────────
    interface AppStats {
        request_count: number;
        last_used: string | null;
        total_sign_ins: number;
        unique_users: number;
        active_sessions: number;
        sign_in_timeline: Array<{ date: string; count: number }>;
        timeline_days: number;
        can_export_lifetime: boolean;
        branding_verification_required: boolean;
        webhooks: {
            total_endpoints: number;
            active_endpoints: number;
            last_delivery_at: string | null;
        };
    }
    const [stats, setStats] = useState<AppStats | null>(null);
    const [activityDays, setActivityDays] = useState(30);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `/api/auth/oauth-clients/${clientId}/stats?days=${activityDays}`,
                    { credentials: "include" },
                );
                if (!res.ok) return;
                const data: any = await res.json();
                if (!cancelled) setStats(data);
            } catch {
                /* non-fatal — stats panel just renders empty state */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activityDays, clientId]);

    useEffect(() => {
        const fetchApp = async () => {
            try {
                const res = await fetch(`/api/auth/oauth-clients/${clientId}`, {
                    credentials: "include",
                });
                if (!res.ok) throw new Error("Not found");
                const data: any = await res.json();
                setApp(data);
                const uris = Array.isArray(data.redirect_uris)
                    ? data.redirect_uris
                    : data.redirect_uris
                      ? [data.redirect_uris]
                      : [""];
                setForm({
                    name: data.name || "",
                    description: data.description || "",
                    homepage_url: data.homepage_url || "",
                    redirect_uris: uris.length > 0 ? uris : [""],
                    logo_url: data.logo_url || "",
                    branding_display_name: data.branding_display_name || "",
                    branding_primary_color: data.branding_primary_color || "",
                    branding_accent_color: data.branding_accent_color || "",
                    privacy_policy_url: data.privacy_policy_url || "",
                    terms_of_service_url: data.terms_of_service_url || "",
                    audience: data.audience || "",
                    scopes: Array.isArray(data.scopes)
                        ? data.scopes
                        : ["openid", "profile", "email"],
                    custom_scopes: Array.isArray(data.custom_scopes)
                        ? data.custom_scopes
                        : [],
                });
            } catch {
                router.push("/dashboard/oauth-apps");
            } finally {
                setLoading(false);
            }
        };
        fetchApp();
    }, [clientId, router]);

    // Load the app's webhook endpoints. Separate effect so the OAuth-app
    // fetch can fail open if endpoints lookup hiccups.
    const loadEndpoints = async () => {
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/webhooks`,
                { credentials: "include" },
            );
            if (!res.ok) return;
            const data: any = await res.json();
            setEndpoints(data.endpoints || []);
        } catch {
            /* non-fatal */
        } finally {
            setEndpointsLoading(false);
        }
    };
    useEffect(() => {
        loadEndpoints();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadEndpoints]);

    const handleCreateEndpoint = async () => {
        const url = newEndpoint.url.trim();
        if (!url) {
            setWebhookMessage({ text: "URL is required", type: "error" });
            return;
        }
        if (newEndpoint.events.length === 0) {
            setWebhookMessage({
                text: "Select at least one event",
                type: "error",
            });
            return;
        }
        setCreatingEndpoint(true);
        setWebhookMessage(null);
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/webhooks`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url,
                        events: newEndpoint.events,
                        label: newEndpoint.label || null,
                    }),
                },
            );
            const data: any = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create");
            setRevealedSecrets((s) => ({
                ...s,
                [data.id]: data.webhook_secret,
            }));
            setNewEndpoint({ url: "", events: [], label: "" });
            await loadEndpoints();
            setWebhookMessage({
                text: "Endpoint created — copy the secret below",
                type: "success",
            });
        } catch (err: any) {
            setWebhookMessage({ text: err.message, type: "error" });
        } finally {
            setCreatingEndpoint(false);
        }
    };

    const handleToggleEndpoint = async (
        ep: WebhookEndpoint,
        is_active: boolean,
    ) => {
        setEndpointBusy(ep.id);
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/webhooks/${ep.id}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active }),
                },
            );
            if (!res.ok) {
                const e: any = await res.json();
                throw new Error(e.error || "Update failed");
            }
            await loadEndpoints();
        } catch (err: any) {
            setWebhookMessage({ text: err.message, type: "error" });
        } finally {
            setEndpointBusy(null);
        }
    };

    const handleDeleteEndpoint = async (ep: WebhookEndpoint) => {
        if (
            !confirm(
                `Delete endpoint ${ep.url}? This stops deliveries to it and revokes its secret.`,
            )
        )
            return;
        setEndpointBusy(ep.id);
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/webhooks/${ep.id}`,
                { method: "DELETE", credentials: "include" },
            );
            if (!res.ok) {
                const e: any = await res.json();
                throw new Error(e.error || "Delete failed");
            }
            await loadEndpoints();
        } catch (err: any) {
            setWebhookMessage({ text: err.message, type: "error" });
        } finally {
            setEndpointBusy(null);
        }
    };

    const handleRotateEndpoint = async (ep: WebhookEndpoint) => {
        if (
            !confirm(
                "Rotate this endpoint's secret? The previous secret stops being honored immediately.",
            )
        )
            return;
        setEndpointBusy(ep.id);
        setWebhookMessage(null);
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/webhooks/${ep.id}/rotate`,
                { method: "POST", credentials: "include" },
            );
            const data: any = await res.json();
            if (!res.ok) throw new Error(data.error || "Rotation failed");
            setRevealedSecrets((s) => ({
                ...s,
                [ep.id]: data.webhook_secret,
            }));
            await loadEndpoints();
        } catch (err: any) {
            setWebhookMessage({ text: err.message, type: "error" });
        } finally {
            setEndpointBusy(null);
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const redirectUris = form.redirect_uris
                .map((u) => u.trim())
                .filter(Boolean);
            const res = await fetch(`/api/auth/oauth-clients/${clientId}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    description: form.description,
                    homepage_url: form.homepage_url,
                    redirect_uris: redirectUris,
                    logo_url: form.logo_url,
                    branding_display_name: form.branding_display_name,
                    branding_primary_color: form.branding_primary_color,
                    branding_accent_color: form.branding_accent_color,
                    privacy_policy_url: form.privacy_policy_url,
                    terms_of_service_url: form.terms_of_service_url,
                    scopes: form.scopes,
                    custom_scopes: form.custom_scopes,
                    ...(app?.client_type === "public" && {
                        audience: form.audience,
                    }),
                }),
            });
            if (!res.ok) {
                const err: any = await res.json();
                throw new Error(err.error || "Failed to save");
            }
            const updated: any = await res.json();
            setApp(updated);
            setMessage({
                text: "Application updated successfully",
                type: "success",
            });
        } catch (err: any) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleVerifyDomain = async () => {
        setVerifyingDomain(true);
        setVerifyMessage(null);
        try {
            const res = await fetch(
                `/api/auth/oauth-clients/${clientId}/verify`,
                {
                    method: "POST",
                    credentials: "include",
                },
            );
            const data: any = await res.json();
            if (!res.ok) throw new Error(data.error || "Verification failed");
            setVerifyMessage({ text: data.message, type: "success" });
            setApp((prev: any) => ({
                ...prev,
                is_branding_verified: 1,
                branding_verified_domain: data.verified_domain,
            }));
        } catch (err: any) {
            setVerifyMessage({ text: err.message, type: "error" });
        } finally {
            setVerifyingDomain(false);
        }
    };

    const getContrastColorLocal = (hex: string): string => {
        if (!hex?.startsWith("#")) return "#FFFFFF";
        let cleanHex = hex.slice(1);
        if (cleanHex.length === 3 || cleanHex.length === 4) {
            cleanHex = cleanHex
                .split("")
                .map((c) => c + c)
                .join("");
        }
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
            return "#FFFFFF";

        const [rs, gs, bs] = [r, g, b].map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        return luminance > 0.179 ? "#000000" : "#FFFFFF";
    };

    const getContrastRatioLocal = (hex1: string, hex2: string): number => {
        const hexToRgb = (hex: string) => {
            let cleanHex = hex.slice(1);
            if (cleanHex.length === 3 || cleanHex.length === 4) {
                cleanHex = cleanHex
                    .split("")
                    .map((c) => c + c)
                    .join("");
            }
            const r = parseInt(cleanHex.slice(0, 2), 16);
            const g = parseInt(cleanHex.slice(2, 4), 16);
            const b = parseInt(cleanHex.slice(4, 6), 16);
            return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)
                ? null
                : { r, g, b };
        };
        const getLuminance = (rgb: { r: number; g: number; b: number }) => {
            const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
                const s = c / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };
        const rgb1 = hexToRgb(hex1);
        const rgb2 = hexToRgb(hex2);
        if (!rgb1 || !rgb2) return 1;
        const l1 = getLuminance(rgb1);
        const l2 = getLuminance(rgb2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const _hasSufficientContrastLocal = (hex: string): boolean => {
        const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        if (!HEX_REGEX.test(hex)) return false;
        const ratioWhite = getContrastRatioLocal(hex, "#FFFFFF");
        const ratioBlack = getContrastRatioLocal(hex, "#000000");
        return ratioWhite >= 4.5 || ratioBlack >= 4.5;
    };

    const verificationDomain = (() => {
        try {
            return new URL(form.homepage_url).hostname;
        } catch {
            return "your-domain.com";
        }
    })();

    const handleDelete = async () => {
        if (
            !confirm(
                "Delete this application? All OAuth tokens issued by this app will be revoked. This cannot be undone.",
            )
        )
            return;
        try {
            const res = await fetch(`/api/auth/oauth-clients/${clientId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to delete");
            router.push("/dashboard/oauth-apps");
        } catch {
            setMessage({ text: "Failed to delete application", type: "error" });
        }
    };

    const handleRegenerateSecret = async () => {
        if (
            !confirm(
                "Regenerate client secret? The old secret will stop working immediately.",
            )
        )
            return;
        setRegenerating(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/auth/oauth-clients/${clientId}`, {
                method: "PATCH",
                credentials: "include",
            });
            if (!res.ok) {
                const err: any = await res.json();
                throw new Error(err.error || "Failed to regenerate secret");
            }
            const data: any = await res.json();
            setRegeneratedSecret(data.client_secret);
            setMessage({
                text: "Client secret regenerated. Copy it now.",
                type: "success",
            });
        } catch (err: any) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setRegenerating(false);
        }
    };

    const iconSources = appIconSources(form.homepage_url, form.logo_url);
    const faviconUrl = iconSources[iconStage] || null;
    useEffect(() => setIconStage(0), []);

    const missingApplicationDetail = !form.name.trim()
        ? "Name required"
        : !form.homepage_url.trim()
          ? "Homepage required"
          : app?.client_type === "public" && !form.audience.trim()
            ? "Audience required"
            : !form.description.trim()
              ? "Add description"
              : null;
    const redirectCount = form.redirect_uris.filter((uri) => uri.trim()).length;
    const brandingConfigured = Boolean(
        form.logo_url.trim() ||
            form.branding_display_name.trim() ||
            form.branding_primary_color.trim() ||
            form.branding_accent_color.trim(),
    );
    const sectionNavigation = [
        {
            id: "overview",
            label: "Application",
            status: missingApplicationDetail || "Complete",
            needsAttention: Boolean(
                missingApplicationDetail?.endsWith("required"),
            ),
        },
        {
            id: "credentials",
            label: "Client secret",
            status:
                app?.client_type === "public" ? "Not required" : "Configured",
            needsAttention: false,
        },
        {
            id: "webhooks",
            label: "Webhook endpoints",
            status: endpointsLoading
                ? "Loading…"
                : endpoints.length > 0
                  ? `${endpoints.length} configured`
                  : "Optional",
            needsAttention: false,
        },
        {
            id: "routes",
            label: "Redirects & info",
            status:
                redirectCount > 0
                    ? `${redirectCount} configured`
                    : app?.client_type === "public"
                      ? "Optional"
                      : "Missing redirect",
            needsAttention:
                app?.client_type !== "public" && redirectCount === 0,
        },
        {
            id: "branding",
            label: "Branding & identity",
            status: app?.is_branding_verified
                ? "Verified"
                : brandingConfigured
                  ? "Needs verification"
                  : "Optional",
            needsAttention: false,
        },
        {
            id: "activity",
            label: "Activity",
            status: stats ? `${stats.unique_users} users` : "No activity yet",
            needsAttention: false,
        },
        {
            id: "danger",
            label: "Danger zone",
            status: "Delete app",
            needsAttention: false,
        },
    ];

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 10,
                }}
            >
                <CircularProgress sx={{ color: "#ff7759" }} />
            </Box>
        );
    }

    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: {
                    xs: "minmax(0, 1fr)",
                    lg: "240px minmax(0, 1fr) minmax(0, 1fr)",
                },
                gap: 2.5,
                alignItems: "start",
            }}
        >
            {/* Back + Header */}
            <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => router.push("/dashboard/oauth-apps")}
                sx={{
                    gridColumn: "1 / -1",
                    justifySelf: "start",
                    color: "var(--fg-faint)",
                    textTransform: "none",
                    "&:hover": { color: "var(--fg)" },
                }}
            >
                Back to OAuth Apps
            </Button>

            <Box
                sx={{
                    gridColumn: "1 / -1",
                    position: "sticky",
                    top: { xs: 56, sm: 64 },
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 2,
                    mx: { xs: -1, sm: 0 },
                    px: { xs: 1, sm: 1.5 },
                    py: 1.5,
                    bgcolor: "color-mix(in srgb, var(--bg) 88%, transparent)",
                    backdropFilter: "blur(16px)",
                    border: "1px solid var(--border)",
                    borderRadius: "14px",
                    boxShadow: "0 8px 24px var(--overlay)",
                }}
            >
                {/* Favicon */}
                {faviconUrl ? (
                    <Box
                        component="img"
                        src={faviconUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "10px",
                            bgcolor: "var(--overlay)",
                            p: 0.5,
                        }}
                        onError={() => setIconStage((stage) => stage + 1)}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "10px",
                            bgcolor: "rgba(255, 119, 89,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ff7759",
                            fontSize: "1.2rem",
                            fontWeight: 700,
                        }}
                    >
                        {(app?.name || "A").charAt(0).toUpperCase()}
                    </Box>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="h5"
                        sx={{ fontWeight: 700, color: "var(--fg)" }}
                    >
                        {app?.name || "Application Settings"}
                    </Typography>
                    {form.homepage_url && (
                        <Typography
                            component="a"
                            href={form.homepage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                                color: "var(--fg-faint)",
                                fontSize: "0.8rem",
                                textDecoration: "none",
                                fontFamily: "monospace",
                                "&:hover": { color: "#ff7759" },
                            }}
                        >
                            {(() => {
                                try {
                                    return new URL(form.homepage_url).hostname;
                                } catch {
                                    return form.homepage_url;
                                }
                            })()}
                        </Typography>
                    )}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            mt: 0.25,
                        }}
                    >
                        <Typography
                            sx={{
                                color: "var(--fg-faint)",
                                fontFamily: "monospace",
                                fontSize: "0.72rem",
                                wordBreak: "break-all",
                            }}
                        >
                            {app?.client_id || clientId}
                        </Typography>
                        <Tooltip
                            title={
                                copiedField === "client_id" ? "Copied!" : "Copy"
                            }
                        >
                            <IconButton
                                size="small"
                                onClick={() =>
                                    copyToClipboard(
                                        app?.client_id || clientId,
                                        "client_id",
                                    )
                                }
                                sx={{ color: "#ff7759", p: 0.25 }}
                            >
                                <ContentCopyIcon sx={{ fontSize: "0.85rem" }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                <Chip
                    label={
                        app?.client_type === "public"
                            ? "Device Flow"
                            : "Web Application"
                    }
                    size="small"
                    sx={{
                        ml: { xs: 0, sm: "auto" },
                        bgcolor:
                            app?.client_type === "public"
                                ? "rgba(255, 119, 89, 0.12)"
                                : "var(--overlay)",
                        color:
                            app?.client_type === "public"
                                ? "#ff7759"
                                : "var(--fg-muted)",
                        border: "1px solid var(--border)",
                    }}
                />
                {app?.is_active === false && (
                    <Chip
                        label="Inactive"
                        size="small"
                        sx={{
                            bgcolor: "rgba(107,114,128,0.2)",
                            color: "var(--fg-faint)",
                        }}
                    />
                )}
                <Button
                    component="a"
                    href="/docs/lixaccounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                    sx={{
                        width: { xs: "100%", sm: "auto" },
                        borderColor: "rgba(255, 119, 89,0.3)",
                        color: "#ff7759",
                        textTransform: "none",
                        "&:hover": {
                            borderColor: "#ff7759",
                            bgcolor: "rgba(255, 119, 89,0.08)",
                        },
                    }}
                >
                    SDK Docs
                </Button>
                <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={saving}
                    sx={{
                        width: { xs: "100%", sm: "auto" },
                        background: "rgba(255, 119, 89,0.15)",
                        color: "#ff7759",
                        border: "1px solid rgba(255, 119, 89,0.3)",
                        fontWeight: 600,
                        textTransform: "none",
                        "&:hover": { background: "rgba(255, 119, 89,0.25)" },
                    }}
                >
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </Box>

            {message && (
                <Alert
                    severity={message.type}
                    onClose={() => setMessage(null)}
                    sx={{
                        gridColumn: "1 / -1",
                        bgcolor:
                            message.type === "success"
                                ? "rgba(255, 119, 89,0.1)"
                                : "rgba(239,68,68,0.1)",
                        color:
                            message.type === "success" ? "#ff7759" : "#b91c1c",
                        border: `1px solid ${message.type === "success" ? "rgba(255, 119, 89,0.3)" : "rgba(239,68,68,0.3)"}`,
                        "& .MuiAlert-icon": {
                            color:
                                message.type === "success"
                                    ? "#ff7759"
                                    : "#b91c1c",
                        },
                    }}
                >
                    {message.text}
                </Alert>
            )}

            <Box
                component="nav"
                aria-label="Application settings sections"
                sx={{
                    display: { xs: "none", lg: "flex" },
                    position: "sticky",
                    top: 150,
                    gridColumn: "1",
                    gridRow: "span 7",
                    order: 1,
                    flexDirection: "column",
                    gap: 0.5,
                    p: 1,
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    bgcolor: "var(--surface)",
                }}
            >
                {sectionNavigation.map((section) => (
                    <Button
                        key={section.id}
                        component="a"
                        href={`#${section.id}`}
                        sx={{
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 1,
                            color: "var(--fg-muted)",
                            textTransform: "none",
                            fontSize: "0.82rem",
                            "&:hover": {
                                color: "#ff7759",
                                bgcolor: "rgba(255, 119, 89,0.08)",
                            },
                        }}
                    >
                        <span>{section.label}</span>
                        <Typography
                            component="span"
                            sx={{
                                color: section.needsAttention
                                    ? "#b45309"
                                    : "var(--fg-faint)",
                                fontSize: "0.62rem",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {section.status}
                        </Typography>
                    </Button>
                ))}
            </Box>

            {/* Bento Grid */}
            <Box
                sx={{
                    display: "contents",
                }}
            >
                {/* Client Secret */}
                <Box
                    id="credentials"
                    sx={{
                        ...cardSx,
                        order: 2,
                        gridColumn: { xs: "1", lg: "2 / -1" },
                        scrollMarginTop: "150px",
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.8rem",
                            mb: 1,
                            fontWeight: 500,
                        }}
                    >
                        {app?.client_type === "public"
                            ? "Token authentication"
                            : "Client Secret"}
                    </Typography>
                    {app?.client_type === "public" ? (
                        <Alert severity="info">
                            Device Flow apps do not need a client secret. They
                            securely exchange the device code for tokens after
                            the user approves access.
                        </Alert>
                    ) : regeneratedSecret ? (
                        <>
                            <Box
                                sx={{
                                    ...monoBox,
                                    border: "1px solid rgba(255, 119, 89,0.4)",
                                }}
                            >
                                <Typography
                                    sx={{
                                        color: "#ff7759",
                                        fontFamily: "monospace",
                                        fontSize: "0.8rem",
                                        flex: 1,
                                        wordBreak: "break-all",
                                    }}
                                >
                                    {regeneratedSecret}
                                </Typography>
                                <Tooltip
                                    title={
                                        copiedField === "secret"
                                            ? "Copied!"
                                            : "Copy"
                                    }
                                >
                                    <IconButton
                                        size="small"
                                        onClick={() =>
                                            copyToClipboard(
                                                regeneratedSecret,
                                                "secret",
                                            )
                                        }
                                        sx={{ color: "#ff7759" }}
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "#ff7759",
                                    mt: 0.5,
                                    display: "block",
                                }}
                            >
                                Copy now — won't be shown again.
                            </Typography>
                        </>
                    ) : (
                        <>
                            <Box
                                sx={{
                                    ...monoBox,
                                    border: "1px solid rgba(239,68,68,0.2)",
                                }}
                            >
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontFamily: "monospace",
                                        fontSize: "0.85rem",
                                        flex: 1,
                                    }}
                                >
                                    ••••••••••••••••••••••••••••
                                </Typography>
                                <Button
                                    size="small"
                                    startIcon={<RefreshIcon />}
                                    onClick={handleRegenerateSecret}
                                    disabled={regenerating}
                                    sx={{
                                        color: "#ff7759",
                                        textTransform: "none",
                                        flexShrink: 0,
                                    }}
                                >
                                    {regenerating
                                        ? "Regenerating…"
                                        : "Regenerate"}
                                </Button>
                            </Box>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "var(--fg-faint)",
                                    mt: 0.5,
                                    display: "block",
                                }}
                            >
                                Click refresh to regenerate
                            </Typography>
                        </>
                    )}
                </Box>

                {/* General Settings */}
                <Box
                    id="overview"
                    sx={{
                        ...cardSx,
                        order: 1,
                        gridColumn: { xs: "1", lg: "2 / -1" },
                        scrollMarginTop: "150px",
                    }}
                >
                    <Typography
                        sx={{ color: "var(--fg)", fontWeight: 600, mb: 2 }}
                    >
                        General
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                md:
                                    app?.client_type === "public"
                                        ? "1fr 1fr"
                                        : "1fr",
                            },
                            gap: 2,
                        }}
                    >
                        <Box sx={{ gridColumn: "1 / -1" }}>
                            <TextField
                                fullWidth
                                label="Application Name"
                                value={form.name}
                                onChange={(e) =>
                                    setForm({ ...form, name: e.target.value })
                                }
                                sx={textFieldSx}
                            />
                        </Box>
                        <Box sx={{ gridColumn: "1 / -1" }}>
                            <TextField
                                fullWidth
                                label="Description"
                                placeholder="What does your application do?"
                                value={form.description}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        description: e.target.value,
                                    })
                                }
                                multiline
                                rows={2}
                                sx={textFieldSx}
                            />
                        </Box>
                        <TextField
                            fullWidth
                            label="Homepage URL"
                            placeholder="https://example.com"
                            value={form.homepage_url}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    homepage_url: e.target.value,
                                })
                            }
                            sx={textFieldSx}
                        />
                        {app?.client_type === "public" && (
                            <TextField
                                fullWidth
                                label="Resource audience"
                                value={form.audience}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        audience: event.target.value,
                                    })
                                }
                                placeholder="blogs.elixpo.com"
                                helperText="Host only; bound into access tokens"
                                sx={textFieldSx}
                            />
                        )}
                    </Box>
                </Box>

                {/* Redirect URIs */}
                <Box
                    id="routes"
                    sx={{
                        ...cardSx,
                        order: 4,
                        gridColumn: { xs: "1", lg: "2" },
                        scrollMarginTop: "150px",
                    }}
                >
                    <Typography
                        sx={{ color: "var(--fg)", fontWeight: 600, mb: 0.5 }}
                    >
                        Redirect URIs
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: "var(--fg-faint)",
                            display: "block",
                            mb: 2,
                        }}
                    >
                        Callback URLs for authorization (up to 5)
                    </Typography>
                    {form.redirect_uris.map((uri, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                mb: 1,
                            }}
                        >
                            <TextField
                                fullWidth
                                size="small"
                                value={uri}
                                onChange={(e) => {
                                    const updated = [...form.redirect_uris];
                                    updated[index] = e.target.value;
                                    setForm({
                                        ...form,
                                        redirect_uris: updated,
                                    });
                                }}
                                placeholder="https://example.com/callback"
                                sx={textFieldSx}
                            />
                            {form.redirect_uris.length > 1 && (
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const updated =
                                            form.redirect_uris.filter(
                                                (_, i) => i !== index,
                                            );
                                        setForm({
                                            ...form,
                                            redirect_uris: updated,
                                        });
                                    }}
                                    sx={{
                                        color: "#b91c1c",
                                        "&:hover": {
                                            bgcolor: "rgba(239,68,68,0.1)",
                                        },
                                    }}
                                >
                                    <RemoveCircleOutlineIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    ))}
                    {form.redirect_uris.length < 5 && (
                        <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() =>
                                setForm({
                                    ...form,
                                    redirect_uris: [...form.redirect_uris, ""],
                                })
                            }
                            sx={{
                                color: "#ff7759",
                                textTransform: "none",
                                fontSize: "0.8rem",
                                mt: 0.5,
                            }}
                        >
                            Add URI
                        </Button>
                    )}
                </Box>

                {/* Scopes + Stats */}
                <Box
                    sx={{
                        ...cardSx,
                        order: 4,
                        gridColumn: { xs: "1", lg: "3" },
                    }}
                >
                    <Typography
                        sx={{ color: "var(--fg)", fontWeight: 600, mb: 2 }}
                    >
                        Info
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                        <Typography
                            sx={{
                                color: "var(--fg-faint)",
                                fontSize: "0.8rem",
                                mb: 0.75,
                            }}
                        >
                            Scopes
                        </Typography>
                        <OAuthScopePicker
                            selectedScopes={form.scopes}
                            customScopes={form.custom_scopes}
                            onSelectedScopesChange={(scopes) =>
                                setForm({ ...form, scopes })
                            }
                            onCustomScopesChange={(custom_scopes) =>
                                setForm({ ...form, custom_scopes })
                            }
                        />
                    </Box>

                    <Typography
                        sx={{ color: "var(--fg-faint)", fontSize: "0.8rem" }}
                    >
                        Type: {app?.client_type || "confidential"} · Auth:{" "}
                        {app?.token_endpoint_auth_method ||
                            "client_secret_post"}
                        {app?.audience ? ` · Audience: ${app.audience}` : ""}
                        {app?.owner_id ? ` · Owner: ${app.owner_id}` : ""}
                    </Typography>

                    {app?.request_count !== undefined && (
                        <Box sx={{ mb: 2 }}>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.8rem",
                                    mb: 0.25,
                                }}
                            >
                                Requests
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--fg)",
                                    fontWeight: 600,
                                    fontSize: "1.5rem",
                                }}
                            >
                                {app.request_count.toLocaleString()}
                            </Typography>
                        </Box>
                    )}

                    {app?.created_at && (
                        <Box>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.8rem",
                                    mb: 0.25,
                                }}
                            >
                                Created
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.9rem",
                                }}
                            >
                                {new Date(app.created_at).toLocaleDateString()}
                            </Typography>
                        </Box>
                    )}
                    {Array.isArray(app?.audit_history) &&
                        app.audit_history.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.75,
                                    }}
                                >
                                    Recent audit history
                                </Typography>
                                {app.audit_history
                                    .slice(0, 5)
                                    .map(
                                        (entry: {
                                            event_type: string;
                                            status: string;
                                            created_at: string;
                                        }) => (
                                            <Typography
                                                key={`${entry.event_type}-${entry.created_at}`}
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    fontSize: "0.72rem",
                                                    fontFamily: "monospace",
                                                    mb: 0.5,
                                                }}
                                            >
                                                {entry.event_type} ·{" "}
                                                {entry.status} ·{" "}
                                                {new Date(
                                                    entry.created_at,
                                                ).toLocaleString()}
                                            </Typography>
                                        ),
                                    )}
                            </Box>
                        )}
                </Box>
            </Box>

            {/* Custom Branding & Identity card */}
            <Box
                id="branding"
                sx={{
                    ...cardSx,
                    order: 5,
                    gridColumn: { xs: "1", lg: "2 / -1" },
                    scrollMarginTop: "150px",
                }}
            >
                <Typography
                    sx={{ color: "var(--fg)", fontWeight: 600, mb: 0.5 }}
                >
                    Custom Branding & Identity
                </Typography>
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.85rem",
                        mb: 3,
                    }}
                >
                    Configure custom colors, display name, and policy links for
                    a continuous sign-in handshake. Unverified branding is
                    automatically hidden to prevent phishing.
                </Typography>

                {/* Domain Verification Section */}
                <Box
                    sx={{
                        p: 2.5,
                        mb: 3,
                        bgcolor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 2,
                            mb: 1.5,
                        }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 600,
                                color: "var(--fg)",
                                fontSize: "0.95rem",
                            }}
                        >
                            Domain Verification Status
                        </Typography>
                        {app?.is_branding_verified ? (
                            <Chip
                                label="Verified & Active"
                                color="success"
                                size="small"
                                sx={{ fontWeight: 600 }}
                            />
                        ) : (
                            <Chip
                                label="Inactive (Domain Unverified)"
                                color="warning"
                                size="small"
                                sx={{ fontWeight: 600 }}
                            />
                        )}
                    </Box>

                    {app?.is_branding_verified ? (
                        <Typography
                            sx={{
                                color: "var(--fg-muted)",
                                fontSize: "0.85rem",
                            }}
                        >
                            Your custom branding is active for{" "}
                            {app.branding_verified_domain || verificationDomain}
                            . Changing branding, policy links, redirect URIs, or
                            the homepage resets verification.
                        </Typography>
                    ) : (
                        <Box>
                            <Typography
                                sx={{
                                    color: "var(--fg-muted)",
                                    fontSize: "0.85rem",
                                    mb: 2,
                                }}
                            >
                                To prevent phishing and brand impersonation,
                                custom branding is only enabled once you verify
                                ownership of your homepage domain.
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--fg)",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    mb: 1,
                                }}
                            >
                                Verification Steps:
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                    mb: 2,
                                }}
                            >
                                <Typography
                                    sx={{
                                        color: "var(--fg-muted)",
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    1. Create this DNS TXT record name:
                                    <code
                                        style={{
                                            display: "block",
                                            background: "rgba(0,0,0,0.15)",
                                            padding: "4px 8px",
                                            borderRadius: "4px",
                                            marginTop: "4px",
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        _elixpo-challenge.{verificationDomain}
                                    </code>
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg-muted)",
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    2. Set its exact TXT value to:
                                </Typography>
                                <Box
                                    sx={{
                                        display: "flex",
                                        gap: 1,
                                        alignItems: "center",
                                    }}
                                >
                                    <code
                                        style={{
                                            flexGrow: 1,
                                            background:
                                                "rgba(255, 119, 89,0.1)",
                                            border: "1px solid rgba(255, 119, 89,0.2)",
                                            color: "#ff7759",
                                            padding: "6px 12px",
                                            borderRadius: "4px",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        elixpo-verification={clientId}
                                    </code>
                                    <IconButton
                                        size="small"
                                        onClick={() =>
                                            copyToClipboard(
                                                `elixpo-verification=${clientId}`,
                                                "challenge",
                                            )
                                        }
                                        sx={{ color: "#ff7759" }}
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-muted)",
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    3. Ensure every redirect URI and branding
                                    link uses this domain or one of its
                                    subdomains, then verify.
                                </Typography>
                            </Box>

                            {verifyMessage && (
                                <Alert
                                    severity={verifyMessage.type}
                                    sx={{ mb: 2 }}
                                >
                                    {verifyMessage.text}
                                </Alert>
                            )}

                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleVerifyDomain}
                                disabled={verifyingDomain}
                                sx={{
                                    color: "#ff7759",
                                    borderColor: "rgba(255, 119, 89,0.5)",
                                    "&:hover": { borderColor: "#ff7759" },
                                    textTransform: "none",
                                }}
                            >
                                {verifyingDomain
                                    ? "Verifying..."
                                    : "Verify Domain Ownership"}
                            </Button>
                        </Box>
                    )}
                </Box>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 4,
                    }}
                >
                    {/* Left: Branding Form Fields */}
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2.5,
                        }}
                    >
                        <Typography
                            sx={{
                                color: "var(--fg)",
                                fontWeight: 600,
                                fontSize: "0.95rem",
                            }}
                        >
                            Branding Configurations
                        </Typography>

                        <TextField
                            fullWidth
                            label="Branding Display Name"
                            placeholder={form.name || "Default Display Name"}
                            value={form.branding_display_name}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    branding_display_name: e.target.value,
                                })
                            }
                            helperText="Overrides the app name shown during the login handshake. Max 50 characters."
                            sx={textFieldSx}
                        />

                        <TextField
                            fullWidth
                            label="Logo URL"
                            placeholder="https://example.com/logo.png"
                            value={form.logo_url}
                            onChange={(e) =>
                                setForm({ ...form, logo_url: e.target.value })
                            }
                            helperText="Must use HTTPS on the verified domain or one of its subdomains."
                            sx={textFieldSx}
                        />

                        <Box sx={{ display: "flex", gap: 2 }}>
                            <Box sx={{ flexGrow: 1 }}>
                                <TextField
                                    fullWidth
                                    label="Primary Theme Color"
                                    placeholder="#ff7759"
                                    value={form.branding_primary_color}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            branding_primary_color:
                                                e.target.value,
                                        })
                                    }
                                    sx={textFieldSx}
                                    helperText={(() => {
                                        const color =
                                            form.branding_primary_color ||
                                            "#ff7759";
                                        const HEX_REGEX =
                                            /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                                        if (!HEX_REGEX.test(color)) {
                                            return (
                                                <span
                                                    style={{ color: "#ef4444" }}
                                                >
                                                    Invalid hex format
                                                </span>
                                            );
                                        }
                                        const ratioWhite =
                                            getContrastRatioLocal(
                                                color,
                                                "#FFFFFF",
                                            );
                                        const ratioBlack =
                                            getContrastRatioLocal(
                                                color,
                                                "#000000",
                                            );
                                        if (
                                            ratioWhite >= 4.5 ||
                                            ratioBlack >= 4.5
                                        ) {
                                            const textCol =
                                                getContrastColorLocal(color) ===
                                                "#FFFFFF"
                                                    ? "white text"
                                                    : "black text";
                                            return (
                                                <span
                                                    style={{ color: "#22c55e" }}
                                                >
                                                    Passes contrast (&gt;=
                                                    4.5:1) with {textCol}
                                                </span>
                                            );
                                        }
                                        return (
                                            <span style={{ color: "#f97316" }}>
                                                Lacks contrast against both
                                                white and black
                                            </span>
                                        );
                                    })()}
                                />
                            </Box>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                }}
                            >
                                <input
                                    type="color"
                                    value={
                                        form.branding_primary_color?.startsWith(
                                            "#",
                                        ) &&
                                        (form.branding_primary_color.length ===
                                            4 ||
                                            form.branding_primary_color
                                                .length === 7)
                                            ? form.branding_primary_color
                                            : "#ff7759"
                                    }
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            branding_primary_color:
                                                e.target.value,
                                        })
                                    }
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: "4px",
                                        width: "48px",
                                        height: "48px",
                                        cursor: "pointer",
                                        background: "transparent",
                                    }}
                                />
                            </Box>
                        </Box>

                        <Box sx={{ display: "flex", gap: 2 }}>
                            <Box sx={{ flexGrow: 1 }}>
                                <TextField
                                    fullWidth
                                    label="Accent Color"
                                    placeholder="#ff8c70"
                                    value={form.branding_accent_color}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            branding_accent_color:
                                                e.target.value,
                                        })
                                    }
                                    sx={textFieldSx}
                                    helperText="Used for links and subtle highlighting."
                                />
                            </Box>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                }}
                            >
                                <input
                                    type="color"
                                    value={
                                        form.branding_accent_color?.startsWith(
                                            "#",
                                        ) &&
                                        (form.branding_accent_color.length ===
                                            4 ||
                                            form.branding_accent_color
                                                .length === 7)
                                            ? form.branding_accent_color
                                            : "#ff8c70"
                                    }
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            branding_accent_color:
                                                e.target.value,
                                        })
                                    }
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: "4px",
                                        width: "48px",
                                        height: "48px",
                                        cursor: "pointer",
                                        background: "transparent",
                                    }}
                                />
                            </Box>
                        </Box>

                        <TextField
                            fullWidth
                            label="Privacy Policy URL"
                            placeholder="https://example.com/privacy"
                            value={form.privacy_policy_url}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    privacy_policy_url: e.target.value,
                                })
                            }
                            sx={textFieldSx}
                        />

                        <TextField
                            fullWidth
                            label="Terms of Service URL"
                            placeholder="https://example.com/terms"
                            value={form.terms_of_service_url}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    terms_of_service_url: e.target.value,
                                })
                            }
                            sx={textFieldSx}
                        />
                    </Box>

                    {/* Right: Live Preview Mockup */}
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <Typography
                                sx={{
                                    color: "var(--fg)",
                                    fontWeight: 600,
                                    fontSize: "0.95rem",
                                }}
                            >
                                Live Preview Handshake
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    border: "1px solid var(--border)",
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                }}
                            >
                                <Button
                                    size="small"
                                    onClick={() => setPreviewMode("desktop")}
                                    sx={{
                                        bgcolor:
                                            previewMode === "desktop"
                                                ? "rgba(255, 119, 89, 0.15)"
                                                : "transparent",
                                        color:
                                            previewMode === "desktop"
                                                ? "#ff7759"
                                                : "var(--fg-faint)",
                                        borderRight: "1px solid var(--border)",
                                        borderRadius: 0,
                                        textTransform: "none",
                                        fontSize: "0.75rem",
                                        px: 1.5,
                                        py: 0.5,
                                    }}
                                >
                                    Desktop
                                </Button>
                                <Button
                                    size="small"
                                    onClick={() => setPreviewMode("mobile")}
                                    sx={{
                                        bgcolor:
                                            previewMode === "mobile"
                                                ? "rgba(255, 119, 89, 0.15)"
                                                : "transparent",
                                        color:
                                            previewMode === "mobile"
                                                ? "#ff7759"
                                                : "var(--fg-faint)",
                                        borderRadius: 0,
                                        textTransform: "none",
                                        fontSize: "0.75rem",
                                        px: 1.5,
                                        py: 0.5,
                                    }}
                                >
                                    Mobile
                                </Button>
                            </Box>
                        </Box>

                        {/* Preview Frame */}
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                bgcolor: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                minHeight: "560px",
                                p: previewMode === "desktop" ? 3 : 1,
                            }}
                        >
                            {/* Device representation */}
                            <Box
                                sx={
                                    previewMode === "desktop"
                                        ? {
                                              width: "100%",
                                              borderRadius: "6px",
                                              border: "1px solid var(--border)",
                                              bgcolor: "var(--bg)",
                                              boxShadow:
                                                  "0 10px 30px rgba(0,0,0,0.5)",
                                              overflow: "hidden",
                                              display: "flex",
                                              flexDirection: "column",
                                          }
                                        : {
                                              width: "260px",
                                              height: "580px",
                                              borderRadius: "28px",
                                              border: "10px solid #222",
                                              bgcolor: "var(--bg)",
                                              boxShadow:
                                                  "0 10px 30px rgba(0,0,0,0.5)",
                                              overflow: "hidden",
                                              display: "flex",
                                              flexDirection: "column",
                                              position: "relative",
                                          }
                                }
                            >
                                {/* Header / Top Bar */}
                                <Box
                                    sx={{
                                        bgcolor: "var(--surface)",
                                        px: 2,
                                        py: 1.5,
                                        borderBottom: "1px solid var(--border)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            bgcolor: "#ef4444",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            bgcolor: "#fbbf24",
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            bgcolor: "#22c55e",
                                        }}
                                    />
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.7rem",
                                            ml: "auto",
                                        }}
                                    >
                                        accounts.elixpo.com
                                    </Typography>
                                </Box>

                                {/* Page content */}
                                <Box
                                    sx={{
                                        flexGrow: 1,
                                        p: previewMode === "desktop" ? 4 : 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "var(--fg)",
                                        bgcolor: "var(--bg)",
                                        backgroundImage: `radial-gradient(circle at 12% 15%, color-mix(in srgb, ${form.branding_primary_color || "#ff7759"} 16%, transparent), transparent 38%), radial-gradient(circle at 88% 86%, color-mix(in srgb, ${form.branding_accent_color || form.branding_primary_color || "#ff9b85"} 14%, transparent), transparent 42%)`,
                                    }}
                                >
                                    {/* Application Logo & Connection Visual */}
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                            mb: 2,
                                        }}
                                    >
                                        {form.logo_url ? (
                                            <img
                                                src={form.logo_url}
                                                alt="App logo"
                                                style={{
                                                    width: "42px",
                                                    height: "42px",
                                                    borderRadius: "10px",
                                                    objectFit: "cover",
                                                    border: "1px solid var(--border)",
                                                }}
                                                onError={(e) => {
                                                    (
                                                        e.target as HTMLElement
                                                    ).style.display = "none";
                                                }}
                                            />
                                        ) : (
                                            <Box
                                                sx={{
                                                    width: "42px",
                                                    height: "42px",
                                                    borderRadius: "10px",
                                                    bgcolor:
                                                        form.branding_primary_color ||
                                                        "#ff7759",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyItems: "center",
                                                    justifyContent: "center",
                                                    fontWeight: "bold",
                                                    border: "1px solid var(--border)",
                                                }}
                                            >
                                                {(
                                                    form.branding_display_name ||
                                                    form.name ||
                                                    "App"
                                                )
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </Box>
                                        )}
                                        <Typography
                                            sx={{
                                                fontSize: "1.2rem",
                                                fontWeight: "bold",
                                                color: "var(--fg-faint)",
                                            }}
                                        >
                                            ↔
                                        </Typography>
                                        <Box
                                            component="img"
                                            src="/LOGO/logo.png"
                                            alt="Elixpo Accounts"
                                            sx={{
                                                width: "42px",
                                                height: "42px",
                                                borderRadius: "10px",
                                                border: "1px solid var(--border)",
                                            }}
                                        />
                                    </Box>

                                    <Typography
                                        sx={{
                                            fontSize:
                                                previewMode === "desktop"
                                                    ? "1.2rem"
                                                    : "0.95rem",
                                            fontWeight: "bold",
                                            textAlign: "center",
                                            mb: 0.5,
                                        }}
                                    >
                                        Continue to{" "}
                                        {form.branding_display_name ||
                                            form.name ||
                                            "Application"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "0.75rem",
                                            color: "var(--fg-faint)",
                                            textAlign: "center",
                                            mb: 2,
                                        }}
                                    >
                                        via global secured Elixpo Accounts
                                        Network
                                    </Typography>

                                    {/* Dummy Scopes Card */}
                                    <Box
                                        sx={{
                                            width: "100%",
                                            bgcolor: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "12px",
                                            p: 1.5,
                                            mb: 3,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                fontSize: "0.7rem",
                                                color: "var(--fg-faint)",
                                                fontWeight: "bold",
                                                mb: 1,
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Requested permissions:
                                        </Typography>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.75,
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 6,
                                                        height: 6,
                                                        borderRadius: "50%",
                                                        bgcolor:
                                                            form.branding_primary_color ||
                                                            "#ff7759",
                                                    }}
                                                />
                                                <Typography
                                                    sx={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--fg)",
                                                    }}
                                                >
                                                    Access your openid profile
                                                </Typography>
                                            </Box>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 6,
                                                        height: 6,
                                                        borderRadius: "50%",
                                                        bgcolor:
                                                            form.branding_primary_color ||
                                                            "#ff7759",
                                                    }}
                                                />
                                                <Typography
                                                    sx={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--fg)",
                                                    }}
                                                >
                                                    Read email address
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>

                                    <Box
                                        sx={{
                                            width: "100%",
                                            bgcolor: "var(--overlay)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "12px",
                                            p: 1.25,
                                            mb: 1.5,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 1.5,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: "var(--fg-faint)",
                                                fontSize: "0.7rem",
                                            }}
                                        >
                                            <strong>Security</strong>
                                            <br />
                                            Renewable access. Revoke anytime.
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color:
                                                    form.branding_accent_color ||
                                                    form.branding_primary_color ||
                                                    "#ff7759",
                                                fontFamily: "monospace",
                                                fontWeight: 700,
                                            }}
                                        >
                                            9:53
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={{
                                            width: "100%",
                                            display: "flex",
                                            gap: 1,
                                            mb: 1.5,
                                        }}
                                    >
                                        <Button
                                            fullWidth
                                            size="small"
                                            sx={{
                                                color: "var(--fg-faint)",
                                                border: "1px solid var(--border)",
                                                textTransform: "none",
                                            }}
                                        >
                                            Deny
                                        </Button>
                                        <Button
                                            fullWidth
                                            variant="contained"
                                            size="small"
                                            sx={{
                                                bgcolor:
                                                    form.branding_primary_color ||
                                                    "#ff7759",
                                                color: getContrastColorLocal(
                                                    form.branding_primary_color ||
                                                        "#ff7759",
                                                ),
                                                textTransform: "none",
                                                fontWeight: 600,
                                                "&:hover": {
                                                    bgcolor:
                                                        form.branding_accent_color ||
                                                        form.branding_primary_color ||
                                                        "#ff7759",
                                                },
                                            }}
                                        >
                                            Authorize
                                        </Button>
                                    </Box>

                                    {/* Trust marker footer */}
                                    <Typography
                                        sx={{
                                            fontSize: "0.7rem",
                                            color: "var(--fg-faint)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            mt: "auto",
                                        }}
                                    >
                                        🛡️ Secured by Elixpo Accounts
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* Activity panel — sign-ins, sessions, request count, and a */}
            {stats && (
                <Box
                    id="activity"
                    sx={{
                        ...cardSx,
                        order: 6,
                        gridColumn: { xs: "1", lg: "2 / -1" },
                        scrollMarginTop: "150px",
                    }}
                >
                    {stats.branding_verification_required && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Sign-ins are paused because this app has more than
                            20 sign-ins. Verify its branding domain above to
                            resume authorization.
                        </Alert>
                    )}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1.5,
                            flexWrap: "wrap",
                            mb: 0.5,
                        }}
                    >
                        <Typography
                            sx={{ color: "var(--fg)", fontWeight: 600 }}
                        >
                            Activity
                        </Typography>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <Box
                                component="select"
                                aria-label="Activity range"
                                value={activityDays}
                                onChange={(event) =>
                                    setActivityDays(Number(event.target.value))
                                }
                                sx={{
                                    bgcolor: "var(--surface)",
                                    color: "var(--fg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "8px",
                                    px: 1.25,
                                    py: 0.75,
                                    fontSize: "0.8rem",
                                }}
                            >
                                {[7, 30, 60, 90].map((days) => (
                                    <option key={days} value={days}>
                                        Last {days} days
                                    </option>
                                ))}
                            </Box>
                            <Button
                                component="a"
                                href={
                                    stats.can_export_lifetime
                                        ? `/api/auth/oauth-clients/${clientId}/stats?export=csv`
                                        : "/pricing"
                                }
                                download={
                                    stats.can_export_lifetime
                                        ? `${clientId}-activity.csv`
                                        : undefined
                                }
                                size="small"
                                startIcon={<DownloadIcon />}
                                sx={{
                                    color: "#ff7759",
                                    textTransform: "none",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {stats.can_export_lifetime
                                    ? "Lifetime CSV"
                                    : "Upgrade for CSV"}
                            </Button>
                        </Box>
                    </Box>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.85rem",
                            mb: 2.5,
                        }}
                    >
                        How your app is being used by signed-in users.
                    </Typography>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr 1fr",
                                sm: "repeat(4, 1fr)",
                            },
                            gap: 2,
                            mb: 3,
                        }}
                    >
                        <StatTile
                            label="Total sign-ins"
                            value={stats.total_sign_ins.toLocaleString()}
                        />
                        <StatTile
                            label="Unique users"
                            value={stats.unique_users.toLocaleString()}
                        />
                        <StatTile
                            label="Active sessions"
                            value={stats.active_sessions.toLocaleString()}
                        />
                        <StatTile
                            label="API requests"
                            value={stats.request_count.toLocaleString()}
                        />
                    </Box>

                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            mb: 1.5,
                        }}
                    >
                        Sign-ins · last {activityDays} days
                    </Typography>
                    {stats.sign_in_timeline.length === 0 ? (
                        <Typography
                            sx={{
                                color: "var(--fg-faint)",
                                fontStyle: "italic",
                                fontSize: "0.9rem",
                                py: 3,
                                textAlign: "center",
                            }}
                        >
                            No sign-ins yet.
                        </Typography>
                    ) : (
                        <SignInBars
                            points={stats.sign_in_timeline}
                            height={120}
                        />
                    )}

                    <Box
                        sx={{
                            mt: 2.5,
                            pt: 2,
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            gap: 2,
                            flexWrap: "wrap",
                            color: "var(--fg-faint)",
                            fontSize: "0.8rem",
                        }}
                    >
                        <span>
                            Last used:{" "}
                            <strong style={{ color: "var(--fg)" }}>
                                {stats.last_used
                                    ? new Date(stats.last_used).toLocaleString()
                                    : "Never"}
                            </strong>
                        </span>
                        <span>•</span>
                        <span>
                            Webhooks:{" "}
                            <strong style={{ color: "var(--fg)" }}>
                                {stats.webhooks.total_endpoints === 0
                                    ? "none configured"
                                    : `${stats.webhooks.active_endpoints}/${stats.webhooks.total_endpoints} active${
                                          stats.webhooks.last_delivery_at
                                              ? `, last delivery ${new Date(stats.webhooks.last_delivery_at).toLocaleString()}`
                                              : ", never delivered"
                                      }`}
                            </strong>
                        </span>
                    </Box>
                </Box>
            )}

            {/* Webhooks panel — multi-endpoint event subscription */}
            <Box
                id="webhooks"
                sx={{
                    ...cardSx,
                    order: 3,
                    gridColumn: { xs: "1", lg: "2 / -1" },
                    scrollMarginTop: "150px",
                }}
            >
                <Typography
                    sx={{ color: "var(--fg)", fontWeight: 600, mb: 0.5 }}
                >
                    Webhook endpoints
                </Typography>
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.85rem",
                        mb: 2.5,
                    }}
                >
                    Register one or more URLs that receive signed event
                    deliveries. Each endpoint has its own secret. Useful for
                    separating localhost/staging/production receivers, each
                    listening to a different subset of events. See the{" "}
                    <a
                        href="/docs/webhooks"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: "#ff7759",
                            textDecoration: "underline",
                            textDecorationColor: "rgba(255, 119, 89,0.4)",
                        }}
                    >
                        integration guide
                    </a>{" "}
                    for the signature contract.
                </Typography>

                {/* Result message */}
                {webhookMessage && (
                    <Typography
                        sx={{
                            mb: 2,
                            color:
                                webhookMessage.type === "error"
                                    ? "#b91c1c"
                                    : "#15803d",
                            fontSize: "0.85rem",
                        }}
                    >
                        {webhookMessage.text}
                    </Typography>
                )}

                {/* Existing endpoints list */}
                {endpointsLoading ? (
                    <Box
                        sx={{
                            py: 3,
                            textAlign: "center",
                            color: "var(--fg-faint)",
                        }}
                    >
                        <CircularProgress size={20} sx={{ color: "#ff7759" }} />
                    </Box>
                ) : endpoints.length === 0 ? (
                    <Box
                        sx={{
                            py: 3,
                            px: 2,
                            mb: 2.5,
                            textAlign: "center",
                            borderRadius: "10px",
                            background: "var(--surface)",
                            border: "1px dashed var(--border)",
                            color: "var(--fg-faint)",
                            fontSize: "0.88rem",
                        }}
                    >
                        No endpoints yet — add one below.
                    </Box>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                            mb: 3,
                        }}
                    >
                        {endpoints.map((ep) => (
                            <EndpointRow
                                key={ep.id}
                                ep={ep}
                                revealedSecret={revealedSecrets[ep.id]}
                                onDismissSecret={() =>
                                    setRevealedSecrets((s) => {
                                        const copy = { ...s };
                                        delete copy[ep.id];
                                        return copy;
                                    })
                                }
                                onCopySecret={() =>
                                    copyToClipboard(
                                        revealedSecrets[ep.id] || "",
                                        `endpoint-${ep.id}`,
                                    )
                                }
                                copiedField={copiedField}
                                busy={endpointBusy === ep.id}
                                onToggle={() =>
                                    handleToggleEndpoint(ep, !ep.is_active)
                                }
                                onDelete={() => handleDeleteEndpoint(ep)}
                                onRotate={() => handleRotateEndpoint(ep)}
                            />
                        ))}
                    </Box>
                )}

                {/* Add-endpoint inline form */}
                <Box
                    sx={{
                        p: 2.5,
                        borderRadius: "12px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--fg)",
                            fontWeight: 600,
                            fontSize: "0.92rem",
                            mb: 1.5,
                        }}
                    >
                        Add new endpoint
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "2fr 1fr",
                            },
                            gap: 1.5,
                            mb: 1.5,
                        }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="https://yourapp.com/api/webhooks/elixpo"
                            value={newEndpoint.url}
                            onChange={(e) =>
                                setNewEndpoint((p) => ({
                                    ...p,
                                    url: e.target.value,
                                }))
                            }
                            InputProps={{
                                sx: {
                                    color: "var(--fg)",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    fontSize: "0.82rem",
                                },
                            }}
                            sx={textFieldSx}
                        />
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Label (e.g. production)"
                            value={newEndpoint.label}
                            onChange={(e) =>
                                setNewEndpoint((p) => ({
                                    ...p,
                                    label: e.target.value,
                                }))
                            }
                            InputProps={{
                                sx: {
                                    color: "var(--fg)",
                                    fontSize: "0.85rem",
                                },
                            }}
                            sx={textFieldSx}
                        />
                    </Box>
                    <Box
                        sx={{
                            display: "flex",
                            gap: 0.75,
                            flexWrap: "wrap",
                            mb: 1.5,
                        }}
                    >
                        {WEBHOOK_EVENTS.map((ev) => {
                            const checked = newEndpoint.events.includes(ev);
                            return (
                                <Chip
                                    key={ev}
                                    label={ev}
                                    size="small"
                                    onClick={() =>
                                        setNewEndpoint((p) => ({
                                            ...p,
                                            events: checked
                                                ? p.events.filter(
                                                      (e) => e !== ev,
                                                  )
                                                : [...p.events, ev],
                                        }))
                                    }
                                    sx={{
                                        cursor: "pointer",
                                        fontFamily:
                                            "var(--font-geist-mono), monospace",
                                        fontSize: "0.72rem",
                                        bgcolor: checked
                                            ? "rgba(255, 119, 89,0.15)"
                                            : "var(--overlay)",
                                        color: checked
                                            ? "#ff7759"
                                            : "var(--fg-faint)",
                                        border: `1px solid ${
                                            checked
                                                ? "rgba(255, 119, 89,0.4)"
                                                : "var(--border)"
                                        }`,
                                    }}
                                />
                            );
                        })}
                    </Box>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleCreateEndpoint}
                        disabled={creatingEndpoint}
                        sx={{
                            textTransform: "none",
                            background:
                                "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                            "&:hover": {
                                background:
                                    "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                            },
                        }}
                    >
                        {creatingEndpoint ? "Adding…" : "Add endpoint"}
                    </Button>
                </Box>
            </Box>

            {/* Danger Zone */}
            <Box
                id="danger"
                sx={{
                    ...cardSx,
                    order: 7,
                    gridColumn: { xs: "1", lg: "2 / -1" },
                    border: "1px solid rgba(239,68,68,0.3)",
                }}
            >
                <Typography sx={{ color: "#b91c1c", fontWeight: 600, mb: 1 }}>
                    Danger Zone
                </Typography>
                <Divider sx={{ borderColor: "rgba(239,68,68,0.15)", mb: 2 }} />
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Box>
                        <Typography
                            sx={{ color: "var(--fg)", fontWeight: 500 }}
                        >
                            Delete application
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ color: "var(--fg-faint)" }}
                        >
                            Permanently delete this app and revoke all issued
                            tokens
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        startIcon={<DeleteIcon />}
                        onClick={handleDelete}
                        sx={{
                            borderColor: "rgba(239,68,68,0.4)",
                            color: "#b91c1c",
                            textTransform: "none",
                            "&:hover": {
                                bgcolor: "rgba(239,68,68,0.1)",
                                borderColor: "#ef4444",
                            },
                        }}
                    >
                        Delete
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <Box
            sx={{
                p: 2,
                borderRadius: "12px",
                bgcolor: "var(--surface)",
                border: "1px solid var(--border)",
            }}
        >
            <Typography
                sx={{
                    color: "var(--fg-faint)",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    mb: 0.5,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg)",
                    fontWeight: 700,
                    fontSize: "1.5rem",
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}

function EndpointRow({
    ep,
    revealedSecret,
    onDismissSecret,
    onCopySecret,
    copiedField,
    busy,
    onToggle,
    onDelete,
    onRotate,
}: {
    ep: {
        id: string;
        url: string;
        events: string[];
        is_active: boolean;
        label: string | null;
        secret_set_at: string;
        last_delivery_at: string | null;
        last_status_code: number | null;
        last_error: string | null;
    };
    revealedSecret: string | undefined;
    onDismissSecret: () => void;
    onCopySecret: () => void;
    copiedField: string | null;
    busy: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onRotate: () => void;
}) {
    const statusOk =
        ep.last_status_code !== null &&
        ep.last_status_code >= 200 &&
        ep.last_status_code < 300;
    return (
        <Box
            sx={{
                p: 2,
                borderRadius: "12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                opacity: ep.is_active ? 1 : 0.55,
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    mb: 1,
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mb: 0.5,
                            flexWrap: "wrap",
                        }}
                    >
                        {ep.label && (
                            <Chip
                                label={ep.label}
                                size="small"
                                sx={{
                                    height: 20,
                                    fontSize: "0.7rem",
                                    bgcolor: "rgba(255, 119, 89,0.12)",
                                    color: "#ff7759",
                                    border: "1px solid rgba(255, 119, 89,0.3)",
                                }}
                            />
                        )}
                        <Chip
                            label={ep.is_active ? "Active" : "Paused"}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: "0.7rem",
                                bgcolor: ep.is_active
                                    ? "rgba(134,239,172,0.08)"
                                    : "var(--overlay)",
                                color: ep.is_active
                                    ? "#15803d"
                                    : "var(--fg-faint)",
                                border: `1px solid ${
                                    ep.is_active
                                        ? "rgba(134,239,172,0.2)"
                                        : "var(--border)"
                                }`,
                            }}
                        />
                        {ep.last_status_code !== null && (
                            <Chip
                                label={`HTTP ${ep.last_status_code}`}
                                size="small"
                                sx={{
                                    height: 20,
                                    fontSize: "0.7rem",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    bgcolor: statusOk
                                        ? "rgba(134,239,172,0.08)"
                                        : "rgba(239,68,68,0.1)",
                                    color: statusOk ? "#15803d" : "#b91c1c",
                                    border: `1px solid ${
                                        statusOk
                                            ? "rgba(134,239,172,0.2)"
                                            : "rgba(239,68,68,0.25)"
                                    }`,
                                }}
                            />
                        )}
                    </Box>
                    <Box
                        component="code"
                        sx={{
                            display: "block",
                            color: "var(--fg)",
                            fontFamily: "var(--font-geist-mono), monospace",
                            fontSize: "0.82rem",
                            wordBreak: "break-all",
                            mb: 0.5,
                        }}
                    >
                        {ep.url}
                    </Box>
                    <Box
                        sx={{
                            display: "flex",
                            gap: 0.5,
                            flexWrap: "wrap",
                        }}
                    >
                        {ep.events.map((e) => (
                            <Box
                                key={e}
                                component="span"
                                sx={{
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    fontSize: "0.7rem",
                                    color: "var(--fg-faint)",
                                    bgcolor: "var(--overlay)",
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: "4px",
                                }}
                            >
                                {e}
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                    <Tooltip
                        title={ep.is_active ? "Pause deliveries" : "Resume"}
                    >
                        <span>
                            <IconButton
                                size="small"
                                onClick={onToggle}
                                disabled={busy}
                                sx={{ color: "var(--fg-faint)" }}
                            >
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Rotate secret">
                        <span>
                            <IconButton
                                size="small"
                                onClick={onRotate}
                                disabled={busy}
                                sx={{ color: "var(--fg-faint)" }}
                            >
                                <RefreshIcon
                                    fontSize="small"
                                    sx={{ transform: "rotate(45deg)" }}
                                />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Delete endpoint">
                        <span>
                            <IconButton
                                size="small"
                                onClick={onDelete}
                                disabled={busy}
                                sx={{ color: "#b91c1c" }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    flexWrap: "wrap",
                    pt: 1,
                    mt: 1,
                    borderTop: "1px solid var(--border)",
                    fontSize: "0.74rem",
                    color: "var(--fg-faint)",
                }}
            >
                <span>
                    Secret set:{" "}
                    {new Date(ep.secret_set_at).toLocaleDateString()}
                </span>
                <span>
                    Last delivery:{" "}
                    {ep.last_delivery_at
                        ? new Date(ep.last_delivery_at).toLocaleString()
                        : "never"}
                </span>
                {ep.last_error && (
                    <span style={{ color: "#b91c1c" }}>
                        Last error: {ep.last_error}
                    </span>
                )}
            </Box>

            {revealedSecret && (
                <Box
                    sx={{
                        mt: 2,
                        p: 2,
                        borderRadius: "10px",
                        background:
                            "linear-gradient(135deg, rgba(255, 119, 89,0.12) 0%, rgba(255, 119, 89,0.05) 100%)",
                        border: "1px solid rgba(255, 119, 89,0.35)",
                    }}
                >
                    <Typography
                        sx={{
                            color: "#b45309",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            mb: 1,
                        }}
                    >
                        Copy this secret now — it won&apos;t be shown again
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            background: "var(--overlay)",
                            borderRadius: "8px",
                            p: 1.25,
                        }}
                    >
                        <Box
                            component="code"
                            sx={{
                                color: "var(--fg)",
                                fontFamily: "var(--font-geist-mono), monospace",
                                fontSize: "0.82rem",
                                wordBreak: "break-all",
                                flex: 1,
                            }}
                        >
                            {revealedSecret}
                        </Box>
                        <Button
                            size="small"
                            onClick={onCopySecret}
                            sx={{
                                textTransform: "none",
                                color: "#ff7759",
                                minWidth: 0,
                            }}
                        >
                            {copiedField === `endpoint-${ep.id}`
                                ? "Copied"
                                : "Copy"}
                        </Button>
                    </Box>
                    <Button
                        size="small"
                        onClick={onDismissSecret}
                        sx={{
                            mt: 1,
                            textTransform: "none",
                            color: "var(--fg-faint)",
                        }}
                    >
                        I&apos;ve saved it
                    </Button>
                </Box>
            )}
        </Box>
    );
}

function SignInBars({
    points,
    height = 120,
}: {
    points: Array<{ date: string; count: number }>;
    height?: number;
}) {
    const max = Math.max(1, ...points.map((p) => p.count));
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "flex-end",
                gap: "4px",
                height,
            }}
        >
            {points.map((p) => (
                <Box
                    key={p.date}
                    title={`${p.date}: ${p.count}`}
                    sx={{
                        flex: "1 1 0",
                        maxWidth: 36,
                        height: `${Math.max((p.count / max) * 100, 4)}%`,
                        borderRadius: "3px 3px 0 0",
                        background:
                            "linear-gradient(180deg, rgba(255, 119, 89,0.95) 0%, rgba(255, 119, 89,0.55) 100%)",
                        transition: "filter 0.15s ease",
                        "&:hover": { filter: "brightness(1.25)" },
                    }}
                />
            ))}
        </Box>
    );
}
