"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { useCallback, useEffect, useState } from "react";

import { GlassCard } from "./glass-card";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface WorkspaceConsoleProps {
    /** the slug from the URL */
    slug: string;
    /** the active session tenantId at page load */
    initialTenantId: string;
}

interface Member {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
    role: string;
    status: string;
    created_at: string;
}

interface InviteLink {
    id: string;
    role: string;
    token: string;
    url: string;
    created_at: string;
}

interface WorkspaceInfo {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    logoUrl: string | null;
}

interface WorkspaceResponse {
    role: string;
    workspace: WorkspaceInfo;
    members: Member[];
    invite: InviteLink | null;
}

interface MeWorkspace {
    tenantId: string;
    name: string;
    slug: string;
    role: string;
    active: boolean;
}

type AssignableRole = "admin" | "writer" | "viewer";

interface Msg {
    type: "ok" | "err";
    text: string;
}

/* ------------------------------------------------------------------ */
/* Styling constants                                                   */
/* ------------------------------------------------------------------ */

const TEXT = "var(--fg)";
const MUTED = "var(--fg-muted)";
const BORDER = "var(--border)";
const ACCENT = "var(--accent)";
const ACCENT_GRADIENT = "var(--accent-gradient)";
const ACCENT_GRADIENT_HOVER = "var(--accent-gradient-hover)";

const fieldSx = {
    "& .MuiOutlinedInput-root": {
        color: TEXT,
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.95rem", py: 1.1 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
    "& .MuiInputLabel-root": { color: MUTED },
    "& .MuiInputLabel-root.Mui-focused": { color: ACCENT },
    "& textarea": { color: TEXT },
} as const;

const selectSx = {
    color: TEXT,
    borderRadius: "10px",
    background: "var(--field-bg)",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSvgIcon-root": { color: MUTED },
} as const;

const selectMenuProps = {
    PaperProps: {
        sx: {
            background: "var(--menu-surface)",
            color: TEXT,
            border: `1px solid ${BORDER}`,
            "& .MuiMenuItem-root:hover": { background: "var(--accent-tint)" },
            "& .MuiMenuItem-root.Mui-selected": { background: "var(--accent-tint-strong)" },
        },
    },
} as const;

const gradientButtonSx = {
    textTransform: "none",
    fontWeight: 700,
    fontSize: "0.88rem",
    color: "var(--accent-contrast)",
    px: 2.4,
    py: 1.05,
    borderRadius: "10px",
    background: ACCENT_GRADIENT,
    boxShadow: "var(--accent-shadow)",
    "&:hover": { background: ACCENT_GRADIENT_HOVER },
    "&.Mui-disabled": {
        background: "var(--overlay)",
        color: "var(--fg-faint)",
        boxShadow: "none",
    },
} as const;

const ghostButtonSx = {
    textTransform: "none",
    fontWeight: 600,
    fontSize: "0.82rem",
    color: TEXT,
    px: 1.6,
    py: 0.7,
    borderRadius: "8px",
    border: "1px solid var(--field-border)",
    background: "var(--field-bg)",
    "&:hover": { background: "var(--overlay)", borderColor: "var(--accent-border)" },
} as const;

const sectionTitleSx = {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: TEXT,
    letterSpacing: "-0.01em",
} as const;

const ASSIGNABLE_ROLES: AssignableRole[] = ["admin", "writer", "viewer"];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function roleChipColor(role: string): string {
    switch (role) {
        case "owner":
            return "#fbbf24";
        case "admin":
            return ACCENT;
        case "writer":
            return "var(--success)";
        default:
            return MUTED;
    }
}

function initialOf(member: Member): string {
    const base = member.name?.trim() || member.email?.trim() || "?";
    return base.charAt(0).toUpperCase();
}

function MessageLine({ msg, sx }: { msg: Msg; sx?: object }) {
    return (
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1.2, ...sx }}>
            {msg.type === "ok" ? (
                <CheckCircleIcon sx={{ fontSize: 16, color: "var(--success)" }} />
            ) : (
                <ErrorOutlineIcon sx={{ fontSize: 16, color: "var(--danger)" }} />
            )}
            <Typography
                sx={{
                    fontSize: "0.82rem",
                    color: msg.type === "ok" ? "var(--success)" : "var(--danger)",
                }}
            >
                {msg.text}
            </Typography>
        </Stack>
    );
}

/** Map a known API error code to a friendly message. */
function friendlyApiError(
    data: { error?: string; message?: string } | null,
    fallback: string,
): string {
    const code = data?.error;
    if (code === "last_admin") return "Can't remove the last admin.";
    if (code === "owner_immutable") return "The owner can't be changed.";
    return data?.message || data?.error || fallback;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function WorkspaceConsole(props: WorkspaceConsoleProps) {
    const { slug } = props;

    const [loading, setLoading] = useState(true);
    const [noAccess, setNoAccess] = useState(false);
    const [data, setData] = useState<WorkspaceResponse | null>(null);
    const [myWorkspaces, setMyWorkspaces] = useState<MeWorkspace[]>([]);

    const role = data?.role ?? "viewer";
    const isAdmin = role === "owner" || role === "admin";

    /* ---- fetch workspace payload (re-usable after mutations) ---- */
    const fetchWorkspace = useCallback(async (): Promise<WorkspaceResponse | null> => {
        const res = await fetch("/api/workspace", { headers: { Accept: "application/json" } });
        const json = (await res.json().catch(() => null)) as WorkspaceResponse | null;
        if (!res.ok || !json) return null;
        return json;
    }, []);

    const refresh = useCallback(async () => {
        const next = await fetchWorkspace();
        if (next) setData(next);
    }, [fetchWorkspace]);

    /* ---- mount: resolve active workspace, then load ---- */
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const meRes = await fetch("/api/auth/me", {
                    headers: { Accept: "application/json" },
                });
                const me = (await meRes.json().catch(() => null)) as {
                    workspaces?: MeWorkspace[];
                } | null;
                const workspaces = me?.workspaces ?? [];
                if (!cancelled) setMyWorkspaces(workspaces);
                const found = workspaces.find((w) => w.slug === slug);

                if (!found) {
                    if (!cancelled) {
                        setNoAccess(true);
                        setLoading(false);
                    }
                    return;
                }

                if (!found.active) {
                    await fetch("/api/workspace/switch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tenantId: found.tenantId }),
                    });
                }

                const ws = await fetchWorkspace();
                if (!cancelled) {
                    if (ws) {
                        setData(ws);
                    } else {
                        setNoAccess(true);
                    }
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setNoAccess(true);
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [slug, fetchWorkspace]);

    /* ---------------------------------------------------------------- */
    /* Loading / no-access states                                        */
    /* ---------------------------------------------------------------- */

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 10 }}>
                <CircularProgress size={32} sx={{ color: ACCENT }} />
            </Box>
        );
    }

    if (noAccess || !data) {
        return (
            <GlassCard sx={{ textAlign: "center", py: 6 }}>
                <Typography sx={{ ...sectionTitleSx, mb: 1 }}>
                    You don&apos;t have access to this workspace
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: "0.9rem", mb: 3 }}>
                    Ask an admin for an invite, or head back to your dashboard.
                </Typography>
                <Button href="/dashboard" sx={gradientButtonSx}>
                    Go to dashboard
                </Button>
            </GlassCard>
        );
    }

    const visibleMembers = data.members.filter((m) => m.status !== "removed");

    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(12, 1fr)" },
                gap: 2.5,
                alignItems: "start",
            }}
        >
            {/* Header — full width */}
            <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                <HeaderCard workspace={data.workspace} role={role} isAdmin={isAdmin} />
            </Box>

            {/* Left: workspace identity */}
            <Box sx={{ gridColumn: { md: "span 7" } }}>
                <CosmeticsCard
                    workspace={data.workspace}
                    isAdmin={isAdmin}
                    onUpdated={(next) =>
                        setData((prev) => (prev ? { ...prev, workspace: next } : prev))
                    }
                />
            </Box>

            {/* Right column: invite link (admin) + your workspaces */}
            <Box
                sx={{
                    gridColumn: { md: "span 5" },
                    display: "flex",
                    flexDirection: "column",
                    gap: 2.5,
                }}
            >
                {isAdmin && <InviteLinkCard invite={data.invite} onRefresh={refresh} />}
                <YourWorkspacesCard workspaces={myWorkspaces} currentSlug={slug} />
            </Box>

            {/* Members — full width */}
            <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                <MembersCard members={visibleMembers} isAdmin={isAdmin} onRefresh={refresh} />
            </Box>
        </Box>
    );
}

/* ================================================================== */
/* Your workspaces — every workspace the user belongs to              */
/* ================================================================== */

function YourWorkspacesCard({
    workspaces,
    currentSlug,
}: {
    workspaces: MeWorkspace[];
    currentSlug: string;
}) {
    const [switchingTo, setSwitchingTo] = useState<string | null>(null);

    async function openDashboard(w: MeWorkspace) {
        if (switchingTo) return;
        // Already the active workspace → straight to the dashboard.
        if (w.active) {
            window.location.href = "/dashboard";
            return;
        }
        setSwitchingTo(w.tenantId);
        try {
            await fetch("/api/workspace/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: w.tenantId }),
            });
            window.location.href = "/dashboard";
        } catch {
            setSwitchingTo(null);
        }
    }

    return (
        <GlassCard>
            <Typography sx={{ ...sectionTitleSx, mb: 0.4 }}>Your workspaces</Typography>
            <Typography sx={{ color: MUTED, fontSize: "0.85rem", mb: 2 }}>
                Every workspace you&apos;ve joined, with your role in each.
            </Typography>

            <Stack divider={<Box sx={{ borderBottom: `1px solid ${BORDER}` }} />}>
                {workspaces.map((w) => {
                    const busy = switchingTo === w.tenantId;
                    return (
                        <Stack
                            key={w.tenantId}
                            direction="row"
                            spacing={1.2}
                            alignItems="center"
                            sx={{ py: 1.4 }}
                        >
                            <Avatar
                                sx={{
                                    width: 34,
                                    height: 34,
                                    bgcolor: "var(--accent-tint-strong)",
                                    color: ACCENT,
                                    fontWeight: 700,
                                    fontSize: "0.85rem",
                                }}
                            >
                                {w.name.charAt(0).toUpperCase()}
                            </Avatar>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={0.8} alignItems="center">
                                    <Typography
                                        sx={{
                                            color: TEXT,
                                            fontWeight: 600,
                                            fontSize: "0.92rem",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {w.name}
                                    </Typography>
                                    {w.active && (
                                        <Chip
                                            label="Active"
                                            size="small"
                                            sx={{
                                                height: 18,
                                                fontSize: "0.62rem",
                                                fontWeight: 700,
                                                color: "var(--success)",
                                                background: "rgba(110,231,183,0.12)",
                                                border: "1px solid rgba(110,231,183,0.25)",
                                            }}
                                        />
                                    )}
                                </Stack>
                                <Typography
                                    sx={{
                                        color: roleChipColor(w.role),
                                        fontSize: "0.74rem",
                                        textTransform: "capitalize",
                                    }}
                                >
                                    {w.role}
                                </Typography>
                            </Box>

                            <Stack direction="row" spacing={0.8} alignItems="center">
                                {w.slug !== currentSlug && (
                                    <Button href={`/workspace/${w.slug}`} sx={ghostButtonSx}>
                                        Manage
                                    </Button>
                                )}
                                <Button
                                    onClick={() => openDashboard(w)}
                                    disabled={busy}
                                    sx={{
                                        ...gradientButtonSx,
                                        px: 1.8,
                                        py: 0.6,
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    {busy ? (
                                        <CircularProgress
                                            size={15}
                                            sx={{ color: "var(--accent-contrast)" }}
                                        />
                                    ) : (
                                        "Dashboard"
                                    )}
                                </Button>
                            </Stack>
                        </Stack>
                    );
                })}

                {workspaces.length === 0 && (
                    <Typography sx={{ color: MUTED, fontSize: "0.88rem", py: 2 }}>
                        You&apos;re not a member of any workspace yet.
                    </Typography>
                )}
            </Stack>
        </GlassCard>
    );
}

/* ================================================================== */
/* 1. Header                                                           */
/* ================================================================== */

function HeaderCard({
    workspace,
    role,
    isAdmin,
}: {
    workspace: WorkspaceInfo;
    role: string;
    isAdmin: boolean;
}) {
    const article = /^[aeiou]/i.test(role) ? "an" : "a";
    return (
        <GlassCard>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
            >
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                        src={workspace.logoUrl ?? undefined}
                        sx={{
                            width: 44,
                            height: 44,
                            bgcolor: "var(--accent-tint-strong)",
                            color: ACCENT,
                            fontWeight: 700,
                        }}
                    >
                        {workspace.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                        <Typography
                            sx={{
                                fontSize: "1.45rem",
                                fontWeight: 800,
                                color: TEXT,
                                lineHeight: 1.1,
                            }}
                        >
                            {workspace.name}
                        </Typography>
                        <Chip
                            label={`You're ${article} ${role}`}
                            size="small"
                            sx={{
                                mt: 0.6,
                                height: 22,
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                color: roleChipColor(role),
                                background: "var(--overlay)",
                                border: `1px solid ${BORDER}`,
                            }}
                        />
                    </Box>
                </Stack>

                {isAdmin && (
                    <Button href="/dashboard" sx={ghostButtonSx}>
                        Dashboard
                    </Button>
                )}
            </Stack>
        </GlassCard>
    );
}

/* ================================================================== */
/* 2. Cosmetics                                                        */
/* ================================================================== */

function CosmeticsCard({
    workspace,
    isAdmin,
    onUpdated,
}: {
    workspace: WorkspaceInfo;
    isAdmin: boolean;
    onUpdated: (next: WorkspaceInfo) => void;
}) {
    const [name, setName] = useState(workspace.name ?? "");
    const [slug, setSlug] = useState(workspace.slug ?? "");
    const [description, setDescription] = useState(workspace.description ?? "");
    const [logoUrl, setLogoUrl] = useState(workspace.logoUrl ?? "");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<Msg | null>(null);

    const trimmedName = name.trim();
    const nameValid = trimmedName.length >= 1;
    const dirty =
        trimmedName !== (workspace.name ?? "").trim() ||
        slug.trim() !== (workspace.slug ?? "").trim() ||
        description.trim() !== (workspace.description ?? "").trim() ||
        logoUrl.trim() !== (workspace.logoUrl ?? "").trim();

    async function save() {
        if (!dirty || !nameValid || saving) return;
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/workspace", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: trimmedName,
                    slug: slug.trim(),
                    description: description.trim(),
                    logoUrl: logoUrl.trim(),
                }),
            });
            const json = (await res.json().catch(() => null)) as {
                workspace?: WorkspaceInfo;
                error?: string;
                message?: string;
            } | null;
            if (!res.ok || !json?.workspace) {
                throw new Error(friendlyApiError(json, "Could not save changes."));
            }
            onUpdated(json.workspace);
            setName(json.workspace.name ?? "");
            setSlug(json.workspace.slug ?? "");
            setDescription(json.workspace.description ?? "");
            setLogoUrl(json.workspace.logoUrl ?? "");
            setMsg({ type: "ok", text: "Workspace identity updated." });
        } catch (e) {
            setMsg({
                type: "err",
                text: e instanceof Error ? e.message : "Could not save changes.",
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <GlassCard>
            <Typography sx={{ ...sectionTitleSx, mb: 0.4 }}>Workspace identity</Typography>
            <Typography sx={{ color: MUTED, fontSize: "0.85rem", mb: 2 }}>
                How this workspace appears to its members.
            </Typography>

            {!isAdmin ? (
                <Stack spacing={1.6}>
                    <ReadOnlyField label="Name" value={workspace.name} />
                    <ReadOnlyField label="Slug" value={workspace.slug} />
                    <ReadOnlyField label="Description" value={workspace.description} />
                    <ReadOnlyField label="Logo URL" value={workspace.logoUrl} />
                </Stack>
            ) : (
                <>
                    <Stack spacing={2}>
                        <TextField
                            label="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            error={!nameValid}
                            helperText={!nameValid ? "Name is required." : " "}
                            fullWidth
                            size="small"
                            sx={fieldSx}
                            FormHelperTextProps={{ sx: { color: "var(--danger)", ml: 0.5 } }}
                        />
                        <TextField
                            label="Slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            helperText="used in the workspace URL: /workspace/<slug>"
                            fullWidth
                            size="small"
                            sx={fieldSx}
                            FormHelperTextProps={{ sx: { color: MUTED, ml: 0.5 } }}
                        />
                        <TextField
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            size="small"
                            sx={fieldSx}
                        />
                        <TextField
                            label="Logo URL"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://…"
                            fullWidth
                            size="small"
                            sx={fieldSx}
                        />
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
                        <Button
                            onClick={save}
                            disabled={!dirty || !nameValid || saving}
                            sx={{ ...gradientButtonSx, minWidth: 110 }}
                        >
                            {saving ? (
                                <CircularProgress size={18} sx={{ color: "var(--fg-muted)" }} />
                            ) : (
                                "Save"
                            )}
                        </Button>
                        {msg && <MessageLine msg={msg} sx={{ mt: 0 }} />}
                    </Stack>
                </>
            )}
        </GlassCard>
    );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
    return (
        <Box>
            <Typography
                sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--fg-faint)",
                    mb: 0.3,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{ color: value ? TEXT : MUTED, fontSize: "0.92rem", wordBreak: "break-word" }}
            >
                {value || "—"}
            </Typography>
        </Box>
    );
}

/* ================================================================== */
/* 3. Members                                                          */
/* ================================================================== */

function MembersCard({
    members,
    isAdmin,
    onRefresh,
}: {
    members: Member[];
    isAdmin: boolean;
    onRefresh: () => Promise<void>;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [msg, setMsg] = useState<Msg | null>(null);
    const [removeMember, setRemoveMember] = useState<Member | null>(null);

    const mutate = useCallback(
        async (id: string, init: RequestInit, okText?: string) => {
            setBusyId(id);
            setMsg(null);
            try {
                const res = await fetch(`/api/workspace/members/${id}`, init);
                const json = (await res.json().catch(() => null)) as {
                    error?: string;
                    message?: string;
                } | null;
                if (!res.ok) {
                    throw new Error(friendlyApiError(json, "Action failed."));
                }
                await onRefresh();
                if (okText) setMsg({ type: "ok", text: okText });
            } catch (e) {
                setMsg({ type: "err", text: e instanceof Error ? e.message : "Action failed." });
            } finally {
                setBusyId(null);
            }
        },
        [onRefresh],
    );

    function approve(id: string) {
        void mutate(
            id,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve" }),
            },
            "Member approved.",
        );
    }

    function changeRole(id: string, nextRole: AssignableRole) {
        void mutate(id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: nextRole }),
        });
    }

    return (
        <GlassCard>
            <Typography sx={{ ...sectionTitleSx, mb: 0.4 }}>Members</Typography>
            <Typography sx={{ color: MUTED, fontSize: "0.85rem", mb: 2 }}>
                {members.length} {members.length === 1 ? "person" : "people"} in this workspace.
            </Typography>

            <Stack divider={<Box sx={{ borderBottom: `1px solid ${BORDER}` }} />}>
                {members.map((m) => {
                    const isPending = m.status === "pending";
                    const isOwner = m.role === "owner";
                    const busy = busyId === m.id;
                    return (
                        <Stack
                            key={m.id}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            sx={{ py: 1.6 }}
                        >
                            <Avatar
                                src={m.avatar ?? undefined}
                                slotProps={{ img: { referrerPolicy: "no-referrer" } }}
                                sx={{
                                    width: 38,
                                    height: 38,
                                    bgcolor: "var(--accent-tint-strong)",
                                    color: ACCENT,
                                    fontWeight: 700,
                                    fontSize: "0.95rem",
                                }}
                            >
                                {initialOf(m)}
                            </Avatar>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    sx={{ color: TEXT, fontWeight: 600, fontSize: "0.95rem" }}
                                >
                                    {m.name || m.email}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: MUTED,
                                        fontSize: "0.82rem",
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {m.email}
                                </Typography>
                            </Box>

                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ flexShrink: 0, flexWrap: "wrap" }}
                            >
                                {isPending && (
                                    <Chip
                                        label="Pending"
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            color: "#fbbf24",
                                            background: "rgba(251,191,36,0.12)",
                                            border: "1px solid rgba(251,191,36,0.25)",
                                        }}
                                    />
                                )}

                                {isPending && isAdmin && (
                                    <Button
                                        onClick={() => approve(m.id)}
                                        disabled={busy}
                                        sx={{
                                            ...gradientButtonSx,
                                            px: 1.8,
                                            py: 0.6,
                                            fontSize: "0.8rem",
                                        }}
                                    >
                                        {busy ? (
                                            <CircularProgress
                                                size={16}
                                                sx={{ color: "var(--accent-contrast)" }}
                                            />
                                        ) : (
                                            "Approve"
                                        )}
                                    </Button>
                                )}

                                {!isPending && isOwner && (
                                    <Chip
                                        label="Owner"
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            color: roleChipColor("owner"),
                                            background: "var(--overlay)",
                                            border: `1px solid ${BORDER}`,
                                        }}
                                    />
                                )}

                                {!isPending && !isOwner && isAdmin && (
                                    <>
                                        <FormControl size="small" sx={{ minWidth: 116 }}>
                                            <Select
                                                value={
                                                    ASSIGNABLE_ROLES.includes(
                                                        m.role as AssignableRole,
                                                    )
                                                        ? m.role
                                                        : "viewer"
                                                }
                                                disabled={busy}
                                                onChange={(e: SelectChangeEvent) =>
                                                    changeRole(
                                                        m.id,
                                                        e.target.value as AssignableRole,
                                                    )
                                                }
                                                sx={selectSx}
                                                MenuProps={selectMenuProps}
                                            >
                                                {ASSIGNABLE_ROLES.map((r) => (
                                                    <MenuItem key={r} value={r}>
                                                        {r.charAt(0).toUpperCase() + r.slice(1)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <Tooltip title="Remove member">
                                            <span>
                                                <IconButton
                                                    onClick={() => setRemoveMember(m)}
                                                    disabled={busy}
                                                    size="small"
                                                    sx={{
                                                        color: "var(--danger)",
                                                        "&:hover": {
                                                            background: "rgba(252,165,165,0.12)",
                                                        },
                                                    }}
                                                >
                                                    <DeleteOutlineIcon fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </>
                                )}

                                {!isPending && !isOwner && !isAdmin && (
                                    <Chip
                                        label={m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            color: roleChipColor(m.role),
                                            background: "var(--overlay)",
                                            border: `1px solid ${BORDER}`,
                                        }}
                                    />
                                )}
                            </Stack>
                        </Stack>
                    );
                })}

                {members.length === 0 && (
                    <Typography sx={{ color: MUTED, fontSize: "0.88rem", py: 2 }}>
                        No members yet.
                    </Typography>
                )}
            </Stack>

            {msg && <MessageLine msg={msg} />}

            <RemoveMemberDialog
                member={removeMember}
                onClose={() => setRemoveMember(null)}
                onRemoved={() => {
                    setRemoveMember(null);
                    void onRefresh();
                }}
            />
        </GlassCard>
    );
}

function RemoveMemberDialog({
    member,
    onClose,
    onRemoved,
}: {
    member: Member | null;
    onClose: () => void;
    onRemoved: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (member) {
            setBusy(false);
            setError(null);
        }
    }, [member]);

    async function confirm() {
        if (!member || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/workspace/members/${member.id}`, { method: "DELETE" });
            const data = (await res.json().catch(() => null)) as {
                error?: string;
                message?: string;
            } | null;
            if (!res.ok) {
                throw new Error(friendlyApiError(data, "Could not remove the member."));
            }
            onRemoved();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not remove the member.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={member != null}
            onClose={() => !busy && onClose()}
            fullWidth
            maxWidth="xs"
            slotProps={{
                paper: {
                    sx: {
                        background: "var(--surface)",
                        border: `1px solid ${BORDER}`,
                        borderRadius: "16px",
                        backgroundImage: "none",
                    },
                },
            }}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.1rem" }}>
                Remove member
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: MUTED, fontSize: "0.9rem", lineHeight: 1.6 }}>
                    Remove <strong style={{ color: TEXT }}>{member?.name || member?.email}</strong>{" "}
                    from the workspace? They will lose access to all workspace resources
                    immediately.
                </Typography>
                {error && (
                    <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ mt: 1.6 }}>
                        <ErrorOutlineIcon sx={{ fontSize: 16, color: "var(--danger)", mt: 0.2 }} />
                        <Typography sx={{ fontSize: "0.82rem", color: "var(--danger)" }}>
                            {error}
                        </Typography>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={busy} sx={ghostButtonSx}>
                    Cancel
                </Button>
                <Button
                    onClick={confirm}
                    disabled={busy}
                    sx={{
                        ...gradientButtonSx,
                        minWidth: 100,
                        background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
                        boxShadow: "0 8px 24px rgba(239,68,68,0.3)",
                        "&:hover": {
                            background: "linear-gradient(135deg, #fca5a5 0%, #f87171 100%)",
                        },
                        "&.Mui-disabled": {
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                            boxShadow: "none",
                        },
                    }}
                >
                    {busy ? (
                        <CircularProgress size={18} sx={{ color: "var(--fg-muted)" }} />
                    ) : (
                        "Remove"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ================================================================== */
/* 4. Invites                                                          */
/* ================================================================== */

function InviteLinkCard({
    invite,
    onRefresh,
}: {
    invite: InviteLink | null;
    onRefresh: () => Promise<void>;
}) {
    const [role, setRole] = useState<AssignableRole>(
        invite && ASSIGNABLE_ROLES.includes(invite.role as AssignableRole)
            ? (invite.role as AssignableRole)
            : "viewer",
    );
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [msg, setMsg] = useState<Msg | null>(null);

    // Keep the role selector in sync when the link changes underneath us.
    useEffect(() => {
        if (invite && ASSIGNABLE_ROLES.includes(invite.role as AssignableRole)) {
            setRole(invite.role as AssignableRole);
        }
    }, [invite]);

    async function call(body: Record<string, unknown>, okText: string, fail: string) {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch("/api/workspace/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => null)) as {
                error?: string;
                message?: string;
            } | null;
            if (!res.ok) throw new Error(friendlyApiError(json, fail));
            await onRefresh();
            setMsg({ type: "ok", text: okText });
        } catch (e) {
            setMsg({ type: "err", text: e instanceof Error ? e.message : fail });
        } finally {
            setBusy(false);
        }
    }

    function generate() {
        void call({ role }, "Invite link generated.", "Could not generate the link.");
    }

    function rotate() {
        if (
            !window.confirm(
                "Rotate the invite link? The current link will stop working immediately.",
            )
        )
            return;
        void call(
            { role, rotate: true },
            "Link rotated — the old one no longer works.",
            "Could not rotate the link.",
        );
    }

    function changeRole(next: AssignableRole) {
        setRole(next);
        if (invite) void call({ role: next }, "Link role updated.", "Could not update the role.");
    }

    async function disable() {
        if (!window.confirm("Disable the invite link? It will stop working immediately.")) return;
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch("/api/workspace/invite", { method: "DELETE" });
            if (!res.ok) {
                const json = (await res.json().catch(() => null)) as {
                    error?: string;
                    message?: string;
                } | null;
                throw new Error(friendlyApiError(json, "Could not disable the link."));
            }
            await onRefresh();
            setMsg({ type: "ok", text: "Invite link disabled." });
        } catch (e) {
            setMsg({
                type: "err",
                text: e instanceof Error ? e.message : "Could not disable the link.",
            });
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!invite) return;
        try {
            await navigator.clipboard.writeText(invite.url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setMsg({ type: "err", text: "Couldn't copy to clipboard." });
        }
    }

    return (
        <GlassCard>
            <Typography sx={{ ...sectionTitleSx, mb: 0.4 }}>Invite link</Typography>
            <Typography sx={{ color: MUTED, fontSize: "0.85rem", mb: 2 }}>
                One shared link per workspace. Anyone who opens it can request to join — you approve
                them above. Rotating the link disables the previous one immediately.
            </Typography>

            {/* Role the link grants */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ sm: "center" }}
                sx={{ mb: invite ? 2 : 0 }}
            >
                <Typography sx={{ color: MUTED, fontSize: "0.82rem" }}>
                    Joiners get the role
                </Typography>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select
                        value={role}
                        disabled={busy}
                        onChange={(e: SelectChangeEvent) =>
                            changeRole(e.target.value as AssignableRole)
                        }
                        sx={selectSx}
                        MenuProps={selectMenuProps}
                    >
                        {ASSIGNABLE_ROLES.map((r) => (
                            <MenuItem key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Stack>

            {invite ? (
                <>
                    <Box
                        sx={{
                            p: 1.4,
                            borderRadius: "10px",
                            background: "var(--accent-tint)",
                            border: "1px solid var(--accent-border)",
                        }}
                    >
                        <Typography
                            sx={{ color: MUTED, fontSize: "0.72rem", mb: 0.6, fontWeight: 600 }}
                        >
                            INVITE LINK
                        </Typography>
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ sm: "center" }}
                        >
                            <Typography
                                sx={{
                                    flex: 1,
                                    color: TEXT,
                                    fontSize: "0.8rem",
                                    wordBreak: "break-all",
                                    fontFamily: "monospace",
                                }}
                            >
                                {invite.url}
                            </Typography>
                            <Button
                                onClick={copy}
                                startIcon={
                                    copied ? (
                                        <CheckCircleIcon sx={{ fontSize: 16 }} />
                                    ) : (
                                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                                    )
                                }
                                sx={ghostButtonSx}
                            >
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </Stack>
                    </Box>

                    <Stack direction="row" spacing={1} sx={{ mt: 1.6 }}>
                        <Button onClick={rotate} disabled={busy} sx={ghostButtonSx}>
                            {busy ? (
                                <CircularProgress size={15} sx={{ color: MUTED }} />
                            ) : (
                                "Rotate link"
                            )}
                        </Button>
                        <Button
                            onClick={disable}
                            disabled={busy}
                            sx={{
                                ...ghostButtonSx,
                                color: "var(--danger)",
                                borderColor: "rgba(252,165,165,0.3)",
                                "&:hover": {
                                    background: "rgba(252,165,165,0.1)",
                                    borderColor: "rgba(252,165,165,0.5)",
                                },
                            }}
                        >
                            Disable
                        </Button>
                    </Stack>
                </>
            ) : (
                <Button
                    onClick={generate}
                    disabled={busy}
                    sx={{ ...gradientButtonSx, mt: 2, minWidth: 170 }}
                >
                    {busy ? (
                        <CircularProgress size={18} sx={{ color: "var(--accent-contrast)" }} />
                    ) : (
                        "Generate invite link"
                    )}
                </Button>
            )}

            {msg && <MessageLine msg={msg} />}
        </GlassCard>
    );
}
