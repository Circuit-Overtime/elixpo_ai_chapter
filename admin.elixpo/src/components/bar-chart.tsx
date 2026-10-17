"use client";

/** Vertical bar chart with value labels + hover highlight. Used for categorical
 * breakdowns (status code classes, device types) where a bar reads clearer than
 * a stacked bar or donut. */

import { C, CHART } from "@/components/ui";
import { fmt } from "@/lib/format";
import { Box, Typography } from "@mui/material";
import { useState } from "react";

export interface Bar {
    label: string;
    value: number;
    color?: string;
}

export default function BarChart({
    data,
    height = 200,
}: { data: Bar[]; height?: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(...data.map((d) => d.value), 1);
    if (!data.length) {
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 4,
                    textAlign: "center",
                }}
            >
                No data.
            </Typography>
        );
    }
    const total = data.reduce((a, d) => a + d.value, 0) || 1;

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 1.5,
                    height,
                    px: 0.5,
                }}
            >
                {data.map((d, i) => {
                    const color = d.color || CHART[i % CHART.length];
                    const h = Math.max(2, (d.value / max) * (height - 28));
                    const active = hover === i;
                    return (
                        <Box
                            key={d.label}
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                            sx={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                height: "100%",
                                cursor: "default",
                                minWidth: 0,
                            }}
                        >
                            <Typography
                                sx={{
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    color: active ? C.text : C.textDim,
                                    mb: 0.5,
                                }}
                            >
                                {fmt(d.value)}
                            </Typography>
                            <Box
                                sx={{
                                    width: "100%",
                                    maxWidth: 64,
                                    height: `${h}px`,
                                    borderRadius: "6px 6px 0 0",
                                    background: `linear-gradient(180deg, ${color} 0%, ${color}99 100%)`,
                                    opacity:
                                        hover === null || active ? 1 : 0.45,
                                    boxShadow: active
                                        ? `0 0 16px ${color}88`
                                        : "none",
                                    transition:
                                        "opacity 0.15s, box-shadow 0.15s",
                                }}
                            />
                        </Box>
                    );
                })}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 1.5,
                    px: 0.5,
                    mt: 0.75,
                    borderTop: `1px solid ${C.border}`,
                    pt: 0.75,
                }}
            >
                {data.map((d, i) => {
                    const color = d.color || CHART[i % CHART.length];
                    return (
                        <Box
                            key={d.label}
                            sx={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                minWidth: 0,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    maxWidth: "100%",
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "2px",
                                        bgcolor: color,
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontSize: "0.72rem",
                                        color: C.textDim,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {d.label}
                                </Typography>
                            </Box>
                            <Typography
                                sx={{ fontSize: "0.64rem", color: C.textMuted }}
                            >
                                {((d.value / total) * 100).toFixed(0)}%
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

/** Group raw status-code dimensions into 2xx/3xx/4xx/5xx bars. */
export function statusBars(status: { label: string; count: number }[]): Bar[] {
    const classes = [
        { label: "2xx", color: "#4593ff", lo: 200, hi: 300 },
        { label: "3xx", color: "#fbbf24", lo: 300, hi: 400 },
        { label: "4xx", color: "#f472b6", lo: 400, hi: 500 },
        { label: "5xx", color: "#a855f7", lo: 500, hi: 600 },
    ];
    return classes.map((c) => ({
        label: c.label,
        color: c.color,
        value: status
            .filter((s) => Number(s.label) >= c.lo && Number(s.label) < c.hi)
            .reduce((a, s) => a + s.count, 0),
    }));
}
