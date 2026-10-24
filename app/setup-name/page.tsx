"use client";

import {
    Alert,
    Box,
    Button,
    Snackbar,
    TextField,
    Typography,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getContrastColor } from "@/lib/branding-validation";
import BackgroundAurora from "../components/background-aurora";
import {
    useVerifiedBranding,
    VerifiedBrandBanner,
} from "../components/verified-brand-banner";

const ACCENT = "#ff7759";

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        background: "transparent",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: ACCENT },
    "& .MuiFormHelperText-root": { color: "var(--fg-faint)" },
};

function slugifyHandle(s: string): string {
    return (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "")
        .slice(0, 32);
}

const SetupNameContent = () => {
    const _router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get("next");
    const branding = useVerifiedBranding(next);
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [check, setCheck] = useState<{
        state: "idle" | "checking" | "available" | "taken";
        reason?: string;
    }>({ state: "idle" });
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "error";
    }>({ open: false, message: "", severity: "success" });

    // Uses window.location for the catch branch so router isn't referenced
    // inside the effect — prevents eslint-react-hooks from autofixing it
    // back into deps (which would loop the /me fetch).
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/auth/me", {
                    credentials: "include",
                });
                if (!res.ok) {
                    window.location.href = next
                        ? `/login?next=${encodeURIComponent(next)}`
                        : "/login";
                    return;
                }
                const data: any = await res.json();
                if (data.username) {
                    window.location.href = next || "/dashboard/oauth-apps";
                    return;
                }
                const dn = data.displayName || "";
                setDisplayName(dn);
                setUsername(slugifyHandle(dn));
            } catch {
                window.location.href = "/login";
            } finally {
                setPageLoading(false);
            }
        })();
    }, [next]);
    // Debounced availability check.

    useEffect(() => {
        const u = username.trim().toLowerCase();
        if (!u) {
            setCheck({ state: "idle" });
            return;
        }
        setCheck({ state: "checking" });
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/auth/username/check?u=${encodeURIComponent(u)}`,
                );
                const data: any = await res.json();
                setCheck(
                    data.available
                        ? { state: "available" }
                        : { state: "taken", reason: data.reason },
                );
            } catch {
                setCheck({ state: "idle" });
            }
        }, 350);
        return () => clearTimeout(t);
    }, [username]);

    const handleSave = async () => {
        const dn = displayName.trim();
        const handle = username.trim().toLowerCase();
        if (dn.length < 2 || dn.length > 32) {
            setToast({
                open: true,
                message: "Display name must be 2-32 characters.",
                severity: "error",
            });
            return;
        }
        if (check.state !== "available") {
            setToast({
                open: true,
                message: check.reason || "Pick an available username.",
                severity: "error",
            });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username: handle, display_name: dn }),
            });
            if (!res.ok) {
                const data: any = await res.json();
                throw new Error(data.error || "Failed to save");
            }
            setToast({ open: true, message: "All set!", severity: "success" });
            const dest = next || "/dashboard/oauth-apps";
            setTimeout(() => {
                window.location.href = dest;
            }, 800);
        } catch (err) {
            setToast({
                open: true,
                message: err instanceof Error ? err.message : "Failed to save",
                severity: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    if (pageLoading) {
        return (
            <Box
                sx={{
                    position: "relative",
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <BackgroundAurora variant="default" />
                <Typography
                    sx={{
                        position: "relative",
                        zIndex: 1,
                        color: "var(--fg-faint)",
                    }}
                >
                    Loading...
                </Typography>
            </Box>
        );
    }

    const handleHelper =
        check.state === "checking"
            ? "Checking availability…"
            : check.state === "available"
              ? "✓ Available"
              : check.state === "taken"
                ? `✗ ${check.reason || "Taken"}`
                : "3–32 chars. Lowercase letters, numbers, - and _. This is your @handle.";
    const handleHelperColor =
        check.state === "available"
            ? "#15803d"
            : check.state === "taken"
              ? "#b91c1c"
              : "var(--fg-faint)";

    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 2,
            }}
        >
            <BackgroundAurora variant="default" />
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: "460px",
                    width: "100%",
                    backdropFilter: "blur(20px)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    boxShadow: "0 8px 32px 0 rgba(25, 40, 55, 0.06)",
                    p: 4,
                }}
            >
                <VerifiedBrandBanner branding={branding} />
                <Box sx={{ textAlign: "center", mb: 3 }}>
                    <Typography
                        variant="h4"
                        sx={{ fontWeight: 700, color: "var(--fg)", mb: 1 }}
                    >
                        {branding
                            ? `Finish setup for ${branding.displayName}`
                            : "Claim your handle"}
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.95rem",
                        }}
                    >
                        Pick a unique username and display name. You will return
                        to {branding?.domain || "your account"} when finished.
                    </Typography>
                </Box>

                <TextField
                    fullWidth
                    label="Username"
                    value={username}
                    onChange={(e) =>
                        setUsername(
                            e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_-]/g, ""),
                        )
                    }
                    placeholder="e.g. anwesha, swift-fox"
                    helperText={handleHelper}
                    FormHelperTextProps={{
                        sx: { color: `${handleHelperColor} !important` },
                    }}
                    sx={{ ...textFieldSx, mb: 2.5 }}
                    disabled={loading}
                    inputProps={{ maxLength: 32 }}
                    InputProps={{
                        startAdornment: (
                            <Typography
                                sx={{ color: "var(--fg-faint)", mr: 0.5 }}
                            >
                                @
                            </Typography>
                        ),
                    }}
                />

                <TextField
                    fullWidth
                    label="Display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Anwesha Chakraborty"
                    helperText="2-32 characters. Shown on your profile."
                    sx={textFieldSx}
                    disabled={loading}
                    inputProps={{ maxLength: 32 }}
                />

                <Button
                    fullWidth
                    variant="contained"
                    onClick={handleSave}
                    disabled={
                        loading ||
                        check.state !== "available" ||
                        displayName.trim().length < 2
                    }
                    sx={{
                        mt: 3,
                        background: branding?.primaryColor || ACCENT,
                        color: branding
                            ? getContrastColor(branding.primaryColor)
                            : "#fff",
                        fontWeight: 600,
                        textTransform: "none",
                        fontSize: "0.95rem",
                        py: 1.3,
                        "&:hover": { background: "rgba(255, 119, 89, 0.9)" },
                        "&:disabled": {
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                        },
                    }}
                >
                    {loading ? "Saving..." : "Continue"}
                </Button>

                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.8rem",
                        textAlign: "center",
                        mt: 2.5,
                    }}
                >
                    Your username can be changed later from your profile, but
                    links to your old handle will break.
                </Typography>
            </Box>

            <Snackbar
                open={toast.open}
                autoHideDuration={3000}
                onClose={() => setToast({ ...toast, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setToast({ ...toast, open: false })}
                    severity={toast.severity}
                    variant="filled"
                    sx={{
                        ...(toast.severity === "success" && {
                            backgroundColor: "#15803d",
                            color: "#fff",
                        }),
                        ...(toast.severity === "error" && {
                            backgroundColor: "#b91c1c",
                            color: "#fff",
                        }),
                    }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

const SetupNamePage = () => (
    <Suspense>
        <SetupNameContent />
    </Suspense>
);

export default SetupNamePage;
