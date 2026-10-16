"use client";

/** Public status page — light, commercial (Atlassian Statuspage style).
 * Every Elixpo service renders as its own card with a real uptime history bar:
 * 90 daily cells for the base platform (elixpo.com), 24 hourly cells for the
 * sub-services (which only retain short-window edge analytics). */

import type { DayPoint } from "@/lib/metrics";
import type { Health, ProductStatus, StatusPayload } from "@/lib/status-data";
import { GitHub, OpenInNew, Refresh } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useCallback, useEffect, useState } from "react";

const REPO = "https://github.com/elixpo/status.elixpo";

/** Client cache: serve from localStorage within the TTL to avoid re-hitting the
 * server; the refresh button bypasses this (but not the server KV cache). */
const LS_KEY = "elixpo-status-cache-v1";
const LS_TTL = 60 * 60 * 1000; // 1 hour
const REFRESH_COOLDOWN = 5000; // 5 seconds

const L = {
    bg: "#f7f7f2",
    card: "#ffffff",
    border: "#d9ddd8",
    text: "#142018",
    muted: "#667069",
    green: "#0b6b43",
    amber: "#d97706",
    red: "#dc2626",
    grey: "#d9ddd8",
};

const theme = createTheme({
    palette: { mode: "light" },
    typography: { fontFamily: "var(--font-geist-sans), Arial, sans-serif" },
});

const HEALTH: Record<Health, { color: string; label: string }> = {
    operational: { color: L.green, label: "Operational" },
    degraded: { color: L.amber, label: "Degraded performance" },
    outage: { color: L.red, label: "Outage" },
    idle: { color: L.muted, label: "No traffic" },
};

function cellColor(d: DayPoint): string {
    if (d.total === 0) return L.grey;
    const r = d.errors / d.total;
    if (r >= 0.05) return L.red;
    if (r >= 0.01) return L.amber;
    return L.green;
}

function fmtCell(d: DayPoint | null, window: "90d" | "24h"): string {
    if (!d) return "no data";
    const when =
        window === "90d"
            ? d.date
            : new Date(d.date).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
              });
    const pct =
        d.total > 0
            ? `${(((d.total - d.errors) / d.total) * 100).toFixed(2)}%`
            : "—";
    const unit = window === "90d" ? "req" : "req/h";
    return `${when} · ${pct} · ${d.total.toLocaleString()} ${unit}`;
}

function UptimeBars({
    days,
    target,
    window,
}: { days: DayPoint[]; target: number; window: "90d" | "24h" }) {
    // Pad the left with "no data" cells so every strip is full width.
    const pad = Math.max(0, target - days.length);
    const cells = [
        ...Array.from({ length: pad }, (_, index) => ({
            key: `empty-${target}-${index}`,
            point: null as DayPoint | null,
        })),
        ...days.slice(-target).map((point) => ({
            key: point.date,
            point,
        })),
    ];
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "stretch",
                gap: "2px",
                height: 34,
            }}
        >
            {cells.map(({ key, point }) => (
                <Box
                    key={key}
                    title={fmtCell(point, window)}
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: "2px",
                        bgcolor: point ? cellColor(point) : L.grey,
                        opacity: point ? 1 : 0.4,
                        transition: "transform 0.1s",
                        "&:hover": { transform: "scaleY(1.12)" },
                    }}
                />
            ))}
        </Box>
    );
}

function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400_000);
    if (days <= 0) {
        const hrs = Math.floor(diff / 3600_000);
        return hrs <= 1 ? "just now" : `${hrs}h ago`;
    }
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
}

function ServiceCard({
    p,
    hero = false,
}: { p: ProductStatus; hero?: boolean }) {
    const h = HEALTH[p.health];
    const is90 = p.window === "90d";
    return (
        <Box
            sx={{
                bgcolor: hero ? "#fbfdfc" : L.card,
                border: `1px solid ${hero ? h.color : L.border}`,
                borderRadius: hero ? "12px" : "10px",
                p: hero ? { xs: 2.5, md: 3 } : 2.5,
                boxShadow: hero ? "0 1px 2px rgba(28,25,23,0.04)" : "none",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    mb: hero ? 2 : 1.5,
                    flexWrap: "wrap",
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        minWidth: 0,
                    }}
                >
                    {hero ? (
                        <Box
                            sx={{
                                px: 1,
                                py: 0.4,
                                borderRadius: "6px",
                                bgcolor: h.color,
                                color: "#fff",
                                fontSize: "0.62rem",
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                lineHeight: 1,
                            }}
                        >
                            Platform
                        </Box>
                    ) : (
                        <Box
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: h.color,
                                flexShrink: 0,
                            }}
                        />
                    )}
                    <Typography
                        sx={{
                            fontWeight: hero ? 800 : 700,
                            fontSize: hero ? "1.25rem" : "1rem",
                            letterSpacing: hero ? "-0.01em" : 0,
                        }}
                    >
                        {p.label}
                    </Typography>
                    {p.domain && (
                        <Box
                            component="a"
                            href={`https://${p.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{
                                color: L.muted,
                                fontSize: hero ? "0.84rem" : "0.78rem",
                                textDecoration: "none",
                                "&:hover": { color: L.text },
                            }}
                        >
                            {p.domain}
                        </Box>
                    )}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Typography
                        sx={{
                            color: h.color,
                            fontWeight: 700,
                            fontSize: hero ? "0.98rem" : "0.88rem",
                        }}
                    >
                        {h.label}
                    </Typography>
                    <Box
                        component="a"
                        href={`${p.repo || REPO}/issues/new`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Report an issue with ${p.label}`}
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            px: 1.25,
                            py: 0.5,
                            borderRadius: "7px",
                            border: `1px solid ${L.border}`,
                            color: L.muted,
                            textDecoration: "none",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            lineHeight: 1,
                            "&:hover": {
                                color: L.text,
                                borderColor: L.muted,
                                bgcolor: L.bg,
                            },
                        }}
                    >
                        <GitHub sx={{ fontSize: "0.95rem" }} />
                        Report
                    </Box>
                </Box>
            </Box>

            <UptimeBars
                days={p.days}
                target={is90 ? 90 : 24}
                window={p.window}
            />
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mt: 1,
                }}
            >
                <Typography sx={{ color: L.muted, fontSize: "0.74rem" }}>
                    {is90 ? "90 days ago" : "24 hours ago"}
                </Typography>
                <Typography
                    sx={{
                        color: L.muted,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                    }}
                >
                    {!p.seriesAvailable
                        ? "history unavailable"
                        : p.total > 0
                          ? `${p.uptimePct.toFixed(2)}% uptime`
                          : "no traffic"}
                </Typography>
                <Typography sx={{ color: L.muted, fontSize: "0.74rem" }}>
                    {is90 ? "Today" : "Now"}
                </Typography>
            </Box>
        </Box>
    );
}

export default function StatusView({ initial }: { initial: StatusPayload }) {
    const [data, setData] = useState<StatusPayload>(initial);
    const [refreshing, setRefreshing] = useState(false);
    const [cooling, setCooling] = useState(false);

    // On mount: prefer a still-fresh localStorage cache (avoids re-reading the
    // server within the TTL); otherwise seed the cache from the SSR payload,
    // which is itself fresh at first paint.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const c = JSON.parse(raw) as {
                    ts: number;
                    data: StatusPayload;
                };
                if (c?.data && Date.now() - c.ts < LS_TTL) {
                    setData(c.data);
                    return;
                }
            }
            localStorage.setItem(
                LS_KEY,
                JSON.stringify({ ts: Date.now(), data: initial }),
            );
        } catch {
            // localStorage unavailable (private mode / SSR) — ignore.
        }
    }, [initial]);

    // Refresh bypasses localStorage and pulls the JSON feed; rate-limited to one
    // call per cooldown window. (The server KV cache still applies.)
    const refresh = useCallback(async () => {
        if (refreshing || cooling) return;
        setRefreshing(true);
        try {
            const res = await fetch("/api/status", { cache: "no-store" });
            if (res.ok) {
                const fresh = (await res.json()) as StatusPayload;
                setData(fresh);
                try {
                    localStorage.setItem(
                        LS_KEY,
                        JSON.stringify({ ts: Date.now(), data: fresh }),
                    );
                } catch {}
            }
        } catch {
            // network hiccup — keep showing the last good data.
        } finally {
            setRefreshing(false);
            setCooling(true);
            setTimeout(() => setCooling(false), REFRESH_COOLDOWN);
        }
    }, [refreshing, cooling]);

    const { products, changelogs, fetchedAt } = data;
    const monitoringAvailable = data.monitoringAvailable !== false;

    const worst: Health = products.some((p) => p.health === "outage")
        ? "outage"
        : products.some((p) => p.health === "degraded")
          ? "degraded"
          : "operational";
    const allOk = monitoringAvailable && worst === "operational";
    const counts = {
        operational: products.filter((p) => p.health === "operational").length,
        degraded: products.filter((p) => p.health === "degraded").length,
        outage: products.filter((p) => p.health === "outage").length,
        observed: products.filter((p) => p.total > 0).length,
    };

    // The base platform (elixpo.com, 90-day history) renders as a distinct hero
    // card; everything else stacks below it.
    const base = products.find((p) => p.window === "90d");
    const rest = products.filter((p) => p !== base);

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ minHeight: "100dvh", bgcolor: L.bg, color: L.text }}>
                <Box
                    sx={{
                        maxWidth: 1180,
                        mx: "auto",
                        px: { xs: 2, md: 3 },
                        py: { xs: 2, md: 4 },
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            mb: { xs: 2.5, md: 3.5 },
                            flexWrap: "wrap",
                            gap: 2,
                            minHeight: 68,
                            px: { xs: 1.5, md: 2 },
                            py: 1,
                            border: `1px solid ${L.border}`,
                            borderRadius: "999px",
                            bgcolor: "rgba(255,255,255,.9)",
                            boxShadow: "0 14px 40px rgba(20,32,24,.07)",
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                            }}
                        >
                            <Box
                                component="img"
                                src="/icon.png"
                                alt="Elixpo"
                                sx={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: "7px",
                                }}
                            />
                            <Typography
                                sx={{
                                    fontWeight: 800,
                                    fontSize: "1.05rem",
                                    letterSpacing: "-0.02em",
                                }}
                            >
                                Elixpo Status
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                display: { xs: "none", sm: "flex" },
                                alignItems: "center",
                                gap: { sm: 1.5, md: 2.25 },
                                fontSize: "0.76rem",
                                fontWeight: 700,
                            }}
                        >
                            <Box
                                component="a"
                                href="#services"
                                sx={{ color: L.text, textDecoration: "none" }}
                            >
                                Services
                            </Box>
                            <Box
                                component="a"
                                href="#changes"
                                sx={{ color: L.text, textDecoration: "none" }}
                            >
                                Changes
                            </Box>
                            <Box
                                component="a"
                                href={REPO}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ color: L.text, textDecoration: "none" }}
                            >
                                Source ↗
                            </Box>
                            <Box
                                component="a"
                                href="https://elixpo.com"
                                sx={{
                                    px: 2,
                                    py: 1.15,
                                    borderRadius: "999px",
                                    bgcolor: L.text,
                                    color: "#fff",
                                    textDecoration: "none",
                                }}
                            >
                                Elixpo.com ↗
                            </Box>
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            position: "relative",
                            minHeight: { xs: 390, md: 430 },
                            mb: 2,
                            borderRadius: { xs: "22px", md: "30px" },
                            overflow: "hidden",
                            bgcolor: allOk
                                ? "#0d5039"
                                : !monitoringAvailable
                                  ? "#43524a"
                                  : worst === "outage"
                                    ? "#76291f"
                                    : "#775017",
                            color: "#fff",
                            border: "1px solid rgba(20,32,24,.18)",
                        }}
                    >
                        <Box
                            sx={{
                                position: "absolute",
                                width: { xs: 330, md: 520 },
                                height: { xs: 330, md: 520 },
                                right: { xs: -190, md: -80 },
                                top: { xs: 20, md: -160 },
                                border: "1px solid rgba(255,255,255,.24)",
                                borderRadius: "50%",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    width: "42%",
                                    height: "42%",
                                    left: "13%",
                                    bottom: "8%",
                                    borderRadius: "41% 59% 62% 38%",
                                    bgcolor: allOk ? "#6eb492" : "#edb24e",
                                    transform: "rotate(24deg)",
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    width: "18%",
                                    height: "48%",
                                    left: "-9%",
                                    top: "38%",
                                    border: "1px solid rgba(255,255,255,.35)",
                                    borderRadius: "999px",
                                    transform: "rotate(43deg)",
                                },
                            }}
                        />
                        <Box
                            sx={{
                                position: "relative",
                                zIndex: 2,
                                minHeight: { xs: 315, md: 350 },
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                px: { xs: 2.5, md: 5 },
                                py: { xs: 4, md: 5 },
                            }}
                        >
                            <Typography
                                sx={{
                                    mb: 2,
                                    font: "700 .68rem/1.4 var(--font-geist-mono)",
                                    letterSpacing: ".17em",
                                    textTransform: "uppercase",
                                    opacity: 0.72,
                                }}
                            >
                                Public service health / live
                            </Typography>
                            <Typography
                                component="h1"
                                sx={{
                                    maxWidth: 760,
                                    m: 0,
                                    fontSize: {
                                        xs: "3.4rem",
                                        sm: "4.7rem",
                                        md: "6.2rem",
                                    },
                                    fontWeight: 650,
                                    lineHeight: 0.9,
                                    letterSpacing: "-.065em",
                                }}
                            >
                                {!monitoringAvailable
                                    ? "Live monitoring is temporarily unavailable."
                                    : allOk
                                      ? "All systems are operational."
                                      : worst === "outage"
                                        ? "Some services are unavailable."
                                        : "Some services are degraded."}
                            </Typography>
                            <Typography
                                sx={{
                                    maxWidth: 650,
                                    mt: 2.5,
                                    mb: 0,
                                    color: "rgba(255,255,255,.76)",
                                    fontSize: { xs: ".92rem", md: "1.03rem" },
                                    lineHeight: 1.65,
                                }}
                            >
                                {monitoringAvailable
                                    ? "This page reports observed request health across Elixpo's public services using Cloudflare edge analytics. An idle service has no recent traffic and is not classified as an outage."
                                    : "The service directory remains available while live analytics recover. No operational conclusion is shown when the monitoring source cannot be reached."}
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                position: "relative",
                                zIndex: 3,
                                minHeight: 74,
                                px: { xs: 2.5, md: 5 },
                                py: 1.5,
                                borderTop: "1px solid rgba(255,255,255,.18)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 2,
                                flexWrap: "wrap",
                                bgcolor: "rgba(0,0,0,.08)",
                            }}
                        >
                            <Typography
                                sx={{
                                    color: "rgba(255,255,255,.72)",
                                    fontSize: ".78rem",
                                }}
                            >
                                Last observed{" "}
                                {new Date(fetchedAt).toLocaleString()}
                            </Typography>
                            <Box
                                component="button"
                                onClick={refresh}
                                disabled={refreshing || cooling}
                                title={
                                    cooling
                                        ? "Please wait a few seconds"
                                        : "Fetch the latest status"
                                }
                                sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.75,
                                    px: 1.5,
                                    py: 0.75,
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,.3)",
                                    bgcolor: "rgba(255,255,255,.1)",
                                    color: "#fff",
                                    font: "inherit",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                    cursor:
                                        refreshing || cooling
                                            ? "not-allowed"
                                            : "pointer",
                                    opacity: refreshing || cooling ? 0.55 : 1,
                                    transition: "background 0.12s",
                                    "&:hover": {
                                        bgcolor: "rgba(255,255,255,.18)",
                                    },
                                }}
                            >
                                <Refresh
                                    sx={{
                                        fontSize: "1rem",
                                        animation: refreshing
                                            ? "elxspin 0.8s linear infinite"
                                            : "none",
                                        "@keyframes elxspin": {
                                            from: { transform: "rotate(0deg)" },
                                            to: { transform: "rotate(360deg)" },
                                        },
                                    }}
                                />
                                {refreshing ? "Refreshing…" : "Refresh"}
                            </Box>
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr 1fr",
                                md: "repeat(4,1fr)",
                            },
                            mb: { xs: 4, md: 6 },
                            border: `1px solid ${L.border}`,
                            borderRadius: "18px",
                            overflow: "hidden",
                            bgcolor: L.card,
                        }}
                    >
                        {[
                            [String(products.length), "Tracked services"],
                            [String(counts.operational), "Operational"],
                            [String(counts.observed), "Reporting traffic"],
                            [
                                String(counts.degraded + counts.outage),
                                "Need attention",
                            ],
                        ].map(([value, label], index) => (
                            <Box
                                key={label}
                                sx={{
                                    p: { xs: 2, md: 2.5 },
                                    borderLeft: {
                                        md: index ? `1px solid ${L.border}` : 0,
                                    },
                                    borderTop: {
                                        xs:
                                            index > 1
                                                ? `1px solid ${L.border}`
                                                : 0,
                                        md: 0,
                                    },
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "1.8rem",
                                        fontWeight: 750,
                                        letterSpacing: "-.04em",
                                    }}
                                >
                                    {value}
                                </Typography>
                                <Typography
                                    sx={{
                                        mt: 0.35,
                                        color: L.muted,
                                        fontSize: ".74rem",
                                    }}
                                >
                                    {label}
                                </Typography>
                            </Box>
                        ))}
                    </Box>

                    {/* base platform — distinct hero card */}
                    {base && (
                        <Box sx={{ mb: 4 }}>
                            <ServiceCard p={base} hero />
                        </Box>
                    )}

                    {/* per-service cards */}
                    <Typography
                        id="services"
                        sx={{ fontWeight: 700, fontSize: "0.95rem", mb: 1.5 }}
                    >
                        Services
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            gap: 1.5,
                        }}
                    >
                        {rest.map((p) => (
                            <ServiceCard key={p.domain || p.label} p={p} />
                        ))}
                    </Box>

                    {/* recent changes (from gist changelogs) */}
                    {changelogs.length > 0 && (
                        <>
                            <Box
                                id="changes"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    mt: 4,
                                    mb: 1.5,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "0.95rem",
                                    }}
                                >
                                    Recent changes
                                </Typography>
                                <Box
                                    component="a"
                                    href="https://gist.github.com/elixpoo"
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{
                                        color: L.muted,
                                        fontSize: "0.78rem",
                                        textDecoration: "none",
                                        "&:hover": { color: L.text },
                                    }}
                                >
                                    All changelogs →
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    bgcolor: L.card,
                                    border: `1px solid ${L.border}`,
                                    borderRadius: "10px",
                                    overflow: "hidden",
                                }}
                            >
                                {changelogs.map((c, i) => (
                                    <Box
                                        key={c.url}
                                        component="a"
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 2,
                                            px: 2.5,
                                            py: 1.5,
                                            textDecoration: "none",
                                            borderTop:
                                                i === 0
                                                    ? "none"
                                                    : `1px solid ${L.border}`,
                                            "&:hover": { bgcolor: "#faf9f7" },
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1.25,
                                                minWidth: 0,
                                            }}
                                        >
                                            <GitHub
                                                sx={{
                                                    fontSize: "1rem",
                                                    color: L.muted,
                                                }}
                                            />
                                            <Typography
                                                sx={{
                                                    color: L.text,
                                                    fontSize: "0.88rem",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {c.project}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    color: L.muted,
                                                    fontSize: "0.8rem",
                                                }}
                                            >
                                                changelog updated
                                            </Typography>
                                        </Box>
                                        <Typography
                                            sx={{
                                                color: L.muted,
                                                fontSize: "0.78rem",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {relTime(c.updatedAt)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </>
                    )}

                    {/* footer */}
                    <Box sx={{ mt: 4, textAlign: "center" }}>
                        <Box
                            component="a"
                            href={`${REPO}/issues/new`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 1,
                                color: L.muted,
                                textDecoration: "none",
                                fontSize: "0.82rem",
                                "&:hover": { color: L.text },
                            }}
                        >
                            <OpenInNew sx={{ fontSize: "1rem" }} />
                            Every Elixpo service is open source — report an
                            issue
                        </Box>
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}
