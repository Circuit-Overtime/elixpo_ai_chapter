"use client";

/**
 * UI kit — aurora purple scheme over a glass-on-aurora surface, kept dense and
 * commercial (KPI tiles with sparklines + deltas, bordered glass panels, top-N
 * bar tables, donuts). Single accent color (#9b7bf7) across the whole app.
 */

import TimeRange from "@/components/time-range";
import {
    ArrowDownward,
    ArrowUpward,
    ContentCopy,
    DownloadOutlined,
    ImageOutlined,
    MoreHoriz,
    PrintOutlined,
    Search as SearchIcon,
    SwapVert,
} from "@mui/icons-material";
import {
    Box,
    Card,
    Chip,
    IconButton,
    InputBase,
    ListItemIcon,
    Menu,
    MenuItem,
    Typography,
} from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useMemo, useRef, useState } from "react";

// Re-export pure helpers so client code can keep importing from "@/components/ui".
// Server code should import these from "@/lib/format" directly.
export { fmt, fmtBytes, trend } from "@/lib/format";

export const C = {
    bg: "#0b0d12",
    accent: "#9b7bf7",
    accentLight: "#b69aff",
    accentDeep: "#7c5cff",
    accentDim: "rgba(155,123,247,0.15)",
    panel: "rgba(18,21,32,0.55)",
    panelSolid: "#14172270",
    panelHover: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.09)",
    borderLight: "rgba(255,255,255,0.16)",
    text: "#f5f5f4",
    textDim: "#b6bcc8",
    textMuted: "#7c8493",
    success: "#4ade80",
    error: "#f87171",
    warn: "#fbbf24",
};

/** Purple-forward chart palette (single scheme). Error red reserved for errors. */
export const CHART = [
    "#9b7bf7",
    "#b69aff",
    "#7c5cff",
    "#c4b5fd",
    "#86efac",
    "#5fb6ff",
];

export const glass = {
    bgcolor: C.panel,
    backdropFilter: "blur(16px)",
    border: `1px solid ${C.border}`,
    borderRadius: "12px",
} as const;

/* ---------------------------------------------------------------- page header */

export function PageHeader({
    title,
    subtitle,
    action,
    timeRange,
}: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    /** Show the global time-range picker (analytics pages). */
    timeRange?: boolean;
}) {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1.5,
                mb: 2.5,
            }}
        >
            <Box>
                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: "1.4rem",
                        color: C.text,
                        letterSpacing: "-0.02em",
                    }}
                >
                    {title}
                </Typography>
                {subtitle && (
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.82rem",
                            mt: 0.25,
                        }}
                    >
                        {subtitle}
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {timeRange && <TimeRange />}
                {action}
            </Box>
        </Box>
    );
}

/* ---------------------------------------------------------------------- panel */

export function Panel({
    title,
    action,
    children,
    dense,
    exportData,
    exportName,
}: {
    title?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    dense?: boolean;
    /** Rows offered for CSV export via the panel menu. */
    exportData?: { label: string; value: number | string }[];
    exportName?: string;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    return (
        <Card
            sx={{
                ...glass,
                height: "100%",
                boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
            }}
        >
            {title && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 1.75,
                        py: 1.25,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                >
                    <Typography
                        sx={{
                            fontWeight: 600,
                            color: C.text,
                            fontSize: "0.85rem",
                        }}
                    >
                        {title}
                    </Typography>
                    {action ?? (
                        <PanelMenu
                            title={title}
                            targetRef={contentRef}
                            exportData={exportData}
                            exportName={exportName || title}
                        />
                    )}
                </Box>
            )}
            <Box ref={contentRef} sx={{ p: dense ? 0 : 1.75 }}>
                {children}
            </Box>
        </Card>
    );
}

/* ----------------------------------------------------- panel action menu (3-dots) */

function PanelMenu({
    title,
    targetRef,
    exportData,
    exportName,
}: {
    title?: string;
    targetRef: React.RefObject<HTMLDivElement | null>;
    exportData?: { label: string; value: number | string }[];
    exportName?: string;
}) {
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const close = () => setAnchor(null);
    const slug = (exportName || title || "panel")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
        } catch {}
        close();
    };
    const print = () => {
        window.print();
        close();
    };
    const saveImage = async () => {
        close();
        if (!targetRef.current) return;
        try {
            const { toPng } = await import("html-to-image");
            const url = await toPng(targetRef.current, {
                backgroundColor: "#11151f",
                pixelRatio: 2,
            });
            const a = document.createElement("a");
            a.href = url;
            a.download = `${slug}.png`;
            a.click();
        } catch {}
    };
    const downloadCsv = () => {
        close();
        if (!exportData?.length) return;
        const rows = [
            ["label", "value"],
            ...exportData.map((d) => [d.label, String(d.value)]),
        ];
        const csv = rows
            .map((r) =>
                r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
            )
            .join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <IconButton
                size="small"
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{
                    color: C.textMuted,
                    p: 0.25,
                    "&:hover": { color: C.text },
                }}
            >
                <MoreHoriz sx={{ fontSize: "1.1rem" }} />
            </IconButton>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={close}
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: "rgba(20,22,34,0.97)",
                            backdropFilter: "blur(16px)",
                            border: `1px solid ${C.border}`,
                            borderRadius: "10px",
                            minWidth: 190,
                        },
                    },
                }}
            >
                <PanelMenuItem
                    icon={<ContentCopy fontSize="small" />}
                    label="Copy link"
                    onClick={copyLink}
                />
                <PanelMenuItem
                    icon={<ImageOutlined fontSize="small" />}
                    label="Save as image"
                    onClick={saveImage}
                />
                {exportData && exportData.length > 0 && (
                    <PanelMenuItem
                        icon={<DownloadOutlined fontSize="small" />}
                        label="Download CSV"
                        onClick={downloadCsv}
                    />
                )}
                <PanelMenuItem
                    icon={<PrintOutlined fontSize="small" />}
                    label="Print"
                    onClick={print}
                />
            </Menu>
        </>
    );
}

function PanelMenuItem({
    icon,
    label,
    onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <MenuItem
            onClick={onClick}
            sx={{
                py: 0.85,
                color: C.textDim,
                fontSize: "0.82rem",
                "&:hover": { bgcolor: "rgba(255,255,255,0.05)", color: C.text },
            }}
        >
            <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>
                {icon}
            </ListItemIcon>
            {label}
        </MenuItem>
    );
}

/* ------------------------------------------------------------------- sparkline */

export function Sparkline({
    values,
    color = C.accent,
    height = 34,
}: { values: number[]; color?: string; height?: number }) {
    if (!values.length) return <Box sx={{ height }} />;
    const W = 120;
    const H = height;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const step = values.length > 1 ? W / (values.length - 1) : W;
    const pts = values.map(
        (v, i) =>
            `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`,
    );
    const line = `M${pts.join(" L")}`;
    const area = `${line} L${W},${H} L0,${H} Z`;
    const id = `sl-${color.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            aria-hidden
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
    );
}

/* --------------------------------------------------------------------- KPI tile */

export function KpiTile({
    label,
    value,
    delta,
    spark,
    color = C.accent,
    href,
    sub,
}: {
    label: string;
    value: string | number;
    delta?: number | null;
    spark?: number[];
    color?: string;
    href?: string;
    sub?: string;
}) {
    const up = (delta ?? 0) >= 0;
    const tile = (
        <Card
            sx={{
                ...glass,
                p: 1.5,
                height: "100%",
                transition: "border-color 0.15s",
                "&:hover": { borderColor: href ? C.accent : C.border },
            }}
        >
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                }}
            >
                {label}
            </Typography>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 1,
                    mt: 0.5,
                }}
            >
                <Typography
                    sx={{
                        fontWeight: 800,
                        color: C.text,
                        fontSize: "1.5rem",
                        lineHeight: 1.1,
                    }}
                >
                    {value}
                </Typography>
                {delta != null && Number.isFinite(delta) && (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            color: up ? C.success : C.error,
                            fontSize: "0.74rem",
                            fontWeight: 600,
                        }}
                    >
                        {up ? (
                            <ArrowUpward sx={{ fontSize: "0.85rem" }} />
                        ) : (
                            <ArrowDownward sx={{ fontSize: "0.85rem" }} />
                        )}
                        {Math.abs(delta).toFixed(1)}%
                    </Box>
                )}
            </Box>
            {sub && (
                <Typography
                    sx={{ color: C.textMuted, fontSize: "0.7rem", mt: 0.25 }}
                >
                    {sub}
                </Typography>
            )}
            {spark && spark.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    <Sparkline values={spark} color={color} />
                </Box>
            )}
        </Card>
    );
    return href ? (
        <Link
            href={href}
            style={{ textDecoration: "none", display: "block", height: "100%" }}
        >
            {tile}
        </Link>
    ) : (
        tile
    );
}

/* ----------------------------------------------------------------- top-N table */

export function TopList({
    items,
    color = C.accent,
    valueFmt = (n: number) => n.toLocaleString(),
    controls = true,
}: {
    items: {
        label: string;
        value: number;
        href?: string;
        chip?: React.ReactNode;
    }[];
    color?: string;
    valueFmt?: (n: number) => string;
    controls?: boolean;
}) {
    const [filter, setFilter] = useState("");
    const [desc, setDesc] = useState(true);

    const shown = useMemo(() => {
        let r = items;
        if (filter.trim()) {
            const q = filter.toLowerCase();
            r = r.filter((i) => i.label.toLowerCase().includes(q));
        }
        return [...r].sort((a, b) =>
            desc ? b.value - a.value : a.value - b.value,
        );
    }, [items, filter, desc]);

    if (!items.length) return <Empty message="No data." />;
    const max = Math.max(...shown.map((i) => i.value), 1);
    return (
        <Box>
            {controls && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            flex: 1,
                            bgcolor: "rgba(255,255,255,0.04)",
                            borderRadius: "6px",
                            px: 1,
                        }}
                    >
                        <SearchIcon
                            sx={{ fontSize: "0.95rem", color: C.textMuted }}
                        />
                        <InputBase
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter…"
                            sx={{
                                flex: 1,
                                fontSize: "0.78rem",
                                color: C.text,
                                "& input::placeholder": {
                                    color: C.textMuted,
                                    opacity: 1,
                                },
                            }}
                        />
                    </Box>
                    <IconButton
                        size="small"
                        onClick={() => setDesc((d) => !d)}
                        title={desc ? "Sort ascending" : "Sort descending"}
                        sx={{
                            color: C.textMuted,
                            "&:hover": { color: C.text },
                        }}
                    >
                        <SwapVert sx={{ fontSize: "1rem" }} />
                    </IconButton>
                </Box>
            )}
            {shown.map((it) => {
                const row = (
                    <Box
                        key={it.label}
                        sx={{
                            position: "relative",
                            py: 0.8,
                            px: 1,
                            borderBottom: `1px solid ${C.border}`,
                            "&:hover": it.href
                                ? { bgcolor: C.panelHover }
                                : undefined,
                        }}
                    >
                        <Box
                            sx={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${(it.value / max) * 100}%`,
                                bgcolor: color,
                                opacity: 0.12,
                                borderRight: `2px solid ${color}`,
                            }}
                        />
                        <Box
                            sx={{
                                position: "relative",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                            }}
                        >
                            <Typography
                                sx={{
                                    color: C.text,
                                    fontSize: "0.82rem",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "68%",
                                }}
                            >
                                {it.label}
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                {it.chip}
                                <Typography
                                    sx={{
                                        color: C.textDim,
                                        fontSize: "0.8rem",
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    {valueFmt(it.value)}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                );
                return it.href ? (
                    <Link
                        key={it.label}
                        href={it.href}
                        style={{ textDecoration: "none" }}
                    >
                        {row}
                    </Link>
                ) : (
                    <Box key={it.label}>{row}</Box>
                );
            })}
        </Box>
    );
}

/* -------------------------------------------------------------------- donut */

export function Donut({
    data,
    size = 150,
}: { data: { label: string; value: number }[]; size?: number }) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const r = size / 2 - 10;
    const cx = size / 2;
    const cy = size / 2;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
            }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="14"
                />
                {data.map((d, i) => {
                    const frac = d.value / total;
                    const dash = frac * circ;
                    const seg = (
                        <circle
                            key={d.label}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={CHART[i % CHART.length]}
                            strokeWidth="14"
                            strokeDasharray={`${dash} ${circ - dash}`}
                            strokeDashoffset={-offset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                        />
                    );
                    offset += dash;
                    return seg;
                })}
                <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={C.text}
                    fontSize="0.95rem"
                    fontWeight="700"
                >
                    {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                </text>
            </svg>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {data.map((d, i) => (
                    <Box
                        key={d.label}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                        }}
                    >
                        <Box
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "2px",
                                bgcolor: CHART[i % CHART.length],
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.76rem", color: C.textDim }}
                        >
                            {d.label}{" "}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 600 }}
                            >
                                {((d.value / total) * 100).toFixed(0)}%
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

/* ---------------------------------------------------------- status code bar */

const STATUS_CLASSES = [
    { key: "2xx", color: "#4593ff", test: (n: number) => n >= 200 && n < 300 },
    { key: "3xx", color: "#fbbf24", test: (n: number) => n >= 300 && n < 400 },
    { key: "4xx", color: "#f472b6", test: (n: number) => n >= 400 && n < 500 },
    { key: "5xx", color: "#a855f7", test: (n: number) => n >= 500 },
];

export function StatusBar({
    status,
}: { status: { label: string; count: number }[] }) {
    const groups = STATUS_CLASSES.map((c) => ({
        ...c,
        count: status
            .filter((s) => c.test(Number(s.label)))
            .reduce((a, s) => a + s.count, 0),
    }));
    const total = groups.reduce((a, g) => a + g.count, 0) || 1;
    return (
        <Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.25 }}>
                {groups.map((g) => (
                    <Box
                        key={g.key}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                        }}
                    >
                        <Box
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: g.color,
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.78rem", color: C.textDim }}
                        >
                            {g.key}{" "}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 600 }}
                            >
                                {g.count >= 1000
                                    ? `${(g.count / 1000).toFixed(2)}k`
                                    : g.count}
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    height: 30,
                    borderRadius: "6px",
                    overflow: "hidden",
                    bgcolor: "rgba(255,255,255,0.04)",
                }}
            >
                {groups
                    .filter((g) => g.count > 0)
                    .map((g) => (
                        <Box
                            key={g.key}
                            title={`${g.key}: ${g.count.toLocaleString()}`}
                            sx={{
                                width: `${(g.count / total) * 100}%`,
                                bgcolor: g.color,
                                transition: "width 0.3s",
                            }}
                        />
                    ))}
            </Box>
        </Box>
    );
}

/* ------------------------------------------------------------- misc primitives */

const STATUS: Record<string, { color: string; bg: string }> = {
    success: { color: C.success, bg: "rgba(74,222,128,0.12)" },
    warning: { color: C.warn, bg: "rgba(251,191,36,0.12)" },
    error: { color: C.error, bg: "rgba(248,113,113,0.12)" },
    info: { color: C.accentLight, bg: C.accentDim },
    neutral: { color: C.textDim, bg: "rgba(255,255,255,0.05)" },
};

export function StatusChip({
    label,
    tone = "neutral",
}: { label: string; tone?: keyof typeof STATUS }) {
    const s = STATUS[tone];
    return (
        <Chip
            label={label}
            size="small"
            sx={{
                height: 20,
                fontSize: "0.68rem",
                fontWeight: 600,
                color: s.color,
                bgcolor: s.bg,
                border: `1px solid ${s.color}33`,
                borderRadius: "6px",
            }}
        />
    );
}

export function SectionError({ message }: { message: string }) {
    return (
        <Box
            sx={{
                p: 1.5,
                borderRadius: "8px",
                bgcolor: "rgba(251,191,36,0.07)",
                border: "1px solid rgba(251,191,36,0.25)",
                color: C.warn,
                fontSize: "0.78rem",
            }}
        >
            {message}
        </Box>
    );
}

export function Empty({ message }: { message: string }) {
    return (
        <Typography
            sx={{
                color: C.textMuted,
                fontSize: "0.82rem",
                py: 2,
                textAlign: "center",
            }}
        >
            {message}
        </Typography>
    );
}
