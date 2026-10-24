"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BlockIcon from "@mui/icons-material/Block";
import DevicesOtherIcon from "@mui/icons-material/DevicesOther";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import VerifiedIcon from "@mui/icons-material/Verified";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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
    FormGroup,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { generatePixelAvatar } from "@/lib/pixel-avatar";

interface UserProfile {
    email: string;
    id: string;
    provider: string;
    avatar?: string | null;
    emailVerified?: boolean;
    username?: string | null;
    displayName?: string | null;
    bio?: string | null;
    country?: string | null;
    city?: string | null;
    location?: string | null;
    locale?: string | null;
    timezone?: string | null;
}

interface ConnectedService {
    client_id: string;
    name: string;
    description?: string;
    homepage_url?: string;
    first_authorized: string;
    last_authorized: string;
}

interface NotificationPreferences {
    email_login_alerts: boolean;
    email_app_activity: boolean;
    email_weekly_digest: boolean;
    email_security_alerts: boolean;
}

const cardSx = {
    bgcolor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    p: 3,
};

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        background: "transparent",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: "#ff7759" },
    },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#ff7759" },
};

const switchSx = {
    "& .MuiSwitch-switchBase.Mui-checked": { color: "#ff7759" },
    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
        bgcolor: "#15803d",
    },
};

const sectionTitleSx = {
    fontWeight: 700,
    color: "var(--fg)",
    mb: 0.5,
    display: "flex",
    alignItems: "center",
    gap: 1,
};

const sectionSubtitleSx = {
    color: "var(--fg-faint)",
    fontSize: "0.9rem",
    mb: 3,
};

const _dividerSx = {
    borderColor: "var(--border)",
    my: 2.5,
};

function ServiceIconSmall({ svc }: { svc: ConnectedService }) {
    const [failed, setFailed] = useState(false);
    const hostname = svc.homepage_url
        ? (() => {
              try {
                  return new URL(svc.homepage_url).hostname;
              } catch {
                  return "";
              }
          })()
        : "";

    if (svc.homepage_url && hostname && !failed) {
        return (
            <Box
                component="img"
                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                alt=""
                sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "4px",
                    flexShrink: 0,
                }}
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <Box
            component="img"
            src={generatePixelAvatar(svc.client_id + svc.name, 24)}
            alt=""
            sx={{ width: 24, height: 24, borderRadius: "4px", flexShrink: 0 }}
        />
    );
}

const ProfilePage = () => {
    const router = useRouter();
    // Profile state

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState("");
    // Update profile state

    const [bio, setBio] = useState("");
    const [country, setCountry] = useState("");
    const [city, setCity] = useState("");
    const [location, setLocation] = useState("");
    const [locale, setLocale] = useState("en");
    const [timezone, setTimezone] = useState("UTC");
    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateSuccess, setUpdateSuccess] = useState("");
    const [updateError, setUpdateError] = useState("");
    // Notification preferences state

    const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
        email_login_alerts: false,
        email_app_activity: false,
        email_weekly_digest: false,
        email_security_alerts: false,
    });
    const [notifLoading, setNotifLoading] = useState(true);
    const [notifSaveLoading, setNotifSaveLoading] = useState(false);
    const [notifSuccess, setNotifSuccess] = useState("");
    const [notifError, setNotifError] = useState("");
    // Delete account state

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    // Display name state

    const [editingName, setEditingName] = useState(false);
    const [newDisplayName, setNewDisplayName] = useState("");
    const [nameLoading, setNameLoading] = useState(false);
    const [nameMsg, setNameMsg] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);
    // Username (handle) change state — changing a handle is destructive.

    const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [usernameLoading, setUsernameLoading] = useState(false);
    const [usernameMsg, setUsernameMsg] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);
    const [usernameCheck, setUsernameCheck] = useState<{
        state: "idle" | "checking" | "available" | "taken";
        reason?: string;
    }>({ state: "idle" });
    // Debounced availability check while the change dialog is open.

    useEffect(() => {
        if (!usernameDialogOpen) return;
        const u = newUsername.trim().toLowerCase();
        if (!u || u === profile?.username) {
            setUsernameCheck({ state: "idle" });
            return;
        }
        setUsernameCheck({ state: "checking" });
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/auth/username/check?u=${encodeURIComponent(u)}`,
                );
                const data: any = await res.json();
                setUsernameCheck(
                    data.available
                        ? { state: "available" }
                        : { state: "taken", reason: data.reason },
                );
            } catch {
                setUsernameCheck({ state: "idle" });
            }
        }, 350);
        return () => clearTimeout(t);
    }, [newUsername, usernameDialogOpen, profile?.username]);

    const handleUpdateUsername = async () => {
        const handle = newUsername.trim().toLowerCase();
        if (usernameCheck.state !== "available") {
            setUsernameMsg({
                text: usernameCheck.reason || "Pick an available username.",
                type: "error",
            });
            return;
        }
        setUsernameLoading(true);
        setUsernameMsg(null);
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username: handle, confirm: true }),
            });
            if (!res.ok) {
                const data: any = await res.json();
                throw new Error(data.error || "Failed to update username");
            }
            setUsernameMsg({ text: "Username updated!", type: "success" });
            setUsernameDialogOpen(false);
            setNewUsername("");
            fetchProfile();
        } catch (err: any) {
            setUsernameMsg({ text: err.message, type: "error" });
        } finally {
            setUsernameLoading(false);
        }
    };
    // Connected services state

    const [connectedServices, setConnectedServices] = useState<
        ConnectedService[]
    >([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [expandedServices, setExpandedServices] = useState<Set<string>>(
        new Set(),
    );
    // Email verification state

    const [verifyStep, setVerifyStep] = useState<"idle" | "sent" | "verifying">(
        "idle",
    );
    const [verifyCode, setVerifyCode] = useState("");
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyMsg, setVerifyMsg] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);
    const [verifyCooldown, setVerifyCooldown] = useState(0);

    useEffect(() => {
        if (verifyCooldown > 0) {
            const t = setTimeout(
                () => setVerifyCooldown(verifyCooldown - 1),
                1000,
            );
            return () => clearTimeout(t);
        }
    }, [verifyCooldown]);

    // eslint-disable-next-line react-hooks/exhaustive-deps

    // useCallback gives stable refs so the mount effect doesn't loop when
    // eslint-react-hooks puts the fetch fns in deps.
    const fetchProfile = useCallback(async () => {
        try {
            setProfileLoading(true);
            const res = await fetch("/api/auth/me", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch profile");
            const data: UserProfile = await res.json();
            setProfile(data);
            if (data.bio) setBio(data.bio);
            if (data.country) setCountry(data.country);
            if (data.city) setCity(data.city);
            if (data.location) setLocation(data.location);
            if (data.locale) setLocale(data.locale);
            if (data.timezone) setTimezone(data.timezone);
        } catch (err) {
            setProfileError(
                err instanceof Error ? err.message : "Failed to load profile",
            );
        } finally {
            setProfileLoading(false);
        }
    }, []);

    const fetchConnectedServices = useCallback(async () => {
        try {
            setServicesLoading(true);
            const res = await fetch("/api/auth/connected-services", {
                credentials: "include",
            });
            if (res.ok) {
                const data: any = await res.json();
                const svcs = data.services || [];
                setConnectedServices(svcs);
                setExpandedServices(
                    new Set(svcs.slice(0, 3).map((s: any) => s.client_id)),
                );
            }
        } catch {
            /* silent */
        } finally {
            setServicesLoading(false);
        }
    }, []);

    const fetchNotifPrefs = useCallback(async () => {
        try {
            setNotifLoading(true);
            const res = await fetch("/api/auth/notification-preferences", {
                credentials: "include",
            });
            if (!res.ok)
                throw new Error("Failed to fetch notification preferences");
            const data: NotificationPreferences = await res.json();
            setNotifPrefs(data);
        } catch (err) {
            setNotifError(
                err instanceof Error
                    ? err.message
                    : "Failed to load notification preferences",
            );
        } finally {
            setNotifLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
        fetchNotifPrefs();
        fetchConnectedServices();
    }, [fetchProfile, fetchNotifPrefs, fetchConnectedServices]);

    const handleUpdateProfile = async () => {
        setUpdateError("");
        setUpdateSuccess("");
        setUpdateLoading(true);
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    locale,
                    timezone,
                    bio,
                    country,
                    city,
                    location,
                }),
            });
            if (!res.ok) {
                const data: any = await res.json();
                throw new Error(data.error || "Failed to update profile");
            }
            setUpdateSuccess("Profile updated successfully.");
        } catch (err) {
            setUpdateError(
                err instanceof Error ? err.message : "Failed to update profile",
            );
        } finally {
            setUpdateLoading(false);
        }
    };

    const handleSaveNotifPrefs = async () => {
        setNotifError("");
        setNotifSuccess("");
        setNotifSaveLoading(true);
        try {
            const res = await fetch("/api/auth/notification-preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(notifPrefs),
            });
            if (!res.ok) {
                const data: any = await res.json();
                throw new Error(data.error || "Failed to save preferences");
            }
            setNotifSuccess("Notification preferences saved.");
        } catch (err) {
            setNotifError(
                err instanceof Error
                    ? err.message
                    : "Failed to save preferences",
            );
        } finally {
            setNotifSaveLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteError("");
        setDeleteLoading(true);
        try {
            const res = await fetch("/api/auth/delete-account", {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to delete account";
                try {
                    const data: any = await res.json();
                    msg = data.error || msg;
                } catch {
                    /* non-JSON response */
                }
                throw new Error(msg);
            }
            router.push("/");
        } catch (err) {
            setDeleteError(
                err instanceof Error ? err.message : "Failed to delete account",
            );
            setDeleteLoading(false);
        }
    };

    const handleSendVerification = async () => {
        setVerifyLoading(true);
        setVerifyMsg(null);
        try {
            const res = await fetch("/api/auth/send-verification", {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                let msg = "Failed to send verification email";
                try {
                    const d: any = await res.json();
                    msg = d.error || msg;
                } catch {}
                throw new Error(msg);
            }
            setVerifyStep("sent");
            setVerifyCooldown(60);
            setVerifyMsg({
                text: "Verification code sent to your email",
                type: "success",
            });
        } catch (err: any) {
            setVerifyMsg({ text: err.message, type: "error" });
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (verifyCode.length !== 6) {
            setVerifyMsg({
                text: "Please enter the 6-digit code",
                type: "error",
            });
            return;
        }
        setVerifyLoading(true);
        setVerifyMsg(null);
        try {
            const res = await fetch("/api/auth/verify-email", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: verifyCode }),
            });
            if (!res.ok) {
                let msg = "Verification failed";
                try {
                    const d: any = await res.json();
                    msg = d.error || msg;
                } catch {}
                throw new Error(msg);
            }
            setVerifyMsg({
                text: "Email verified successfully!",
                type: "success",
            });
            setVerifyStep("idle");
            setVerifyCode("");
            // Refresh profile to update verified status
            fetchProfile();
        } catch (err: any) {
            setVerifyMsg({ text: err.message, type: "error" });
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleUpdateDisplayName = async () => {
        const trimmed = newDisplayName.trim();
        if (!trimmed || trimmed.length < 2) {
            setNameMsg({
                text: "Display name must be at least 2 characters.",
                type: "error",
            });
            return;
        }
        if (trimmed.length > 32) {
            setNameMsg({
                text: "Display name must be 32 characters or less.",
                type: "error",
            });
            return;
        }
        if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
            setNameMsg({
                text: "Only letters, numbers, spaces, hyphens and underscores allowed.",
                type: "error",
            });
            return;
        }
        setNameLoading(true);
        setNameMsg(null);
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ display_name: trimmed }),
            });
            if (!res.ok) {
                const data: any = await res.json();
                throw new Error(data.error || "Failed to update display name");
            }
            setNameMsg({ text: "Display name updated!", type: "success" });
            setEditingName(false);
            setNewDisplayName("");
            fetchProfile();
        } catch (err: any) {
            setNameMsg({ text: err.message, type: "error" });
        } finally {
            setNameLoading(false);
        }
    };

    const handleNotifToggle = (key: keyof NotificationPreferences) => {
        setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <Box>
            {/* Page Header */}
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, color: "var(--fg)", mb: 1 }}
                >
                    Profile
                </Typography>
                <Typography sx={{ color: "var(--fg-faint)" }}>
                    Manage your account information and preferences
                </Typography>
            </Box>
            {/* Bento Grid */}

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                    gap: 2.5,
                }}
            >
                {/* 1. Profile Info Card — left column */}
                <Box sx={cardSx}>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        <PersonIcon
                            sx={{ color: "#ff7759", fontSize: "1.2rem" }}
                        />
                        Profile Info
                    </Typography>
                    <Typography sx={sectionSubtitleSx}>
                        Your account details
                    </Typography>

                    {profileLoading ? (
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                color: "var(--fg-faint)",
                            }}
                        >
                            <CircularProgress
                                size={18}
                                sx={{ color: "#ff7759" }}
                            />
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.9rem",
                                }}
                            >
                                Loading profile...
                            </Typography>
                        </Box>
                    ) : profileError ? (
                        <Alert
                            severity="error"
                            sx={{
                                backgroundColor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                                borderColor: "rgba(239,68,68,0.3)",
                            }}
                        >
                            {profileError}
                        </Alert>
                    ) : profile ? (
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2.5,
                            }}
                        >
                            {/* Avatar + Email Row */}
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                }}
                            >
                                {profile.avatar ? (
                                    <Box
                                        component="img"
                                        src={profile.avatar}
                                        alt="Avatar"
                                        sx={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: "50%",
                                            border: "2px solid rgba(255, 119, 89,0.3)",
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: "50%",
                                            background:
                                                "linear-gradient(135deg, #ff7759 0%, #65a30d 100%)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "1.3rem",
                                            fontWeight: 700,
                                            color: "#161816",
                                        }}
                                    >
                                        {(profile.displayName || profile.email)
                                            ?.charAt(0)
                                            .toUpperCase()}
                                    </Box>
                                )}
                                <Box>
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 600,
                                            fontSize: "1rem",
                                        }}
                                    >
                                        {profile.email}
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                            mt: 0.5,
                                        }}
                                    >
                                        {profile.emailVerified ? (
                                            <Chip
                                                icon={
                                                    <VerifiedIcon
                                                        sx={{
                                                            fontSize:
                                                                "0.95rem !important",
                                                            color: "#ff7759 !important",
                                                        }}
                                                    />
                                                }
                                                label="Verified"
                                                size="small"
                                                sx={{
                                                    backgroundColor:
                                                        "rgba(255, 119, 89,0.1)",
                                                    color: "#ff7759",
                                                    border: "1px solid rgba(255, 119, 89,0.25)",
                                                    fontWeight: 500,
                                                    height: 24,
                                                }}
                                            />
                                        ) : (
                                            <Chip
                                                label="Unverified"
                                                size="small"
                                                sx={{
                                                    backgroundColor:
                                                        "rgba(245,158,11,0.1)",
                                                    color: "#f59e0b",
                                                    border: "1px solid rgba(245,158,11,0.25)",
                                                    fontWeight: 500,
                                                    height: 24,
                                                }}
                                            />
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                            {/* Username (handle) */}

                            <Box sx={{ mb: 3 }}>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Username
                                </Typography>
                                {usernameMsg && (
                                    <Alert
                                        severity={usernameMsg.type}
                                        sx={{ mb: 1.5, py: 0 }}
                                    >
                                        {usernameMsg.text}
                                    </Alert>
                                )}
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        p: 1.5,
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "10px",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 500,
                                            flex: 1,
                                        }}
                                    >
                                        @{profile.username || "—"}
                                    </Typography>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setNewUsername(
                                                profile.username || "",
                                            );
                                            setUsernameCheck({ state: "idle" });
                                            setUsernameMsg(null);
                                            setUsernameDialogOpen(true);
                                        }}
                                        startIcon={
                                            <EditIcon
                                                sx={{ fontSize: "0.9rem" }}
                                            />
                                        }
                                        sx={{
                                            color: "#ff7759",
                                            textTransform: "none",
                                            fontSize: "0.8rem",
                                            "&:hover": {
                                                backgroundColor:
                                                    "rgba(255, 119, 89,0.08)",
                                            },
                                        }}
                                    >
                                        Change
                                    </Button>
                                </Box>
                            </Box>
                            {/* Display Name */}

                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Display Name
                                </Typography>
                                {nameMsg && (
                                    <Alert
                                        severity={nameMsg.type}
                                        sx={{
                                            mb: 1.5,
                                            bgcolor:
                                                nameMsg.type === "success"
                                                    ? "rgba(255, 119, 89,0.1)"
                                                    : "rgba(239,68,68,0.1)",
                                            color:
                                                nameMsg.type === "success"
                                                    ? "#ff7759"
                                                    : "#ef4444",
                                            border: `1px solid ${nameMsg.type === "success" ? "rgba(255, 119, 89,0.3)" : "rgba(239,68,68,0.3)"}`,
                                            "& .MuiAlert-icon": {
                                                color:
                                                    nameMsg.type === "success"
                                                        ? "#ff7759"
                                                        : "#ef4444",
                                            },
                                            py: 0,
                                        }}
                                    >
                                        {nameMsg.text}
                                    </Alert>
                                )}
                                {!editingName ? (
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                            p: 1.5,
                                            background: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "10px",
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: "var(--fg)",
                                                fontWeight: 500,
                                                flex: 1,
                                            }}
                                        >
                                            {profile.displayName || (
                                                <span
                                                    style={{
                                                        color: "var(--fg-faint)",
                                                        fontStyle: "italic",
                                                    }}
                                                >
                                                    No display name set
                                                </span>
                                            )}
                                        </Typography>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                setEditingName(true);
                                                setNewDisplayName(
                                                    profile.displayName || "",
                                                );
                                                setNameMsg(null);
                                            }}
                                            startIcon={
                                                <EditIcon
                                                    sx={{ fontSize: "0.9rem" }}
                                                />
                                            }
                                            sx={{
                                                color: "#ff7759",
                                                textTransform: "none",
                                                fontSize: "0.8rem",
                                                "&:hover": {
                                                    backgroundColor:
                                                        "rgba(255, 119, 89,0.08)",
                                                },
                                            }}
                                        >
                                            Edit
                                        </Button>
                                    </Box>
                                ) : (
                                    <Box>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                gap: 1,
                                                alignItems: "center",
                                            }}
                                        >
                                            <TextField
                                                value={newDisplayName}
                                                onChange={(e) =>
                                                    setNewDisplayName(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="e.g. John, CoolDev, swift-fox"
                                                inputProps={{ maxLength: 32 }}
                                                size="small"
                                                sx={{ ...textFieldSx, flex: 1 }}
                                                disabled={nameLoading}
                                            />
                                            <Button
                                                onClick={
                                                    handleUpdateDisplayName
                                                }
                                                disabled={
                                                    nameLoading ||
                                                    !newDisplayName.trim()
                                                }
                                                sx={{
                                                    background:
                                                        "rgba(255, 119, 89,0.15)",
                                                    color: "#ff7759",
                                                    border: "1px solid rgba(255, 119, 89,0.3)",
                                                    fontWeight: 600,
                                                    textTransform: "none",
                                                    fontSize: "0.85rem",
                                                    py: 0.8,
                                                    "&:hover": {
                                                        background:
                                                            "rgba(255, 119, 89,0.25)",
                                                    },
                                                    "&:disabled": {
                                                        color: "var(--fg-faint)",
                                                    },
                                                }}
                                            >
                                                {nameLoading
                                                    ? "Saving..."
                                                    : "Save"}
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setEditingName(false);
                                                    setNameMsg(null);
                                                }}
                                                disabled={nameLoading}
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    textTransform: "none",
                                                    fontSize: "0.85rem",
                                                    py: 0.8,
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </Box>
                                        <Typography
                                            sx={{
                                                color: "var(--fg-faint)",
                                                fontSize: "0.75rem",
                                                mt: 0.8,
                                            }}
                                        >
                                            2-32 characters. You can change this
                                            up to 2 times every 2 weeks.
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                            {/* Sign-in Method */}

                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Sign-in Method
                                </Typography>
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        p: 1.5,
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "10px",
                                    }}
                                >
                                    {profile.provider === "google" && (
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                        >
                                            <path
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                fill="#4285F4"
                                            />
                                            <path
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                fill="#34A853"
                                            />
                                            <path
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                                fill="#FBBC05"
                                            />
                                            <path
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                fill="#EA4335"
                                            />
                                        </svg>
                                    )}
                                    {profile.provider === "github" && (
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="var(--fg)"
                                        >
                                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                        </svg>
                                    )}
                                    {(profile.provider === "email" ||
                                        !profile.provider) && (
                                        <PersonIcon
                                            sx={{
                                                color: "#ff7759",
                                                fontSize: "1.2rem",
                                            }}
                                        />
                                    )}
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 500,
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {profile.provider === "email" ||
                                        !profile.provider
                                            ? "Email & Password"
                                            : `${profile.provider} OAuth`}
                                    </Typography>
                                </Box>
                            </Box>
                            {/* Email Verification */}

                            {!profile.emailVerified && (
                                <Box
                                    sx={{
                                        p: 2,
                                        background: "rgba(245,158,11,0.06)",
                                        border: "1px solid rgba(245,158,11,0.2)",
                                        borderRadius: "10px",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: "#f59e0b",
                                            fontWeight: 600,
                                            fontSize: "0.9rem",
                                            mb: 1,
                                        }}
                                    >
                                        Verify your email
                                    </Typography>
                                    {verifyMsg && (
                                        <Alert
                                            severity={verifyMsg.type}
                                            sx={{
                                                mb: 1.5,
                                                bgcolor:
                                                    verifyMsg.type === "success"
                                                        ? "rgba(255, 119, 89,0.1)"
                                                        : "rgba(239,68,68,0.1)",
                                                color:
                                                    verifyMsg.type === "success"
                                                        ? "#ff7759"
                                                        : "#ef4444",
                                                border: `1px solid ${verifyMsg.type === "success" ? "rgba(255, 119, 89,0.3)" : "rgba(239,68,68,0.3)"}`,
                                                "& .MuiAlert-icon": {
                                                    color:
                                                        verifyMsg.type ===
                                                        "success"
                                                            ? "#ff7759"
                                                            : "#ef4444",
                                                },
                                                py: 0,
                                            }}
                                        >
                                            {verifyMsg.text}
                                        </Alert>
                                    )}
                                    {verifyStep === "idle" && (
                                        <Box>
                                            <Typography
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    fontSize: "0.83rem",
                                                    mb: 1.5,
                                                }}
                                            >
                                                We&apos;ll send a 6-digit
                                                verification code to{" "}
                                                {profile.email}
                                            </Typography>
                                            <Button
                                                onClick={handleSendVerification}
                                                disabled={
                                                    verifyLoading ||
                                                    verifyCooldown > 0
                                                }
                                                sx={{
                                                    background:
                                                        "rgba(245,158,11,0.15)",
                                                    color: "#f59e0b",
                                                    border: "1px solid rgba(245,158,11,0.3)",
                                                    fontWeight: 600,
                                                    textTransform: "none",
                                                    fontSize: "0.85rem",
                                                    "&:hover": {
                                                        background:
                                                            "rgba(245,158,11,0.25)",
                                                    },
                                                    "&:disabled": {
                                                        color: "var(--fg-faint)",
                                                    },
                                                }}
                                            >
                                                {verifyLoading
                                                    ? "Sending..."
                                                    : verifyCooldown > 0
                                                      ? `Resend in ${verifyCooldown}s`
                                                      : "Send Verification Code"}
                                            </Button>
                                        </Box>
                                    )}
                                    {verifyStep === "sent" && (
                                        <Box>
                                            <Typography
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    fontSize: "0.83rem",
                                                    mb: 1.5,
                                                }}
                                            >
                                                Enter the 6-digit code sent to{" "}
                                                {profile.email}
                                            </Typography>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    gap: 1,
                                                    alignItems: "center",
                                                }}
                                            >
                                                <TextField
                                                    value={verifyCode}
                                                    onChange={(e) =>
                                                        setVerifyCode(
                                                            e.target.value
                                                                .replace(
                                                                    /\D/g,
                                                                    "",
                                                                )
                                                                .slice(0, 6),
                                                        )
                                                    }
                                                    placeholder="000000"
                                                    inputProps={{
                                                        maxLength: 6,
                                                        style: {
                                                            letterSpacing:
                                                                "6px",
                                                            fontFamily:
                                                                "monospace",
                                                            fontSize: "1.1rem",
                                                            textAlign: "center",
                                                        },
                                                    }}
                                                    sx={{
                                                        ...textFieldSx,
                                                        width: "160px",
                                                        "& .MuiOutlinedInput-root":
                                                            {
                                                                ...textFieldSx[
                                                                    "& .MuiOutlinedInput-root"
                                                                ],
                                                                "&.Mui-focused fieldset":
                                                                    {
                                                                        borderColor:
                                                                            "#f59e0b",
                                                                    },
                                                            },
                                                    }}
                                                    disabled={verifyLoading}
                                                />
                                                <Button
                                                    onClick={handleVerifyCode}
                                                    disabled={
                                                        verifyLoading ||
                                                        verifyCode.length !== 6
                                                    }
                                                    sx={{
                                                        background:
                                                            "rgba(255, 119, 89,0.15)",
                                                        color: "#ff7759",
                                                        border: "1px solid rgba(255, 119, 89,0.3)",
                                                        fontWeight: 600,
                                                        textTransform: "none",
                                                        fontSize: "0.85rem",
                                                        py: 1,
                                                        "&:hover": {
                                                            background:
                                                                "rgba(255, 119, 89,0.25)",
                                                        },
                                                        "&:disabled": {
                                                            color: "var(--fg-faint)",
                                                        },
                                                    }}
                                                >
                                                    {verifyLoading
                                                        ? "Verifying..."
                                                        : "Verify"}
                                                </Button>
                                            </Box>
                                            <Button
                                                onClick={handleSendVerification}
                                                disabled={
                                                    verifyLoading ||
                                                    verifyCooldown > 0
                                                }
                                                sx={{
                                                    mt: 1,
                                                    color: "var(--fg-faint)",
                                                    textTransform: "none",
                                                    fontSize: "0.8rem",
                                                    "&:hover": {
                                                        color: "#f59e0b",
                                                    },
                                                }}
                                            >
                                                {verifyCooldown > 0
                                                    ? `Resend in ${verifyCooldown}s`
                                                    : "Resend code"}
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            )}
                            {/* Account ID */}

                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Account ID
                                </Typography>
                                <Typography
                                    sx={{
                                        fontFamily: "monospace",
                                        fontSize: "0.88rem",
                                        color: "var(--fg-muted)",
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        px: 2,
                                        py: 1,
                                        display: "inline-block",
                                        letterSpacing: "0.03em",
                                    }}
                                >
                                    {profile.id}
                                </Typography>
                            </Box>
                            {/* Badges */}

                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    Account Badges
                                </Typography>
                                <Box
                                    sx={{
                                        display: "flex",
                                        gap: 1,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Chip
                                        label={profile.provider || "email"}
                                        size="small"
                                        sx={{
                                            backgroundColor:
                                                "rgba(99,102,241,0.15)",
                                            color: "#a5b4fc",
                                            border: "1px solid rgba(99,102,241,0.3)",
                                            fontWeight: 500,
                                            textTransform: "capitalize",
                                        }}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    ) : null}
                </Box>
                {/* Connected Services — right column */}

                <Box
                    sx={{
                        ...cardSx,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            mb: 1.5,
                            flexShrink: 0,
                        }}
                    >
                        <Box>
                            <Typography variant="h6" sx={sectionTitleSx}>
                                <DevicesOtherIcon
                                    sx={{
                                        color: "#ff7759",
                                        fontSize: "1.2rem",
                                    }}
                                />
                                Connected Services
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.78rem",
                                    mt: 0.25,
                                }}
                            >
                                Apps you&apos;ve signed in to with Elixpo
                            </Typography>
                        </Box>
                        {connectedServices.length > 0 && (
                            <Button
                                component={Link}
                                href="/dashboard/services"
                                size="small"
                                endIcon={
                                    <ArrowForwardIcon
                                        sx={{ fontSize: "0.8rem !important" }}
                                    />
                                }
                                sx={{
                                    color: "#ff7759",
                                    textTransform: "none",
                                    fontSize: "0.78rem",
                                    flexShrink: 0,
                                    "&:hover": {
                                        bgcolor: "rgba(255, 119, 89,0.08)",
                                    },
                                }}
                            >
                                View all
                            </Button>
                        )}
                    </Box>

                    {servicesLoading ? (
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                py: 3,
                            }}
                        >
                            <CircularProgress
                                size={20}
                                sx={{ color: "#ff7759" }}
                            />
                        </Box>
                    ) : connectedServices.length === 0 ? (
                        <Box sx={{ py: 4, textAlign: "center" }}>
                            <DevicesOtherIcon
                                sx={{
                                    fontSize: "2rem",
                                    color: "var(--fg-faint)",
                                    mb: 1,
                                }}
                            />
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.85rem",
                                }}
                            >
                                No connected services yet
                            </Typography>
                        </Box>
                    ) : (
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.75,
                                overflowY: "auto",
                                flex: 1,
                                "&::-webkit-scrollbar": { width: 4 },
                                "&::-webkit-scrollbar-thumb": {
                                    bgcolor: "var(--border)",
                                    borderRadius: 2,
                                },
                            }}
                        >
                            {connectedServices.slice(0, 3).map((svc) => {
                                const isExpanded = expandedServices.has(
                                    svc.client_id,
                                );
                                return (
                                    <Box
                                        key={svc.client_id}
                                        sx={{
                                            borderRadius: "10px",
                                            bgcolor: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            overflow: "hidden",
                                            transition: "border-color 0.2s",
                                            "&:hover": {
                                                borderColor:
                                                    "rgba(255, 119, 89,0.15)",
                                            },
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Box
                                            onClick={() =>
                                                setExpandedServices((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(svc.client_id))
                                                        next.delete(
                                                            svc.client_id,
                                                        );
                                                    else
                                                        next.add(svc.client_id);
                                                    return next;
                                                })
                                            }
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1.25,
                                                p: 1.25,
                                                cursor: "pointer",
                                                userSelect: "none",
                                            }}
                                        >
                                            <ServiceIconSmall svc={svc} />
                                            <Box
                                                sx={{
                                                    flexGrow: 1,
                                                    minWidth: 0,
                                                }}
                                            >
                                                <Typography
                                                    sx={{
                                                        color: "var(--fg-muted)",
                                                        fontWeight: 600,
                                                        fontSize: "0.82rem",
                                                        overflow: "hidden",
                                                        textOverflow:
                                                            "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {svc.name}
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        color: "var(--fg-faint)",
                                                        fontSize: "0.7rem",
                                                        overflow: "hidden",
                                                        textOverflow:
                                                            "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {svc.description ||
                                                        (svc.homepage_url
                                                            ? (() => {
                                                                  try {
                                                                      return new URL(
                                                                          svc.homepage_url,
                                                                      )
                                                                          .hostname;
                                                                  } catch {
                                                                      return "";
                                                                  }
                                                              })()
                                                            : "Connected service")}
                                                </Typography>
                                            </Box>
                                            <ExpandMoreIcon
                                                sx={{
                                                    fontSize: "1rem",
                                                    color: "var(--fg-faint)",
                                                    transform: isExpanded
                                                        ? "rotate(180deg)"
                                                        : "rotate(0)",
                                                    transition:
                                                        "transform 0.2s",
                                                    flexShrink: 0,
                                                }}
                                            />
                                        </Box>

                                        {isExpanded && (
                                            <Box
                                                sx={{
                                                    px: 1.25,
                                                    pb: 1.25,
                                                    pt: 0.5,
                                                    borderTop:
                                                        "1px solid var(--border)",
                                                }}
                                            >
                                                {svc.description && (
                                                    <Typography
                                                        sx={{
                                                            color: "var(--fg-faint)",
                                                            fontSize: "0.75rem",
                                                            lineHeight: 1.5,
                                                            mb: 0.75,
                                                        }}
                                                    >
                                                        {svc.description}
                                                    </Typography>
                                                )}
                                                {svc.homepage_url && (
                                                    <Typography
                                                        component="a"
                                                        href={svc.homepage_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        sx={{
                                                            color: "#ff7759",
                                                            fontSize: "0.7rem",
                                                            fontFamily:
                                                                "monospace",
                                                            textDecoration:
                                                                "none",
                                                            display: "block",
                                                            mb: 0.5,
                                                            opacity: 0.7,
                                                            "&:hover": {
                                                                opacity: 1,
                                                            },
                                                        }}
                                                    >
                                                        {svc.homepage_url}
                                                    </Typography>
                                                )}
                                                <Typography
                                                    sx={{
                                                        color: "var(--fg-faint)",
                                                        fontSize: "0.68rem",
                                                    }}
                                                >
                                                    Connected{" "}
                                                    {new Date(
                                                        svc.first_authorized,
                                                    ).toLocaleDateString()}{" "}
                                                    · Last used{" "}
                                                    {new Date(
                                                        svc.last_authorized,
                                                    ).toLocaleDateString()}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                            {connectedServices.length > 3 && (
                                <Button
                                    component={Link}
                                    href="/dashboard/services"
                                    size="small"
                                    sx={{
                                        color: "var(--fg-faint)",
                                        textTransform: "none",
                                        fontSize: "0.75rem",
                                        mt: 0.25,
                                        flexShrink: 0,
                                        "&:hover": { color: "#ff7759" },
                                    }}
                                >
                                    +{connectedServices.length - 3} more — view
                                    all services
                                </Button>
                            )}
                        </Box>
                    )}
                </Box>
                {/* 2. Update Profile Card */}

                <Box sx={cardSx}>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        <EditIcon
                            sx={{ color: "#ff7759", fontSize: "1.2rem" }}
                        />
                        Update Profile
                    </Typography>
                    <Typography sx={sectionSubtitleSx}>
                        Personal info and preferences
                    </Typography>

                    {updateSuccess && (
                        <Alert
                            severity="success"
                            sx={{
                                mb: 2.5,
                                backgroundColor: "rgba(255, 119, 89,0.1)",
                                color: "#ff7759",
                                borderColor: "rgba(255, 119, 89,0.3)",
                            }}
                        >
                            {updateSuccess}
                        </Alert>
                    )}
                    {updateError && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 2.5,
                                backgroundColor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                                borderColor: "rgba(239,68,68,0.3)",
                            }}
                        >
                            {updateError}
                        </Alert>
                    )}

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                        }}
                    >
                        <TextField
                            fullWidth
                            label="Bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself"
                            multiline
                            rows={2}
                            inputProps={{ maxLength: 256 }}
                            helperText={`${bio.length}/256`}
                            sx={{
                                ...textFieldSx,
                                "& .MuiFormHelperText-root": {
                                    color: "var(--fg-faint)",
                                    textAlign: "right",
                                },
                            }}
                            disabled={updateLoading}
                        />
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "1fr 1fr",
                                },
                                gap: 2,
                            }}
                        >
                            <TextField
                                fullWidth
                                label="Country"
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                placeholder="India"
                                sx={{
                                    ...textFieldSx,
                                    "& .MuiFormHelperText-root": {
                                        color: "var(--fg-faint)",
                                    },
                                }}
                                disabled={updateLoading}
                            />
                            <TextField
                                fullWidth
                                label="City"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Bangalore"
                                sx={{
                                    ...textFieldSx,
                                    "& .MuiFormHelperText-root": {
                                        color: "var(--fg-faint)",
                                    },
                                }}
                                disabled={updateLoading}
                            />
                        </Box>
                        <TextField
                            fullWidth
                            label="Location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. San Francisco, CA"
                            helperText="Free-form location text"
                            sx={{
                                ...textFieldSx,
                                "& .MuiFormHelperText-root": {
                                    color: "var(--fg-faint)",
                                },
                            }}
                            disabled={updateLoading}
                        />
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "1fr 1fr",
                                },
                                gap: 2,
                            }}
                        >
                            <TextField
                                fullWidth
                                label="Locale"
                                value={locale}
                                onChange={(e) => setLocale(e.target.value)}
                                placeholder="en"
                                helperText="e.g. en, fr, de"
                                sx={{
                                    ...textFieldSx,
                                    "& .MuiFormHelperText-root": {
                                        color: "var(--fg-faint)",
                                    },
                                }}
                                disabled={updateLoading}
                            />
                            <TextField
                                fullWidth
                                label="Timezone"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                placeholder="UTC"
                                helperText="e.g. Asia/Kolkata, America/New_York"
                                sx={{
                                    ...textFieldSx,
                                    "& .MuiFormHelperText-root": {
                                        color: "var(--fg-faint)",
                                    },
                                }}
                                disabled={updateLoading}
                            />
                        </Box>
                    </Box>

                    <Box sx={{ mt: 3 }}>
                        <Button
                            variant="contained"
                            onClick={handleUpdateProfile}
                            disabled={updateLoading}
                            sx={{
                                background: "rgba(255, 119, 89,0.15)",
                                color: "#ff7759",
                                border: "1px solid rgba(255, 119, 89,0.3)",
                                fontWeight: 600,
                                textTransform: "none",
                                fontSize: "0.95rem",
                                py: 1.1,
                                px: 3,
                                "&:hover": {
                                    background: "rgba(255, 119, 89,0.25)",
                                    borderColor: "rgba(255, 119, 89,0.5)",
                                },
                                "&:disabled": {
                                    color: "var(--fg-faint)",
                                },
                            }}
                        >
                            {updateLoading ? (
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                    }}
                                >
                                    <CircularProgress
                                        size={16}
                                        sx={{ color: "#ff7759" }}
                                    />
                                    Saving...
                                </Box>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </Box>
                </Box>
                {/* 3. Notification Preferences Card */}

                <Box sx={cardSx}>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        <NotificationsIcon
                            sx={{ color: "#ff7759", fontSize: "1.2rem" }}
                        />
                        Notification Preferences
                    </Typography>
                    <Typography sx={sectionSubtitleSx}>
                        Control which email notifications you receive
                    </Typography>

                    {notifSuccess && (
                        <Alert
                            severity="success"
                            sx={{
                                mb: 2.5,
                                backgroundColor: "rgba(255, 119, 89,0.1)",
                                color: "#ff7759",
                                borderColor: "rgba(255, 119, 89,0.3)",
                            }}
                        >
                            {notifSuccess}
                        </Alert>
                    )}
                    {notifError && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 2.5,
                                backgroundColor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                                borderColor: "rgba(239,68,68,0.3)",
                            }}
                        >
                            {notifError}
                        </Alert>
                    )}

                    {notifLoading ? (
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                            }}
                        >
                            <CircularProgress
                                size={18}
                                sx={{ color: "#ff7759" }}
                            />
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.9rem",
                                }}
                            >
                                Loading preferences...
                            </Typography>
                        </Box>
                    ) : (
                        <FormGroup sx={{ gap: 0.5 }}>
                            {[
                                {
                                    key: "email_login_alerts" as const,
                                    label: "Login Alerts",
                                    description:
                                        "Email me when a new login is detected",
                                },
                                {
                                    key: "email_app_activity" as const,
                                    label: "App Activity",
                                    description: "Email me on OAuth app usage",
                                },
                                {
                                    key: "email_weekly_digest" as const,
                                    label: "Weekly Digest",
                                    description:
                                        "Receive weekly activity summary",
                                },
                                {
                                    key: "email_security_alerts" as const,
                                    label: "Security Alerts",
                                    description: "Email on suspicious activity",
                                },
                            ].map(({ key, label, description }) => (
                                <Box
                                    key={key}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        py: 1.5,
                                        borderBottom: "1px solid var(--border)",
                                        "&:last-child": {
                                            borderBottom: "none",
                                        },
                                    }}
                                >
                                    <Box>
                                        <Typography
                                            sx={{
                                                color: "var(--fg)",
                                                fontWeight: 500,
                                                fontSize: "0.95rem",
                                            }}
                                        >
                                            {label}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: "var(--fg-faint)",
                                                fontSize: "0.83rem",
                                                mt: 0.2,
                                            }}
                                        >
                                            {description}
                                        </Typography>
                                    </Box>
                                    <Switch
                                        checked={notifPrefs[key]}
                                        onChange={() => handleNotifToggle(key)}
                                        sx={switchSx}
                                        disabled={notifSaveLoading}
                                    />
                                </Box>
                            ))}
                        </FormGroup>
                    )}

                    {!notifLoading && (
                        <Box sx={{ mt: 3 }}>
                            <Button
                                variant="contained"
                                onClick={handleSaveNotifPrefs}
                                disabled={notifSaveLoading}
                                sx={{
                                    background: "rgba(255, 119, 89,0.15)",
                                    color: "#ff7759",
                                    border: "1px solid rgba(255, 119, 89,0.3)",
                                    fontWeight: 600,
                                    textTransform: "none",
                                    fontSize: "0.95rem",
                                    py: 1.1,
                                    px: 3,
                                    "&:hover": {
                                        background: "rgba(255, 119, 89,0.25)",
                                        borderColor: "rgba(255, 119, 89,0.5)",
                                    },
                                    "&:disabled": {
                                        color: "var(--fg-faint)",
                                    },
                                }}
                            >
                                {notifSaveLoading ? (
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                        }}
                                    >
                                        <CircularProgress
                                            size={16}
                                            sx={{ color: "#ff7759" }}
                                        />
                                        Saving...
                                    </Box>
                                ) : (
                                    "Save Preferences"
                                )}
                            </Button>
                        </Box>
                    )}
                </Box>
                {/* 4. Danger Zone — full width */}

                <Box
                    sx={{
                        ...cardSx,
                        gridColumn: { lg: "1 / -1" },
                        border: "1px solid rgba(239,68,68,0.35)",
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{ ...sectionTitleSx, color: "#f87171" }}
                    >
                        <WarningAmberIcon
                            sx={{ color: "#ef4444", fontSize: "1.2rem" }}
                        />
                        Danger Zone
                    </Typography>
                    <Typography sx={{ ...sectionSubtitleSx, mb: 2.5 }}>
                        Irreversible actions — proceed with caution
                    </Typography>

                    {deleteError && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 2.5,
                                backgroundColor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                                borderColor: "rgba(239,68,68,0.3)",
                            }}
                        >
                            {deleteError}
                        </Alert>
                    )}

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: { xs: "column", md: "row" },
                            gap: 2,
                        }}
                    >
                        {/* Disable Account */}
                        <Box
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 2,
                                p: 2,
                                borderRadius: "10px",
                                background: "rgba(245,158,11,0.04)",
                                border: "1px solid rgba(245,158,11,0.15)",
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg)",
                                        fontWeight: 600,
                                        fontSize: "0.95rem",
                                    }}
                                >
                                    Disable Account
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.83rem",
                                        mt: 0.2,
                                    }}
                                >
                                    Temporarily deactivate your account
                                </Typography>
                            </Box>
                            <Button
                                variant="outlined"
                                startIcon={<BlockIcon />}
                                sx={{
                                    color: "#f59e0b",
                                    borderColor: "rgba(245,158,11,0.4)",
                                    fontWeight: 600,
                                    textTransform: "none",
                                    fontSize: "0.85rem",
                                    "&:hover": {
                                        borderColor: "#f59e0b",
                                        backgroundColor:
                                            "rgba(245,158,11,0.08)",
                                    },
                                }}
                            >
                                Disable
                            </Button>
                        </Box>
                        {/* Delete Account */}

                        <Box
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 2,
                                p: 2,
                                borderRadius: "10px",
                                background: "rgba(239,68,68,0.04)",
                                border: "1px solid rgba(239,68,68,0.15)",
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg)",
                                        fontWeight: 600,
                                        fontSize: "0.95rem",
                                    }}
                                >
                                    Delete Account
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.83rem",
                                        mt: 0.2,
                                    }}
                                >
                                    Permanently remove your account and data
                                </Typography>
                            </Box>
                            <Button
                                variant="outlined"
                                onClick={() => setDeleteDialogOpen(true)}
                                sx={{
                                    color: "#ef4444",
                                    borderColor: "rgba(239,68,68,0.4)",
                                    fontWeight: 600,
                                    textTransform: "none",
                                    fontSize: "0.85rem",
                                    "&:hover": {
                                        borderColor: "#ef4444",
                                        backgroundColor: "rgba(239,68,68,0.08)",
                                    },
                                }}
                            >
                                Delete
                            </Button>
                        </Box>
                    </Box>
                </Box>
            </Box>
            {/* Username Change (destructive) Dialog */}

            <Dialog
                open={usernameDialogOpen}
                onClose={() => !usernameLoading && setUsernameDialogOpen(false)}
                PaperProps={{
                    sx: {
                        background: "rgba(255,255,255,0.95)",
                        backdropFilter: "blur(16px)",
                        border: "1px solid var(--border)",
                        borderRadius: "14px",
                        width: "100%",
                        maxWidth: 420,
                    },
                }}
            >
                <DialogTitle sx={{ color: "var(--fg)", fontWeight: 700 }}>
                    Change username
                </DialogTitle>
                <DialogContent>
                    <Alert
                        severity="warning"
                        sx={{
                            mb: 2,
                            bgcolor: "rgba(245,158,11,0.1)",
                            color: "#f59e0b",
                        }}
                    >
                        This is destructive. Any link pointing to @
                        {profile?.username} on other Elixpo services (profiles,
                        shared blogs) will break. Your account and data stay the
                        same.
                    </Alert>
                    <TextField
                        fullWidth
                        autoFocus
                        label="New username"
                        value={newUsername}
                        onChange={(e) =>
                            setNewUsername(
                                e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_-]/g, ""),
                            )
                        }
                        inputProps={{ maxLength: 32 }}
                        disabled={usernameLoading}
                        helperText={
                            usernameCheck.state === "checking"
                                ? "Checking availability…"
                                : usernameCheck.state === "available"
                                  ? "✓ Available"
                                  : usernameCheck.state === "taken"
                                    ? `✗ ${usernameCheck.reason || "Taken"}`
                                    : "3–32 chars. Lowercase letters, numbers, - and _."
                        }
                        FormHelperTextProps={{
                            sx: {
                                color:
                                    usernameCheck.state === "available"
                                        ? "#4ade80"
                                        : usernameCheck.state === "taken"
                                          ? "#f87171"
                                          : "var(--fg-faint)",
                            },
                        }}
                        sx={textFieldSx}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button
                        onClick={() => setUsernameDialogOpen(false)}
                        disabled={usernameLoading}
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdateUsername}
                        disabled={
                            usernameLoading ||
                            usernameCheck.state !== "available"
                        }
                        variant="contained"
                        sx={{
                            background: "#ff7759",
                            color: "#fff",
                            textTransform: "none",
                            fontWeight: 600,
                            "&:hover": { background: "#ff7759" },
                            "&:disabled": {
                                background: "var(--border)",
                                color: "var(--fg-faint)",
                            },
                        }}
                    >
                        {usernameLoading ? "Changing…" : "Change username"}
                    </Button>
                </DialogActions>
            </Dialog>
            {/* Delete Account Confirmation Dialog */}

            <Dialog
                open={deleteDialogOpen}
                onClose={() => !deleteLoading && setDeleteDialogOpen(false)}
                PaperProps={{
                    sx: {
                        backdropFilter: "blur(20px)",
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: "16px",
                        minWidth: "360px",
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        color: "#f87171",
                        fontWeight: 700,
                        borderBottom: "1px solid rgba(239,68,68,0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <WarningAmberIcon sx={{ color: "#ef4444" }} />
                    Delete Account
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Typography
                        sx={{ color: "var(--fg)", mb: 1.5, fontWeight: 500 }}
                    >
                        Are you sure?
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.92rem",
                            lineHeight: 1.6,
                        }}
                    >
                        This action is{" "}
                        <strong style={{ color: "#f87171" }}>permanent</strong>{" "}
                        and cannot be undone. All your data, including OAuth
                        applications and account settings, will be permanently
                        deleted.
                    </Typography>
                    {deleteError && (
                        <Alert
                            severity="error"
                            sx={{
                                mt: 2,
                                backgroundColor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                                borderColor: "rgba(239,68,68,0.3)",
                            }}
                        >
                            {deleteError}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid rgba(239,68,68,0.15)",
                        p: 2,
                        gap: 1,
                    }}
                >
                    <Button
                        onClick={() => setDeleteDialogOpen(false)}
                        disabled={deleteLoading}
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                            fontWeight: 500,
                            "&:hover": {
                                backgroundColor: "var(--overlay)",
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading}
                        variant="contained"
                        sx={{
                            background: "rgba(239,68,68,0.2)",
                            color: "#ef4444",
                            border: "1px solid rgba(239,68,68,0.4)",
                            fontWeight: 700,
                            textTransform: "none",
                            fontSize: "0.9rem",
                            "&:hover": {
                                background: "rgba(239,68,68,0.3)",
                                borderColor: "#ef4444",
                            },
                            "&:disabled": { color: "var(--fg-faint)" },
                        }}
                    >
                        {deleteLoading ? (
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <CircularProgress
                                    size={15}
                                    sx={{ color: "#ef4444" }}
                                />
                                Deleting...
                            </Box>
                        ) : (
                            "Delete Account"
                        )}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ProfilePage;
