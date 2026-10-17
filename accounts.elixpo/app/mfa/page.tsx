"use client";

import KeyIcon from "@mui/icons-material/Key";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import SecurityIcon from "@mui/icons-material/Security";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    TextField,
    Typography,
} from "@mui/material";
import { startAuthentication } from "@simplewebauthn/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useCooldown } from "@/lib/hooks/useCooldown";
import {
    useVerifiedBranding,
    VerifiedBrandBanner,
} from "../components/verified-brand-banner";

const EMAIL_OTP_RESEND_COOLDOWN_S = 60;

type Method = "passkey" | "totp" | "email_otp" | "backup_code";

const methodMeta: Record<
    Method,
    { label: string; icon: React.ReactNode; hint: string }
> = {
    passkey: {
        label: "Use passkey",
        icon: <KeyIcon sx={{ color: "#ff7759" }} />,
        hint: "Touch ID, security key, or another passkey-capable device.",
    },
    totp: {
        label: "Use authenticator app",
        icon: <PhoneAndroidIcon sx={{ color: "#ff7759" }} />,
        hint: "Enter the 6-digit code from your authenticator.",
    },
    email_otp: {
        label: "Use email code",
        icon: <MailOutlineIcon sx={{ color: "#ff7759" }} />,
        hint: "We'll send a code to your registered email.",
    },
    backup_code: {
        label: "Use backup code",
        icon: <SecurityIcon sx={{ color: "#ff7759" }} />,
        hint: "One of the codes you saved when you enabled 2FA.",
    },
};

function ChallengeInner() {
    const params = useSearchParams();
    const mfaToken = params.get("token");
    const branding = useVerifiedBranding(params.get("next"));

    const [methods, setMethods] = useState<Method[]>([]);
    const [selected, setSelected] = useState<Method | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [trustDevice, setTrustDevice] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Matches the server-side cooldown floor (60s — KV minimum TTL).
    const emailResendCd = useCooldown();

    useEffect(() => {
        // Source of truth = the server, because the OAuth-callback flow
        // redirects here WITHOUT methods in the URL (the email-login
        // flow does pass them as a hint). Either way we re-fetch the
        // user's actually-enrolled list so we never render a button
        // that would fail at verify time.
        if (!mfaToken) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `/api/auth/mfa/challenge/methods?token=${encodeURIComponent(mfaToken)}`,
                );
                if (!res.ok) {
                    // mfaToken expired or invalid — fall back to whatever
                    // URL hints we have so the page at least renders.
                    if (cancelled) return;
                    const raw = params.get("methods");
                    const hint = raw
                        ? (raw
                              .split(",")
                              .filter((m): m is Method =>
                                  [
                                      "passkey",
                                      "totp",
                                      "email_otp",
                                      "backup_code",
                                  ].includes(m),
                              ) as Method[])
                        : [];
                    setMethods(hint);
                    if (hint.length > 0) setSelected(hint[0]);
                    return;
                }
                const data: any = await res.json();
                const real = (data.methods || []).filter(
                    (m: string): m is Method =>
                        [
                            "passkey",
                            "totp",
                            "email_otp",
                            "backup_code",
                        ].includes(m),
                );
                if (cancelled) return;
                setMethods(real);
                if (real.length > 0) setSelected(real[0]);
            } catch {
                /* network blip — leave list empty so the empty-state shows */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mfaToken, params]);

    if (!mfaToken) {
        return (
            <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography sx={{ color: "#b91c1c" }}>
                    Missing challenge token.
                </Typography>
                <Button href="/login" sx={{ mt: 2, color: "#ff7759" }}>
                    Back to sign in
                </Button>
            </Box>
        );
    }

    const submitCode = async () => {
        if (!selected) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/mfa/challenge/verify", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mfaToken,
                    method: selected,
                    code,
                    trust_device: trustDevice,
                }),
            });
            const data: any = await res.json();
            if (!res.ok) {
                setError(data.error || "Verification failed");
                return;
            }
            window.location.href = data.next || "/dashboard/oauth-apps";
        } finally {
            setBusy(false);
        }
    };

    const submitPasskey = async () => {
        setBusy(true);
        setError(null);
        try {
            const optsRes = await fetch(
                "/api/auth/mfa/challenge/passkey/options",
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mfaToken }),
                },
            );
            if (!optsRes.ok)
                throw new Error("Failed to start passkey challenge");
            const opts: any = await optsRes.json();
            const assertion = await startAuthentication({ optionsJSON: opts });
            const verifyRes = await fetch("/api/auth/mfa/challenge/verify", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mfaToken,
                    method: "passkey",
                    response: assertion,
                    trust_device: trustDevice,
                }),
            });
            const data: any = await verifyRes.json();
            if (!verifyRes.ok) {
                setError(data.error || "Passkey verification failed");
                return;
            }
            window.location.href = data.next || "/dashboard/oauth-apps";
        } catch (err: any) {
            setError(err?.message || "Passkey challenge cancelled");
        } finally {
            setBusy(false);
        }
    };

    const sendEmailOtp = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/mfa/challenge/send-email-otp", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mfaToken }),
            });
            // Read once as text so CF edge HTML 5xx pages still surface.
            const rawText = await res.text().catch(() => "");
            let data: any = {};
            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch {
                /* non-JSON body */
            }
            if (!res.ok) {
                const detail =
                    data.error ||
                    (rawText
                        ? `HTTP ${res.status}: ${rawText.slice(0, 200)}`
                        : `HTTP ${res.status} with empty body`);
                console.error(
                    "[mfa challenge send-email-otp] failed — status=%s body=%s",
                    String(res.status),
                    rawText.slice(0, 500),
                );
                setError(detail);
                return;
            }
            setEmailSent(true);
            emailResendCd.start(EMAIL_OTP_RESEND_COOLDOWN_S);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    maxWidth: 440,
                    p: 4,
                    borderRadius: "20px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    backdropFilter: "blur(20px)",
                }}
            >
                <VerifiedBrandBanner branding={branding} />
                <Box sx={{ textAlign: "center", mb: 3 }}>
                    <SecurityIcon
                        sx={{ color: "#ff7759", fontSize: 36, mb: 1 }}
                    />
                    <Typography
                        variant="h5"
                        sx={{ color: "var(--fg)", fontWeight: 700 }}
                    >
                        Two-factor verification
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.9rem",
                            mt: 0.5,
                        }}
                    >
                        Confirm it's you to finish signing in.
                    </Typography>
                </Box>

                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        mb: 3,
                    }}
                >
                    {methods.map((m) => (
                        <Box
                            key={m}
                            onClick={() => {
                                setSelected(m);
                                setError(null);
                                setCode("");
                                setEmailSent(false);
                            }}
                            sx={{
                                p: 1.5,
                                borderRadius: "10px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                border: `1px solid ${selected === m ? "rgba(255, 119, 89,0.5)" : "var(--border)"}`,
                                bgcolor:
                                    selected === m
                                        ? "rgba(255, 119, 89,0.08)"
                                        : "transparent",
                                transition: "all 0.15s",
                                "&:hover": {
                                    borderColor: "rgba(255, 119, 89,0.4)",
                                },
                            }}
                        >
                            {methodMeta[m].icon}
                            <Box sx={{ flex: 1 }}>
                                <Typography
                                    sx={{
                                        color: "var(--fg)",
                                        fontSize: "0.9rem",
                                        fontWeight: 600,
                                    }}
                                >
                                    {methodMeta[m].label}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.72rem",
                                    }}
                                >
                                    {methodMeta[m].hint}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Method-specific input */}
                {selected === "passkey" ? (
                    <Button
                        fullWidth
                        variant="contained"
                        onClick={submitPasskey}
                        disabled={busy}
                        startIcon={<KeyIcon />}
                        sx={{
                            background: "#ff7759",
                            color: "#fff",
                            textTransform: "none",
                            py: 1.2,
                            fontWeight: 600,
                            "&:hover": {
                                background: "rgba(255, 119, 89, 0.9)",
                            },
                        }}
                    >
                        {busy ? "Authenticating…" : "Continue with passkey"}
                    </Button>
                ) : selected === "email_otp" ? (
                    !emailSent ? (
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={sendEmailOtp}
                            disabled={busy}
                            sx={{
                                color: "#ff7759",
                                borderColor: "rgba(255, 119, 89,0.4)",
                                textTransform: "none",
                                py: 1.2,
                            }}
                        >
                            {busy ? "Sending…" : "Send code to my email"}
                        </Button>
                    ) : (
                        <>
                            <TextField
                                fullWidth
                                value={code}
                                onChange={(e) =>
                                    setCode(
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
                                    mb: 2,
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
                            <Button
                                fullWidth
                                variant="contained"
                                onClick={submitCode}
                                disabled={busy || code.length !== 6}
                                sx={{
                                    background: "#ff7759",
                                    color: "#fff",
                                    textTransform: "none",
                                    py: 1.2,
                                    fontWeight: 600,
                                    "&:hover": {
                                        background: "rgba(255, 119, 89, 0.9)",
                                    },
                                }}
                            >
                                {busy ? "Verifying…" : "Verify"}
                            </Button>
                        </>
                    )
                ) : (
                    <>
                        <TextField
                            fullWidth
                            value={code}
                            onChange={(e) =>
                                setCode(
                                    selected === "backup_code"
                                        ? e.target.value
                                              .toUpperCase()
                                              .slice(0, 16)
                                        : e.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, 6),
                                )
                            }
                            placeholder={
                                selected === "backup_code"
                                    ? "XXXXX-XXXXX"
                                    : "123456"
                            }
                            inputProps={{
                                style: {
                                    textAlign: "center",
                                    fontSize: "1.3rem",
                                    letterSpacing:
                                        selected === "backup_code"
                                            ? "2px"
                                            : "8px",
                                    fontFamily: "monospace",
                                },
                            }}
                            sx={{
                                mb: 2,
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
                            fullWidth
                            variant="contained"
                            onClick={submitCode}
                            disabled={busy || code.length < 6}
                            sx={{
                                background: "#ff7759",
                                color: "#fff",
                                textTransform: "none",
                                py: 1.2,
                                fontWeight: 600,
                                "&:hover": {
                                    background: "rgba(255, 119, 89, 0.9)",
                                },
                            }}
                        >
                            {busy ? "Verifying…" : "Verify"}
                        </Button>
                    </>
                )}

                <Box
                    sx={{
                        mt: 1.5,
                        display: "flex",
                        flexDirection: { xs: "column", sm: "row" },
                        alignItems: { xs: "flex-start", sm: "center" },
                        justifyContent:
                            selected === "email_otp" && emailSent
                                ? "space-between"
                                : "flex-end",
                        gap: 1,
                    }}
                >
                    {selected === "email_otp" && emailSent && (
                        <Button
                            size="small"
                            onClick={sendEmailOtp}
                            disabled={busy || emailResendCd.active}
                            sx={{
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
                    )}
                    <FormControlLabel
                        sx={{ m: 0, color: "var(--fg-muted)" }}
                        control={
                            <Checkbox
                                checked={trustDevice}
                                onChange={(e) =>
                                    setTrustDevice(e.target.checked)
                                }
                                sx={{
                                    color: "var(--fg-faint)",
                                    "&.Mui-checked": { color: "#ff7759" },
                                }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: "0.85rem" }}>
                                Trust this device for 30 days
                            </Typography>
                        }
                    />
                </Box>
            </Box>
        </Box>
    );
}

export default function MfaChallengePage() {
    return (
        <Suspense
            fallback={
                <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
                    <CircularProgress sx={{ color: "#ff7759" }} />
                </Box>
            }
        >
            <ChallengeInner />
        </Suspense>
    );
}
