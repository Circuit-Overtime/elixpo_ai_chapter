"use client";

import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { MetricSeries } from "@/lib/metrics";
import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";

export default function KvDetailView({
    id,
    title,
    metrics,
}: {
    id: string;
    title: string;
    metrics: MetricSeries;
}) {
    const totalOps = Object.values(metrics.totals).reduce((a, b) => a + b, 0);
    const series = Object.keys(metrics.totals).map((k) => ({
        key: k,
        label: k,
    }));

    return (
        <Box>
            <PageHeader
                title={title}
                subtitle={`KV namespace · ${id}`}
                timeRange
            />

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 1.5,
                    mb: 1.5,
                }}
            >
                <KpiTile
                    label="Operations · window"
                    value={fmt(totalOps)}
                    color={C.accent}
                />
                {Object.entries(metrics.totals).map(([k, v]) => (
                    <KpiTile
                        key={k}
                        label={k}
                        value={fmt(v)}
                        color={C.accentLight}
                    />
                ))}
            </Box>

            <Box sx={{ mb: 1.5 }}>
                <Panel title="KV operations over time">
                    {metrics.available ? (
                        series.length > 0 ? (
                            <MetricChart
                                points={metrics.points}
                                series={series}
                                height={200}
                            />
                        ) : (
                            <Empty message="No KV operations in this window." />
                        )
                    ) : (
                        <SectionError
                            message={`Metrics unavailable: ${metrics.error}`}
                        />
                    )}
                </Panel>
            </Box>

            <Panel title="Key browser">
                <KeyBrowser id={id} />
            </Panel>
        </Box>
    );
}

function KeyBrowser({ id }: { id: string }) {
    const [keys, setKeys] = useState<{ name: string }[] | null>(null);
    const [prefix, setPrefix] = useState("");
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState<string | null>(null);
    const [value, setValue] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const load = async (p = "") => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(
                `/api/cf/kv/${id}/keys${p ? `?prefix=${encodeURIComponent(p)}` : ""}`,
            );
            const body = (await res.json()) as {
                keys?: { name: string }[];
                error?: string;
            };
            if (!res.ok) setErr(body.error || `Error ${res.status}`);
            else setKeys(body.keys || []);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: load on mount only
    useEffect(() => {
        load("");
    }, []);

    const openKey = async (name: string) => {
        setActive(name);
        setValue(null);
        const res = await fetch(
            `/api/cf/kv/${id}/value?key=${encodeURIComponent(name)}`,
        );
        const body = (await res.json()) as {
            value?: string | null;
            error?: string;
        };
        setValue(
            body.error ? `Error: ${body.error}` : (body.value ?? "(null)"),
        );
    };

    return (
        <Box>
            <Box sx={{ display: "flex", gap: 1, mb: 1.25 }}>
                <Box
                    component="input"
                    value={prefix}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setPrefix(e.target.value)
                    }
                    onKeyDown={(e: React.KeyboardEvent) =>
                        e.key === "Enter" && load(prefix)
                    }
                    placeholder="Key prefix filter…"
                    sx={{
                        flex: 1,
                        bgcolor: "rgba(0,0,0,0.3)",
                        border: `1px solid ${C.border}`,
                        borderRadius: "8px",
                        px: 1.25,
                        py: 0.75,
                        color: C.text,
                        fontSize: "0.82rem",
                        fontFamily: "var(--font-geist-mono), monospace",
                        outline: "none",
                        "&:focus": { borderColor: C.accent },
                    }}
                />
            </Box>
            {err && <SectionError message={err} />}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 1.5,
                }}
            >
                <Box
                    sx={{
                        maxHeight: 380,
                        overflowY: "auto",
                        border: `1px solid ${C.border}`,
                        borderRadius: "8px",
                    }}
                >
                    {loading && <Empty message="Loading…" />}
                    {keys && keys.length === 0 && <Empty message="No keys." />}
                    {keys?.map((k) => (
                        <Box
                            key={k.name}
                            onClick={() => openKey(k.name)}
                            sx={{
                                px: 1.25,
                                py: 0.75,
                                cursor: "pointer",
                                borderBottom: `1px solid ${C.border}`,
                                fontFamily: "var(--font-geist-mono), monospace",
                                fontSize: "0.78rem",
                                color:
                                    active === k.name
                                        ? C.accentLight
                                        : C.textDim,
                                bgcolor:
                                    active === k.name
                                        ? C.accentDim
                                        : "transparent",
                                "&:hover": {
                                    bgcolor: "rgba(255,255,255,0.04)",
                                    color: C.text,
                                },
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {k.name}
                        </Box>
                    ))}
                </Box>
                <Box
                    sx={{
                        border: `1px solid ${C.border}`,
                        borderRadius: "8px",
                        p: 1.25,
                        minHeight: 120,
                    }}
                >
                    {active ? (
                        <>
                            <Typography
                                sx={{
                                    color: C.accentLight,
                                    fontSize: "0.76rem",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    mb: 0.75,
                                    wordBreak: "break-all",
                                }}
                            >
                                {active}
                            </Typography>
                            <Box
                                component="pre"
                                sx={{
                                    m: 0,
                                    color: C.text,
                                    fontSize: "0.76rem",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                }}
                            >
                                {value === null ? "Loading…" : value}
                            </Box>
                        </>
                    ) : (
                        <Empty message="Select a key to view its value." />
                    )}
                </Box>
            </Box>
        </Box>
    );
}
