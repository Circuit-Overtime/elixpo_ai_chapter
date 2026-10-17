"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DescriptionIcon from "@mui/icons-material/Description";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    InputAdornment,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "./dashboard-ui";
import { BORDER, SURFACE } from "./glass-card";
import { GlassCard } from "./glass-card";
import { useRole } from "./role-provider";

const ACCENT = "var(--accent)";
const TEXT_60 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

// Shared dark field / select styling (matches webhooks/products managers).
const darkField = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.92rem", py: 1.05 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
};

const darkSelect = {
    color: "var(--fg)",
    borderRadius: "10px",
    background: "var(--field-bg)",
    minWidth: 150,
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSelect-icon": { color: TEXT_40 },
    "& .MuiSelect-select": { fontSize: "0.9rem", py: 1.05 },
};

const darkMenuProps = {
    slotProps: {
        paper: {
            sx: {
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                backgroundImage: "none",
                "& .MuiMenuItem-root": { color: "var(--fg)", fontSize: "0.9rem" },
                "& .MuiMenuItem-root.Mui-selected": { background: "var(--accent-tint)" },
            },
        },
    },
};

type SortKey = "recent" | "oldest" | "name";

interface TemplateSummary {
    id: string;
    slug: string;
    name: string;
    kind: string;
    subject: string;
    variables: string[];
    status: string;
    updated_at: string;
    workspace: {
        tenantId: string;
        name: string;
        slug: string | null;
        role: string;
        kind: "personal" | "shared";
        active: boolean;
    };
}

const NEW_BTN = {
    textTransform: "none" as const,
    fontWeight: 700,
    fontSize: "0.9rem",
    color: "var(--accent-contrast)",
    px: 2.4,
    py: 1.05,
    borderRadius: "10px",
    background: "var(--accent-gradient)",
    boxShadow: "0 6px 18px var(--accent-shadow)",
    "&:hover": { background: "var(--accent-gradient-hover)" },
};

function ReadOnlyChip() {
    return (
        <Chip
            label="Read-only access"
            size="small"
            sx={{
                color: "var(--fg-muted)",
                bgcolor: "var(--overlay)",
                border: "1px solid var(--border)",
            }}
        />
    );
}

function relativeTime(iso: string): string {
    const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
    if (Number.isNaN(t)) return "";
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function TemplatesList() {
    const { canWrite } = useRole();
    const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("recent");

    // Filter by name / slug / subject, then sort.
    const visible = useMemo(() => {
        const list = templates ?? [];
        const q = query.trim().toLowerCase();
        const filtered = q
            ? list.filter(
                  (t) =>
                      t.name.toLowerCase().includes(q) ||
                      t.slug.toLowerCase().includes(q) ||
                      (t.subject ?? "").toLowerCase().includes(q),
              )
            : list;
        const ts = (iso: string) =>
            Date.parse(iso?.includes("T") ? iso : `${`${iso}`.replace(" ", "T")}Z`) || 0;
        return [...filtered].sort((a, b) => {
            if (sort === "name") return a.name.localeCompare(b.name);
            if (sort === "oldest") return ts(a.updated_at) - ts(b.updated_at);
            return ts(b.updated_at) - ts(a.updated_at); // recent
        });
    }, [templates, query, sort]);

    async function load() {
        setError(null);
        try {
            const res = await fetch("/api/templates");
            const d: any = await res.json();
            if (!res.ok || !d?.ok) throw new Error("Could not load templates.");
            setTemplates(d.templates);
        } catch (e: any) {
            setError(e?.message || "Could not load templates.");
            setTemplates([]);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function openTemplate(t: TemplateSummary) {
        if (!t.workspace.active) {
            const res = await fetch("/api/workspace/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: t.workspace.tenantId }),
            });
            if (!res.ok) {
                setError("Could not switch to that workspace.");
                return;
            }
        }
        window.location.href = `/dashboard/templates/${t.id}`;
    }

    async function remove(id: string) {
        if (!confirm("Delete this template? This cannot be undone.")) return;
        setDeleting(id);
        try {
            const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            setTemplates((prev) => (prev || []).filter((t) => t.id !== id));
        } catch {
            setError("Could not delete the template.");
        } finally {
            setDeleting(null);
        }
    }

    if (templates === null) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
                <CircularProgress sx={{ color: ACCENT }} />
            </Box>
        );
    }

    return (
        <Box>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ sm: "center" }}
                justifyContent="flex-end"
                sx={{ mb: 2 }}
            >
                {templates.length > 0 && (
                    <>
                        <TextField
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search templates…"
                            size="small"
                            sx={{ ...darkField, flex: 1, width: { xs: "100%", sm: "auto" } }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon sx={{ fontSize: 18, color: TEXT_40 }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <Select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            size="small"
                            sx={darkSelect}
                            MenuProps={darkMenuProps}
                        >
                            <MenuItem value="recent">Recently updated</MenuItem>
                            <MenuItem value="oldest">Oldest first</MenuItem>
                            <MenuItem value="name">Name (A–Z)</MenuItem>
                        </Select>
                    </>
                )}
                {canWrite ? (
                    <Button
                        component={Link}
                        href="/dashboard/templates/new"
                        startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
                        sx={NEW_BTN}
                    >
                        New template
                    </Button>
                ) : (
                    <ReadOnlyChip />
                )}
            </Stack>

            {error && (
                <Box
                    sx={{
                        mb: 2,
                        px: 2,
                        py: 1.2,
                        borderRadius: "10px",
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "var(--danger)",
                        fontSize: "0.85rem",
                    }}
                >
                    {error}
                </Box>
            )}

            {templates.length === 0 ? (
                <EmptyState
                    icon={DescriptionIcon}
                    headline="No templates yet"
                    subtext="Design your first email in the visual editor — add {{variables}} for the parts that change per recipient."
                    cta={
                        canWrite ? (
                            <Button
                                component={Link}
                                href="/dashboard/templates/new"
                                startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
                                sx={NEW_BTN}
                            >
                                Create a template
                            </Button>
                        ) : (
                            <ReadOnlyChip />
                        )
                    }
                />
            ) : visible.length === 0 ? (
                <Typography
                    sx={{ fontSize: "0.88rem", color: TEXT_60, textAlign: "center", py: 4 }}
                >
                    No templates match &ldquo;{query.trim()}&rdquo;
                </Typography>
            ) : (
                <Stack spacing={1.5}>
                    {visible.map((t) => (
                        <GlassCard key={t.id} sx={{ p: 0 }}>
                            <Stack direction="row" alignItems="center" sx={{ p: 2, gap: 2 }}>
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={() => openTemplate(t)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        flex: 1,
                                        minWidth: 0,
                                        textDecoration: "none",
                                        color: "inherit",
                                        border: 0,
                                        background: "transparent",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        p: 0,
                                        "&:hover .t-name": { color: ACCENT },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: "11px",
                                            display: "grid",
                                            placeItems: "center",
                                            background: "var(--accent-tint)",
                                            border: "1px solid var(--accent-border)",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <DescriptionIcon sx={{ fontSize: 20, color: ACCENT }} />
                                    </Box>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography
                                                className="t-name"
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: "1rem",
                                                    color: "var(--fg)",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    transition: "color 0.15s ease",
                                                }}
                                            >
                                                {t.name}
                                            </Typography>
                                            <Chip
                                                label={t.slug}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontFamily: "var(--font-geist-mono)",
                                                    fontSize: "0.68rem",
                                                    color: "var(--fg-muted)",
                                                    bgcolor: "var(--overlay)",
                                                    border: "1px solid var(--border)",
                                                }}
                                            />
                                            {t.variables.length > 0 && (
                                                <Chip
                                                    label={`${t.variables.length} var${t.variables.length > 1 ? "s" : ""}`}
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: "0.68rem",
                                                        color: "var(--accent)",
                                                        bgcolor: "var(--accent-tint)",
                                                        border: "1px solid var(--accent-border)",
                                                    }}
                                                />
                                            )}
                                            <Chip
                                                label={`${t.workspace.kind === "personal" ? "Personal" : "Shared"} · ${t.workspace.name}`}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    maxWidth: 190,
                                                    fontSize: "0.67rem",
                                                    fontWeight: 700,
                                                    color:
                                                        t.workspace.kind === "shared"
                                                            ? "var(--accent)"
                                                            : "var(--fg-muted)",
                                                    bgcolor:
                                                        t.workspace.kind === "shared"
                                                            ? "var(--accent-tint)"
                                                            : "var(--overlay)",
                                                    border: "1px solid var(--border)",
                                                    "& .MuiChip-label": {
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    },
                                                }}
                                            />
                                        </Stack>
                                        <Typography
                                            sx={{
                                                color: TEXT_60,
                                                fontSize: "0.85rem",
                                                mt: 0.3,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {t.subject || "No subject"} · updated{" "}
                                            {relativeTime(t.updated_at)}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Button
                                        onClick={() => openTemplate(t)}
                                        startIcon={
                                            <EditIcon sx={{ fontSize: "1rem !important" }} />
                                        }
                                        sx={{
                                            textTransform: "none",
                                            fontSize: "0.85rem",
                                            color: "var(--fg-muted)",
                                            borderRadius: "9px",
                                            "&:hover": {
                                                background: "var(--overlay)",
                                                color: "var(--fg)",
                                            },
                                        }}
                                    >
                                        Edit
                                    </Button>
                                    {canWrite && t.workspace.active && (
                                        <Button
                                            onClick={() => remove(t.id)}
                                            disabled={deleting === t.id}
                                            sx={{
                                                minWidth: 0,
                                                p: 1,
                                                color: "var(--fg-muted)",
                                                borderRadius: "9px",
                                                "&:hover": {
                                                    background: "rgba(239,68,68,0.1)",
                                                    color: "var(--danger)",
                                                },
                                            }}
                                        >
                                            {deleting === t.id ? (
                                                <CircularProgress
                                                    size={16}
                                                    sx={{ color: "var(--fg-muted)" }}
                                                />
                                            ) : (
                                                <DeleteOutlineIcon sx={{ fontSize: 19 }} />
                                            )}
                                        </Button>
                                    )}
                                </Stack>
                            </Stack>
                        </GlassCard>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
