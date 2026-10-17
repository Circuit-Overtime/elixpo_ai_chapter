"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import KeyIcon from "@mui/icons-material/Key";
import LaptopIcon from "@mui/icons-material/Laptop";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SecurityIcon from "@mui/icons-material/Security";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    TextField,
    Typography,
} from "@mui/material";
import {
    browserSupportsWebAuthn,
    startRegistration,
} from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { useCooldown } from "@/lib/hooks/useCooldown";

const EMAIL_OTP_RESEND_COOLDOWN_S = 60;

interface Factor {
    id: string;
    kind: "passkey" | "totp" | "email_otp";
    name: string | null;
    created_at: string;
    confirmed: boolean;
    last_used_at: string | null;
}
interface TrustedDevice {
    id: string;
    name: string | null;
    ua_short: string | null;
    last_seen_at: string;
    created_at: string;
    is_active: boolean;
}
interface Session {
    id: string;
    device: string;
    ip_hash: string | null;
    created_at: string;
    last_used_at: string;
    expires_at: string;
    is_current: boolean;
}
interface MeStatus {
    mfa_enabled: boolean;
    unused_backup_codes: number;
    owned_apps_count: number;
    mfa_required: boolean;
    factors: Factor[];
}

const cardSx = {
    p: 3,
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
};

const kindLabel: Record<Factor["kind"], string> = {
    passkey: "Passkey",
    totp: "Authenticator app",
    email_otp: "Email code",
};
const kindIcon: Record<Factor["kind"], React.ReactNode> = {
    passkey: <KeyIcon fontSize="small" sx={{ color: "#ff7759" }} />,
    totp: <PhoneAndroidIcon fontSize="small" sx={{ color: "#ff7759" }} />,
    email_otp: <MailOutlineIcon fontSize="small" sx={{ color: "#ff7759" }} />,
};

export default function SecurityPage() {
    const [status, setStatus] = useState<MeStatus | null>(null);
    const [devices, setDevices] = useState<TrustedDevice[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{
        text: string;
        type: "success" | "error" | "warning";
    } | null>(null);

    // TOTP enrollment state.
    const [totpDialog, setTotpDialog] = useState(false);
    const [totpData, setTotpData] = useState<{
        factor_id: string;
        secret: string;
        otpauth_uri: string;
        qr_dataurl: string;
    } | null>(null);
    const [totpCode, setTotpCode] = useState("");
    const [totpBusy, setTotpBusy] = useState(false);

    // Freshly minted backup codes (revealed once).
    const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null);

    // Shared confirm-dialog. One state object drives any
    // "are-you-sure?" prompt on this page — every action that used to
    // call native confirm() (disable 2FA, revoke device, revoke
    // session, regenerate backup codes, remove factor) now goes through
    // askConfirm() so we get consistent styling, a busy state, and a
    // single place to evolve the visual.
    interface ConfirmCfg {
        title: string;
        icon?: React.ReactNode;
        body: React.ReactNode;
        confirmLabel: string;
        destructive?: boolean;
        onConfirm: () => Promise<void> | void;
    }
    const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const askConfirm = (cfg: ConfirmCfg) => setConfirmCfg(cfg);
    const runConfirm = async () => {
        if (!confirmCfg) return;
        setConfirmBusy(true);
        try {
            await confirmCfg.onConfirm();
        } finally {
            setConfirmBusy(false);
            setConfirmCfg(null);
        }
    };

    // Email-OTP enrollment dialog. Verify-before-enable ceremony: enroll
    // sends a 6-digit code to the user's email; they type it here and
    // we only flip confirmed_at once it matches.
    const [emailEnrollDialog, setEmailEnrollDialog] = useState(false);
    const [emailEnrollData, setEmailEnrollData] = useState<{
        factor_id: string;
        sent_to: string;
    } | null>(null);
    const [emailEnrollCode, setEmailEnrollCode] = useState("");
    const [emailEnrollBusy, setEmailEnrollBusy] = useState(false);
    // Shared cooldown between the in-dialog "Resend code" and the
    // pending-factor-row "Resend & enter code" — both call
    // startEmailEnroll which hits the same rate-limited KV cooldown
    // server-side. Without this the user could double-click and get a
    // confusing 429.
    const emailResendCd = useCooldown();

    const refresh = useCallback(async () => {
        try {
            const [factorsRes, devicesRes, sessionsRes] = await Promise.all([
                fetch("/api/auth/mfa/factors", { credentials: "include" }),
                fetch("/api/auth/devices", { credentials: "include" }),
                fetch("/api/auth/sessions", { credentials: "include" }),
            ]);
            if (factorsRes.ok) {
                const data: any = await factorsRes.json();
                setStatus(data);
            }
            if (devicesRes.ok) {
                const data: any = await devicesRes.json();
                setDevices(data.devices || []);
            }
            if (sessionsRes.ok) {
                const data: any = await sessionsRes.json();
                setSessions(data.sessions || []);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const autoEnable = useCallback(async () => {
        const res = await fetch("/api/auth/mfa/enable", {
            method: "POST",
            credentials: "include",
        });
        if (!res.ok) return;
        const data: any = await res.json();
        if (data.backup_codes && !data.already_enabled) {
            setRevealedCodes(data.backup_codes);
            setMsg({
                text: "2FA enabled — save these backup codes now, they won't be shown again.",
                type: "success",
            });
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const startTotp = async () => {
        setMsg(null);
        const res = await fetch("/api/auth/mfa/totp/enroll", {
            method: "POST",
            credentials: "include",
        });
        if (!res.ok) {
            const e: any = await res.json();
            setMsg({
                text: e.error || "Failed to start enrollment",
                type: "error",
            });
            return;
        }
        const data: any = await res.json();
        const qr = await QRCode.toDataURL(data.otpauth_uri, {
            margin: 1,
            width: 240,
            // QR renders to a static canvas/data-URL — CSS vars don't resolve
            // here and the qrcode lib's color parser is hex-only. Keep a fixed
            // dark-on-white plate so it scans regardless of the UI theme.
            color: { dark: "#161c18", light: "#ffffff" },
        });
        setTotpData({ ...data, qr_dataurl: qr });
        setTotpCode("");
        setTotpDialog(true);
    };

    const confirmTotp = async () => {
        if (!totpData) return;
        setTotpBusy(true);
        try {
            const res = await fetch("/api/auth/mfa/totp/confirm", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    factor_id: totpData.factor_id,
                    code: totpCode,
                }),
            });
            if (!res.ok) {
                const e: any = await res.json();
                setMsg({ text: e.error || "Invalid code", type: "error" });
                return;
            }
            setTotpDialog(false);
            setTotpData(null);
            setMsg({ text: "Authenticator app enrolled", type: "success" });
            // First confirmed factor → idempotently flip mfa_enabled
            // and surface backup codes. Re-confirms are silent no-ops.
            await autoEnable();
            await refresh();
        } finally {
            setTotpBusy(false);
        }
    };

    const enrollPasskey = async () => {
        if (!browserSupportsWebAuthn()) {
            setMsg({
                text: "This browser doesn't support passkeys.",
                type: "error",
            });
            return;
        }
        setMsg(null);
        try {
            const optsRes = await fetch(
                "/api/auth/mfa/passkey/register/options",
                { method: "POST", credentials: "include" },
            );
            if (!optsRes.ok) throw new Error("Failed to get options");
            const opts: any = await optsRes.json();
            const attResp = await startRegistration({ optionsJSON: opts });
            const verifyRes = await fetch(
                "/api/auth/mfa/passkey/register/verify",
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ response: attResp }),
                },
            );
            if (!verifyRes.ok) {
                const e: any = await verifyRes.json();
                setMsg({
                    text: e.error || "Passkey verification failed",
                    type: "error",
                });
                return;
            }
            setMsg({ text: "Passkey enrolled", type: "success" });
            await autoEnable();
            await refresh();
        } catch (err: any) {
            setMsg({
                text: err?.message || "Passkey enrollment cancelled",
                type: "error",
            });
        }
    };

    const startEmailEnroll = async () => {
        setMsg(null);
        setEmailEnrollBusy(true);
        try {
            const res = await fetch("/api/auth/mfa/email-otp/enroll", {
                method: "POST",
                credentials: "include",
            });
            // Read the body once as text, then try JSON. Lets us surface
            // a non-JSON 5xx (CF custom error page, function crash, etc.)
            // verbatim instead of swallowing it with a generic toast.
            const rawText = await res.text().catch(() => "");
            let data: any = {};
            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch {
                /* not JSON — keep rawText for the toast */
            }
            if (!res.ok) {
                const detail =
                    data.error ||
                    (rawText
                        ? `HTTP ${res.status}: ${rawText.slice(0, 240)}`
                        : `HTTP ${res.status} with empty body — check CF Pages logs.`);
                console.error(
                    "[email-otp enroll] failed — status=%s body=%s",
                    String(res.status),
                    rawText.slice(0, 500),
                );
                setMsg({
                    text: `Couldn't start enrollment. ${detail}`,
                    type: "error",
                });
                return;
            }
            // Already-confirmed short-circuit from the API.
            if (data.already_confirmed) {
                setMsg({
                    text: "Email code is already enabled.",
                    type: "success",
                });
                await refresh();
                return;
            }
            setEmailEnrollData({
                factor_id: data.factor_id,
                sent_to: data.sent_to,
            });
            setEmailEnrollCode("");
            setEmailEnrollDialog(true);
            emailResendCd.start(EMAIL_OTP_RESEND_COOLDOWN_S);
        } finally {
            setEmailEnrollBusy(false);
        }
    };

    const confirmEmailEnroll = async () => {
        if (!emailEnrollData) return;
        setEmailEnrollBusy(true);
        try {
            const res = await fetch("/api/auth/mfa/email-otp/confirm", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    factor_id: emailEnrollData.factor_id,
                    code: emailEnrollCode,
                }),
            });
            const data: any = await res.json();
            if (!res.ok) {
                setMsg({ text: data.error || "Invalid code", type: "error" });
                return;
            }
            setEmailEnrollDialog(false);
            setEmailEnrollData(null);
            setMsg({
                text: "Email code enabled as a 2FA method",
                type: "success",
            });
            await autoEnable();
            await refresh();
        } finally {
            setEmailEnrollBusy(false);
        }
    };

    const resendEmailEnroll = async () => {
        // Same call as start — server side dedupes and reuses the
        // pending factor id, so we don't accidentally orphan rows.
        await startEmailEnroll();
    };

    const removeFactor = (target: Factor) =>
        askConfirm({
            title: "Remove this 2FA method?",
            icon: <DeleteIcon sx={{ color: "#b91c1c" }} />,
            body: (
                <>
                    <Typography sx={{ color: "var(--fg-muted)", mb: 2 }}>
                        You're about to remove{" "}
                        <strong style={{ color: "var(--fg)" }}>
                            {target.name || kindLabel[target.kind]}
                        </strong>{" "}
                        from your 2FA methods.
                    </Typography>
                    <Box
                        sx={{
                            p: 1.5,
                            borderRadius: "8px",
                            bgcolor: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: "#b91c1c",
                            fontSize: "0.85rem",
                        }}
                    >
                        <strong>This can't be undone.</strong> If this is your
                        last method, 2FA will refuse the removal — enroll a
                        replacement first.
                    </Box>
                </>
            ),
            confirmLabel: "Remove",
            destructive: true,
            onConfirm: async () => {
                const res = await fetch(`/api/auth/mfa/factors/${target.id}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                // 404 means already gone (double-click race / other tab).
                // End-state matches the user's intent, so treat as success.
                if (res.ok || res.status === 404) {
                    setMsg({
                        text: "2FA method removed",
                        type: "success",
                    });
                    await refresh();
                    return;
                }
                const e: any = await res.json();
                setMsg({
                    text: e.error || "Remove failed",
                    type: "error",
                });
            },
        });

    const enableMfa = async () => {
        const res = await fetch("/api/auth/mfa/enable", {
            method: "POST",
            credentials: "include",
        });
        const data: any = await res.json();
        if (!res.ok) {
            setMsg({ text: data.error || "Enable failed", type: "error" });
            return;
        }
        setRevealedCodes(data.backup_codes);
        setMsg({
            text: "2FA enabled — copy your backup codes below.",
            type: "success",
        });
        await refresh();
    };

    const disableMfa = () =>
        askConfirm({
            title: "Disable 2FA?",
            icon: <SecurityIcon sx={{ color: "#b45309" }} />,
            body: (
                <Typography sx={{ color: "var(--fg-muted)" }}>
                    Your enrolled methods stay enrolled, but they won't be
                    required at login. You can re-enable 2FA at any time.
                </Typography>
            ),
            confirmLabel: "Disable",
            destructive: true,
            onConfirm: async () => {
                const res = await fetch("/api/auth/mfa/disable", {
                    method: "POST",
                    credentials: "include",
                });
                if (!res.ok) {
                    const e: any = await res.json();
                    setMsg({
                        text: e.error || "Disable failed",
                        type: "error",
                    });
                    return;
                }
                setMsg({ text: "2FA disabled", type: "success" });
                await refresh();
            },
        });

    const regenerateBackupCodes = () =>
        askConfirm({
            title: "Regenerate backup codes?",
            icon: <SecurityIcon sx={{ color: "#b45309" }} />,
            body: (
                <>
                    <Typography sx={{ color: "var(--fg-muted)", mb: 2 }}>
                        A fresh set of 8 codes will be generated. You'll see
                        them once — make sure you save them.
                    </Typography>
                    <Box
                        sx={{
                            p: 1.5,
                            borderRadius: "8px",
                            bgcolor: "rgba(251,146,60,0.08)",
                            border: "1px solid rgba(251,146,60,0.25)",
                            color: "#b45309",
                            fontSize: "0.85rem",
                        }}
                    >
                        <strong>
                            Your current codes will stop working immediately.
                        </strong>
                        {status?.unused_backup_codes ? (
                            <>
                                {" "}
                                You have{" "}
                                <strong>{status.unused_backup_codes}</strong>{" "}
                                unused — these will be invalidated.
                            </>
                        ) : null}
                    </Box>
                </>
            ),
            confirmLabel: "Regenerate",
            onConfirm: async () => {
                const res = await fetch(
                    "/api/auth/mfa/backup-codes/regenerate",
                    { method: "POST", credentials: "include" },
                );
                const data: any = await res.json();
                if (!res.ok) {
                    setMsg({
                        text: data.error || "Regenerate failed",
                        type: "error",
                    });
                    return;
                }
                setRevealedCodes(data.backup_codes);
                await refresh();
            },
        });

    const revokeDevice = (id: string) =>
        askConfirm({
            title: "Revoke trusted device?",
            icon: <LaptopIcon sx={{ color: "#b45309" }} />,
            body: (
                <Typography sx={{ color: "var(--fg-muted)" }}>
                    This device will be asked for 2FA on the next sign-in.
                    Existing sessions on that device keep working until they
                    expire.
                </Typography>
            ),
            confirmLabel: "Revoke",
            destructive: true,
            onConfirm: async () => {
                const res = await fetch(`/api/auth/devices/${id}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (!res.ok) {
                    setMsg({ text: "Revoke failed", type: "error" });
                    return;
                }
                await refresh();
            },
        });

    // Build a plain-text dump of the codes with a short header so the
    // user opening the file later still knows what these are. ISO date
    // in the filename lets them stay sortable next to older batches.
    const downloadBackupCodes = (codes: string[]) => {
        const stamp = new Date().toISOString().slice(0, 10);
        const body = [
            "Elixpo Accounts — 2FA backup codes",
            `Generated: ${new Date().toUTCString()}`,
            "",
            "Each code can be used ONCE to sign in if you lose access to",
            "your authenticator. Keep this file somewhere safe (password",
            "manager, encrypted drive). Regenerate from accounts.elixpo.com",
            "→ Security if you suspect these have leaked.",
            "",
            ...codes,
            "",
        ].join("\n");
        const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `elixpo-backup-codes-${stamp}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const copyBackupCodes = async (codes: string[]) => {
        try {
            await navigator.clipboard.writeText(codes.join("\n"));
            setMsg({
                text: "Backup codes copied to clipboard",
                type: "success",
            });
        } catch {
            setMsg({
                text: "Couldn't copy — use Download instead",
                type: "error",
            });
        }
    };

    const revokeSession = (s: Session) =>
        askConfirm({
            title: s.is_current
                ? "Sign out from this device?"
                : "Sign out other session?",
            icon: <LaptopIcon sx={{ color: "#b45309" }} />,
            body: (
                <Typography sx={{ color: "var(--fg-muted)" }}>
                    {s.is_current
                        ? "You'll be returned to the login page on this device."
                        : `The session on ${s.device} will be signed out the next time it tries to refresh its token.`}
                </Typography>
            ),
            confirmLabel: s.is_current ? "Sign out" : "Sign out session",
            destructive: true,
            onConfirm: async () => {
                const res = await fetch(`/api/auth/sessions/${s.id}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (!res.ok) {
                    setMsg({ text: "Sign out failed", type: "error" });
                    return;
                }
                if (s.is_current) {
                    // Revoking the current session — clear cookies + bounce.
                    await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include",
                    }).catch(() => {});
                    window.location.href = "/login";
                    return;
                }
                await refresh();
            },
        });

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                <CircularProgress sx={{ color: "#ff7759" }} />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    sx={{
                        fontWeight: 700,
                        color: "var(--fg)",
                        mb: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                    }}
                >
                    <SecurityIcon sx={{ color: "#ff7759" }} /> Security
                </Typography>
                <Typography sx={{ color: "var(--fg-faint)" }}>
                    Two-factor authentication and trusted devices.
                </Typography>
            </Box>

            {status?.mfa_required && (
                <Alert
                    severity="warning"
                    sx={{
                        mb: 3,
                        bgcolor: "rgba(251,146,60,0.1)",
                        color: "#b45309",
                        border: "1px solid rgba(251,146,60,0.3)",
                    }}
                >
                    You own {status.owned_apps_count} OAuth apps. 2FA is
                    required to keep using the platform. Enroll a method below
                    and click Enable 2FA.
                </Alert>
            )}

            {msg && (
                <Alert
                    severity={msg.type}
                    onClose={() => setMsg(null)}
                    sx={{ mb: 3 }}
                >
                    {msg.text}
                </Alert>
            )}

            {/* Factors */}
            <Box sx={{ ...cardSx, mb: 3 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 2,
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--fg)",
                            fontWeight: 600,
                            fontSize: "1.1rem",
                        }}
                    >
                        Two-factor methods
                    </Typography>
                    <Chip
                        label={
                            status?.mfa_enabled ? "2FA enabled" : "2FA disabled"
                        }
                        size="small"
                        sx={{
                            bgcolor: status?.mfa_enabled
                                ? "rgba(134,239,172,0.1)"
                                : "var(--overlay)",
                            color: status?.mfa_enabled
                                ? "#15803d"
                                : "var(--fg-faint)",
                            border: `1px solid ${status?.mfa_enabled ? "rgba(134,239,172,0.3)" : "var(--border)"}`,
                            fontWeight: 600,
                        }}
                    />
                </Box>

                {(status?.factors || []).length === 0 ? (
                    <Typography sx={{ color: "var(--fg-faint)", py: 2 }}>
                        No methods enrolled yet. Pick one below to get started.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                            mb: 2,
                        }}
                    >
                        {(status?.factors || []).map((f) => (
                            <Box
                                key={f.id}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: "10px",
                                    bgcolor: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    opacity: f.confirmed ? 1 : 0.5,
                                }}
                            >
                                {kindIcon[f.kind]}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 600,
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        {f.name || kindLabel[f.kind]}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.75rem",
                                        }}
                                    >
                                        {kindLabel[f.kind]} · added{" "}
                                        {new Date(
                                            f.created_at,
                                        ).toLocaleDateString()}
                                        {f.last_used_at
                                            ? ` · last used ${new Date(f.last_used_at).toLocaleDateString()}`
                                            : ""}
                                        {!f.confirmed
                                            ? " · pending confirmation"
                                            : ""}
                                    </Typography>
                                </Box>
                                {/* Pending factors need a resume action.
                                    Without this the user is stuck — a
                                    half-enrolled email_otp / totp row sits
                                    in the list with no way to re-enter the
                                    OTP. Reusing the same start handler
                                    funnels back through the existing
                                    enrollment flow (which is idempotent for
                                    email_otp — resends the code and reuses
                                    the row — and resets for totp). */}
                                {!f.confirmed && f.kind === "email_otp" && (
                                    <Button
                                        size="small"
                                        onClick={startEmailEnroll}
                                        disabled={emailResendCd.active}
                                        sx={{
                                            color: "#ff7759",
                                            textTransform: "none",
                                            fontSize: "0.8rem",
                                            mr: 0.5,
                                            "&:hover": {
                                                bgcolor:
                                                    "rgba(255, 119, 89,0.08)",
                                            },
                                            "&.Mui-disabled": {
                                                color: "var(--fg-faint)",
                                            },
                                        }}
                                    >
                                        {emailResendCd.active
                                            ? `Resend in ${emailResendCd.secondsLeft}s`
                                            : "Resend & enter code"}
                                    </Button>
                                )}
                                {!f.confirmed && f.kind === "totp" && (
                                    <Button
                                        size="small"
                                        onClick={startTotp}
                                        sx={{
                                            color: "#ff7759",
                                            textTransform: "none",
                                            fontSize: "0.8rem",
                                            mr: 0.5,
                                            "&:hover": {
                                                bgcolor:
                                                    "rgba(255, 119, 89,0.08)",
                                            },
                                        }}
                                    >
                                        Continue setup
                                    </Button>
                                )}
                                <IconButton
                                    size="small"
                                    onClick={() => removeFactor(f)}
                                    sx={{ color: "#b91c1c" }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                )}

                {(() => {
                    // Derive per-kind enrollment state so we can grey out
                    // buttons that point at factors the user already has.
                    // TOTP and Email-OTP are single-row-per-user factors;
                    // Passkey users can have multiple, so its button
                    // stays enabled.
                    const hasTotp = (status?.factors || []).some(
                        (f) => f.kind === "totp" && f.confirmed,
                    );
                    const hasEmailOtp = (status?.factors || []).some(
                        (f) => f.kind === "email_otp" && f.confirmed,
                    );
                    const enrollSx = {
                        color: "#ff7759",
                        borderColor: "rgba(255, 119, 89,0.4)",
                        textTransform: "none" as const,
                        "&:hover": {
                            borderColor: "#ff7759",
                            bgcolor: "rgba(255, 119, 89,0.06)",
                        },
                        "&.Mui-disabled": {
                            color: "var(--fg-faint)",
                            borderColor: "var(--border)",
                        },
                    };
                    return (
                        <Box
                            sx={{
                                display: "flex",
                                gap: 1.5,
                                flexWrap: "wrap",
                            }}
                        >
                            <Button
                                variant="outlined"
                                startIcon={<PhoneAndroidIcon />}
                                onClick={startTotp}
                                disabled={hasTotp}
                                sx={enrollSx}
                            >
                                {hasTotp
                                    ? "Authenticator added"
                                    : "Add authenticator app"}
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<KeyIcon />}
                                onClick={enrollPasskey}
                                sx={enrollSx}
                            >
                                Add passkey
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<MailOutlineIcon />}
                                onClick={startEmailEnroll}
                                disabled={hasEmailOtp || emailEnrollBusy}
                                sx={enrollSx}
                            >
                                {hasEmailOtp
                                    ? "Email code enabled"
                                    : emailEnrollBusy
                                      ? "Sending code…"
                                      : "Enable email code"}
                            </Button>
                        </Box>
                    );
                })()}

                <Box
                    sx={{
                        mt: 3,
                        pt: 3,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        gap: 1.5,
                    }}
                >
                    {!status?.mfa_enabled ? (
                        <Button
                            variant="contained"
                            onClick={enableMfa}
                            disabled={
                                (status?.factors || []).filter(
                                    (f) => f.confirmed,
                                ).length === 0
                            }
                            sx={{
                                background:
                                    "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                                textTransform: "none",
                                fontWeight: 600,
                            }}
                        >
                            Enable 2FA
                        </Button>
                    ) : (
                        <Button
                            variant="outlined"
                            onClick={disableMfa}
                            sx={{
                                color: "var(--fg-muted)",
                                borderColor: "var(--border)",
                                textTransform: "none",
                            }}
                        >
                            Disable 2FA
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Backup codes */}
            {status?.mfa_enabled && (
                <Box sx={{ ...cardSx, mb: 3 }}>
                    <Typography
                        sx={{
                            color: "var(--fg)",
                            fontWeight: 600,
                            fontSize: "1.1rem",
                            mb: 0.5,
                        }}
                    >
                        Backup codes
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.85rem",
                            mb: 2,
                        }}
                    >
                        Single-use codes for when you lose access to your other
                        methods. You have{" "}
                        <strong style={{ color: "var(--fg)" }}>
                            {status.unused_backup_codes}
                        </strong>{" "}
                        unused.
                    </Typography>

                    {revealedCodes && (
                        <Box
                            sx={{
                                p: 2,
                                mb: 2,
                                borderRadius: "10px",
                                background:
                                    "linear-gradient(135deg, rgba(255, 119, 89,0.12), rgba(255, 119, 89,0.05))",
                                border: "1px solid rgba(255, 119, 89,0.35)",
                            }}
                        >
                            <Typography
                                sx={{
                                    color: "#b45309",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    mb: 1.5,
                                }}
                            >
                                COPY THESE CODES NOW — THEY WILL NOT BE SHOWN
                                AGAIN
                            </Typography>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 1,
                                }}
                            >
                                {revealedCodes.map((c) => (
                                    <Box
                                        key={c}
                                        component="code"
                                        sx={{
                                            fontFamily:
                                                "var(--font-geist-mono), monospace",
                                            color: "var(--fg)",
                                            bgcolor: "var(--overlay)",
                                            p: 1,
                                            borderRadius: "6px",
                                            fontSize: "0.9rem",
                                            textAlign: "center",
                                        }}
                                    >
                                        {c}
                                    </Box>
                                ))}
                            </Box>
                            <Box
                                sx={{
                                    mt: 1.5,
                                    display: "flex",
                                    gap: 1,
                                    flexWrap: "wrap",
                                }}
                            >
                                <Button
                                    size="small"
                                    startIcon={<DownloadIcon />}
                                    onClick={() =>
                                        downloadBackupCodes(revealedCodes)
                                    }
                                    sx={{
                                        color: "#ff7759",
                                        textTransform: "none",
                                        bgcolor: "rgba(255, 119, 89,0.1)",
                                        border: "1px solid rgba(255, 119, 89,0.3)",
                                        "&:hover": {
                                            bgcolor: "rgba(255, 119, 89,0.18)",
                                        },
                                    }}
                                >
                                    Download .txt
                                </Button>
                                <Button
                                    size="small"
                                    startIcon={<ContentCopyIcon />}
                                    onClick={() =>
                                        copyBackupCodes(revealedCodes)
                                    }
                                    sx={{
                                        color: "var(--fg-muted)",
                                        textTransform: "none",
                                        border: "1px solid var(--border)",
                                        "&:hover": {
                                            bgcolor: "var(--overlay)",
                                        },
                                    }}
                                >
                                    Copy
                                </Button>
                                <Button
                                    size="small"
                                    onClick={() => setRevealedCodes(null)}
                                    sx={{
                                        color: "var(--fg-faint)",
                                        textTransform: "none",
                                        ml: "auto",
                                    }}
                                >
                                    I've saved them
                                </Button>
                            </Box>
                        </Box>
                    )}

                    <Button
                        variant="outlined"
                        onClick={regenerateBackupCodes}
                        sx={{
                            color: "#ff7759",
                            borderColor: "rgba(255, 119, 89,0.4)",
                            textTransform: "none",
                        }}
                    >
                        Regenerate backup codes
                    </Button>
                </Box>
            )}

            {/* Active sessions — every device currently signed in. */}
            <Box sx={{ ...cardSx, mb: 3 }}>
                <Typography
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 600,
                        fontSize: "1.1rem",
                        mb: 0.5,
                    }}
                >
                    Active sessions
                </Typography>
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.85rem",
                        mb: 2,
                    }}
                >
                    Devices currently signed in to your account. Sign out any
                    you don't recognize.
                </Typography>
                {sessions.length === 0 ? (
                    <Typography sx={{ color: "var(--fg-faint)", py: 2 }}>
                        No active sessions.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                        }}
                    >
                        {sessions.map((s) => (
                            <Box
                                key={s.id}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: "10px",
                                    bgcolor: s.is_current
                                        ? "rgba(255, 119, 89,0.06)"
                                        : "var(--surface)",
                                    border: `1px solid ${s.is_current ? "rgba(255, 119, 89,0.3)" : "var(--border)"}`,
                                }}
                            >
                                <LaptopIcon sx={{ color: "#ff7759" }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: "var(--fg)",
                                                fontSize: "0.9rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {s.device}
                                        </Typography>
                                        {s.is_current && (
                                            <Chip
                                                label="This device"
                                                size="small"
                                                sx={{
                                                    height: 18,
                                                    fontSize: "0.65rem",
                                                    bgcolor:
                                                        "rgba(134,239,172,0.1)",
                                                    color: "#15803d",
                                                    border: "1px solid rgba(134,239,172,0.3)",
                                                    fontWeight: 600,
                                                }}
                                            />
                                        )}
                                    </Box>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.75rem",
                                        }}
                                    >
                                        Signed in{" "}
                                        {new Date(
                                            s.created_at,
                                        ).toLocaleDateString()}
                                        {" · last active "}
                                        {new Date(
                                            s.last_used_at,
                                        ).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Button
                                    size="small"
                                    onClick={() => revokeSession(s)}
                                    sx={{
                                        color: "var(--fg-faint)",
                                        textTransform: "none",
                                        fontSize: "0.8rem",
                                        "&:hover": {
                                            color: "#b91c1c",
                                            bgcolor: "rgba(239,68,68,0.08)",
                                        },
                                    }}
                                >
                                    Sign out
                                </Button>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* Trusted devices */}
            <Box sx={cardSx}>
                <Typography
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 600,
                        fontSize: "1.1rem",
                        mb: 0.5,
                    }}
                >
                    Trusted devices
                </Typography>
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.85rem",
                        mb: 2,
                    }}
                >
                    Devices that skip the 2FA prompt for 30 days. Revoke any you
                    don't recognize.
                </Typography>
                {devices.length === 0 ? (
                    <Typography sx={{ color: "var(--fg-faint)", py: 2 }}>
                        No trusted devices.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                        }}
                    >
                        {devices.map((d) => (
                            <Box
                                key={d.id}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: "10px",
                                    bgcolor: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    opacity: d.is_active ? 1 : 0.4,
                                }}
                            >
                                <LaptopIcon
                                    sx={{
                                        color: d.is_active
                                            ? "#ff7759"
                                            : "var(--fg-faint)",
                                    }}
                                />
                                <Box sx={{ flex: 1 }}>
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontSize: "0.9rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {d.name ||
                                            d.ua_short ||
                                            "Unknown device"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.75rem",
                                        }}
                                    >
                                        {d.is_active
                                            ? `Last seen ${new Date(d.last_seen_at).toLocaleString()}`
                                            : "Revoked"}
                                    </Typography>
                                </Box>
                                {d.is_active && (
                                    <IconButton
                                        size="small"
                                        onClick={() => revokeDevice(d.id)}
                                        sx={{ color: "#b91c1c" }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* TOTP enrollment dialog */}
            <Dialog
                open={totpDialog}
                onClose={() => setTotpDialog(false)}
                PaperProps={{
                    sx: {
                        bgcolor: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        backdropFilter: "blur(20px)",
                    },
                }}
            >
                <DialogTitle sx={{ color: "var(--fg)", fontWeight: 700 }}>
                    Set up authenticator app
                </DialogTitle>
                <DialogContent>
                    {totpData && (
                        <>
                            <Typography
                                sx={{
                                    color: "var(--fg-muted)",
                                    mb: 2,
                                    fontSize: "0.9rem",
                                }}
                            >
                                1. Open your authenticator app (Google
                                Authenticator, 1Password, Authy…) and scan this
                                QR code.
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    mb: 2,
                                }}
                            >
                                <Box
                                    component="img"
                                    src={totpData.qr_dataurl}
                                    alt="TOTP QR"
                                    sx={{
                                        width: 200,
                                        height: 200,
                                        borderRadius: "8px",
                                    }}
                                />
                            </Box>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.75rem",
                                    textAlign: "center",
                                    mb: 2,
                                }}
                            >
                                Or paste this secret:
                            </Typography>
                            <Box
                                component="code"
                                sx={{
                                    display: "block",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    bgcolor: "var(--overlay)",
                                    color: "#ff7759",
                                    p: 1,
                                    borderRadius: "6px",
                                    fontSize: "0.8rem",
                                    textAlign: "center",
                                    mb: 3,
                                    wordBreak: "break-all",
                                }}
                            >
                                {totpData.secret}
                            </Box>
                            <Typography
                                sx={{
                                    color: "var(--fg-muted)",
                                    mb: 1,
                                    fontSize: "0.9rem",
                                }}
                            >
                                2. Enter the 6-digit code your app shows:
                            </Typography>
                            <TextField
                                fullWidth
                                value={totpCode}
                                onChange={(e) =>
                                    setTotpCode(
                                        e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 6),
                                    )
                                }
                                placeholder="123456"
                                inputProps={{
                                    inputMode: "numeric",
                                    style: {
                                        textAlign: "center",
                                        fontSize: "1.5rem",
                                        letterSpacing: "8px",
                                        fontFamily: "monospace",
                                    },
                                }}
                                sx={{
                                    "& .MuiOutlinedInput-root": {
                                        color: "var(--fg)",
                                        "& fieldset": {
                                            borderColor: "var(--border)",
                                        },
                                        "&:hover fieldset": {
                                            borderColor:
                                                "rgba(255, 119, 89,0.4)",
                                        },
                                        "&.Mui-focused fieldset": {
                                            borderColor: "#ff7759",
                                        },
                                    },
                                }}
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions
                    sx={{ borderTop: "1px solid var(--border)", p: 2 }}
                >
                    <Button
                        onClick={() => setTotpDialog(false)}
                        sx={{ color: "var(--fg-faint)" }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmTotp}
                        variant="contained"
                        disabled={totpBusy || totpCode.length !== 6}
                        sx={{
                            background:
                                "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                            textTransform: "none",
                            fontWeight: 600,
                        }}
                    >
                        {totpBusy ? "Verifying…" : "Confirm"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Shared confirmation dialog — replaces native confirm()
                for every "are-you-sure" prompt on this page. Title +
                body + cancel + confirm. Destructive flag swaps the
                confirm button gradient red. */}
            <Dialog
                open={!!confirmCfg}
                onClose={() => !confirmBusy && setConfirmCfg(null)}
                PaperProps={{
                    sx: {
                        bgcolor: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        backdropFilter: "blur(20px)",
                        maxWidth: 440,
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                    }}
                >
                    {confirmCfg?.icon}
                    {confirmCfg?.title}
                </DialogTitle>
                <DialogContent>{confirmCfg?.body}</DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid var(--border)",
                        p: 2,
                    }}
                >
                    <Button
                        onClick={() => setConfirmCfg(null)}
                        disabled={confirmBusy}
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={runConfirm}
                        disabled={confirmBusy}
                        variant="contained"
                        sx={{
                            background: confirmCfg?.destructive
                                ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"
                                : "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                            textTransform: "none",
                            fontWeight: 600,
                        }}
                    >
                        {confirmBusy ? "Working…" : confirmCfg?.confirmLabel}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Email-OTP enrollment dialog */}
            <Dialog
                open={emailEnrollDialog}
                onClose={() => !emailEnrollBusy && setEmailEnrollDialog(false)}
                PaperProps={{
                    sx: {
                        bgcolor: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        backdropFilter: "blur(20px)",
                        maxWidth: 440,
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                    }}
                >
                    <MailOutlineIcon sx={{ color: "#ff7759" }} />
                    Enable email code
                </DialogTitle>
                <DialogContent>
                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            fontSize: "0.9rem",
                            mb: 2,
                        }}
                    >
                        We sent a 6-digit verification code to{" "}
                        <strong style={{ color: "var(--fg)" }}>
                            {emailEnrollData?.sent_to}
                        </strong>
                        . Enter it below to confirm you control this address.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        value={emailEnrollCode}
                        onChange={(e) =>
                            setEmailEnrollCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                        }
                        placeholder="123456"
                        inputProps={{
                            inputMode: "numeric",
                            style: {
                                textAlign: "center",
                                fontSize: "1.5rem",
                                letterSpacing: "8px",
                                fontFamily: "monospace",
                            },
                        }}
                        sx={{
                            "& .MuiOutlinedInput-root": {
                                color: "var(--fg)",
                                "& fieldset": {
                                    borderColor: "var(--border)",
                                },
                                "&:hover fieldset": {
                                    borderColor: "rgba(255, 119, 89,0.4)",
                                },
                                "&.Mui-focused fieldset": {
                                    borderColor: "#ff7759",
                                },
                            },
                        }}
                    />
                    <Button
                        size="small"
                        onClick={resendEmailEnroll}
                        disabled={emailEnrollBusy || emailResendCd.active}
                        sx={{
                            mt: 1,
                            color: "var(--fg-faint)",
                            textTransform: "none",
                            fontSize: "0.8rem",
                            "&.Mui-disabled": {
                                color: "var(--fg-faint)",
                            },
                        }}
                    >
                        {emailResendCd.active
                            ? `Resend in ${emailResendCd.secondsLeft}s`
                            : "Resend code"}
                    </Button>
                </DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid var(--border)",
                        p: 2,
                    }}
                >
                    <Button
                        onClick={() => setEmailEnrollDialog(false)}
                        disabled={emailEnrollBusy}
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmEmailEnroll}
                        disabled={
                            emailEnrollBusy || emailEnrollCode.length !== 6
                        }
                        variant="contained"
                        sx={{
                            background:
                                "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
                            textTransform: "none",
                            fontWeight: 600,
                        }}
                    >
                        {emailEnrollBusy ? "Verifying…" : "Verify & enable"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
