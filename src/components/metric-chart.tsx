"use client";

/**
 * Dependency-free time-series chart (SVG area + gridlines). Flat professional
 * styling (blue accent, subtle grid) modeled on Cloudflare's analytics charts.
 */

import { C, CHART } from "@/components/ui";
import { fmt } from "@/lib/format";
import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";

export interface ChartSeries {
    key: string;
    label: string;
    color?: string;
}

export interface MetricPoint {
    ts: string;
    [k: string]: number | string;
}

const PALETTE = CHART;

export default function MetricChart({
    points,
    series,
    height = 200,
    unit,
}: {
    points: MetricPoint[];
    series: ChartSeries[];
    height?: number;
    unit?: string;
}) {
    const W = 600;
    const H = height;
    const PAD = { top: 10, right: 4, bottom: 18, left: 4 };

    const [hover, setHover] = useState<number | null>(null);

    const { paths, max, labels, gridLevels, cols } = useMemo(() => {
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;
        const n = points.length;
        let max = 0;
        for (const p of points)
            for (const s of series) max = Math.max(max, Number(p[s.key]) || 0);
        if (max <= 0) max = 1;

        const x = (i: number) =>
            PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
        const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

        const paths = series.map((s, si) => {
            const color = s.color || PALETTE[si % PALETTE.length];
            let line = "";
            points.forEach((p, i) => {
                line += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(Number(p[s.key]) || 0).toFixed(1)} `;
            });
            const area =
                n > 0
                    ? `${line}L${x(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
                    : "";
            const total = points.reduce(
                (a, p) => a + (Number(p[s.key]) || 0),
                0,
            );
            return { color, line, area, label: s.label, total };
        });

        const gridLevels = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
            y: PAD.top + innerH - f * innerH,
            val: max * f,
        }));
        const labels =
            n > 0
                ? [
                      new Date(points[0].ts).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                      }),
                      new Date(points[n - 1].ts).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                      }),
                  ]
                : ["", ""];

        const cols = series.map((s, si) => ({
            key: s.key,
            label: s.label,
            color: s.color || PALETTE[si % PALETTE.length],
        }));

        return { paths, max, labels, gridLevels, cols };
    }, [points, series, H]);

    if (!points.length) {
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 4,
                    textAlign: "center",
                }}
            >
                No data in this window.
            </Typography>
        );
    }

    return (
        <Box>
            <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
                {paths.map((p) => (
                    <Box
                        key={p.label}
                        sx={{ display: "flex", alignItems: "center", gap: 0.6 }}
                    >
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "2px",
                                bgcolor: p.color,
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.72rem", color: C.textDim }}
                        >
                            {p.label}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 600, ml: 0.5 }}
                            >
                                {p.total >= 1000
                                    ? `${(p.total / 1000).toFixed(1)}k`
                                    : p.total.toLocaleString()}
                                {unit ? ` ${unit}` : ""}
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Box
                sx={{ position: "relative" }}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(
                        1,
                        Math.max(0, (e.clientX - rect.left) / rect.width),
                    );
                    setHover(Math.round(ratio * (points.length - 1)));
                }}
                onMouseLeave={() => setHover(null)}
            >
                {hover !== null && points[hover] && (
                    <>
                        {/* crosshair */}
                        <Box
                            sx={{
                                position: "absolute",
                                top: 0,
                                bottom: 18,
                                left: `${(hover / Math.max(1, points.length - 1)) * 100}%`,
                                width: "1px",
                                bgcolor: C.borderLight,
                                pointerEvents: "none",
                            }}
                        />
                        {/* tooltip */}
                        <Box
                            sx={{
                                position: "absolute",
                                top: 4,
                                left: `${(hover / Math.max(1, points.length - 1)) * 100}%`,
                                transform:
                                    hover > points.length / 2
                                        ? "translateX(-104%)"
                                        : "translateX(4%)",
                                zIndex: 3,
                                pointerEvents: "none",
                                bgcolor: "rgba(15,17,26,0.96)",
                                border: `1px solid ${C.border}`,
                                borderRadius: "8px",
                                px: 1,
                                py: 0.75,
                                minWidth: 110,
                            }}
                        >
                            <Typography
                                sx={{
                                    fontSize: "0.64rem",
                                    color: C.textMuted,
                                    mb: 0.5,
                                }}
                            >
                                {new Date(points[hover].ts).toLocaleString(
                                    "en-US",
                                    {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                    },
                                )}
                            </Typography>
                            {cols.map((c) => (
                                <Box
                                    key={c.key}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 1.5,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: "2px",
                                                bgcolor: c.color,
                                            }}
                                        />
                                        <Typography
                                            sx={{
                                                fontSize: "0.68rem",
                                                color: C.textDim,
                                            }}
                                        >
                                            {c.label}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        sx={{
                                            fontSize: "0.7rem",
                                            color: C.text,
                                            fontWeight: 600,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {(
                                            Number(points[hover][c.key]) || 0
                                        ).toLocaleString()}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </>
                )}
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width="100%"
                    height={H}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="metric chart"
                >
                    <defs>
                        {paths.map((p, i) => (
                            <linearGradient
                                key={i}
                                id={`mc-${i}-${p.color.replace("#", "")}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={p.color}
                                    stopOpacity="0.22"
                                />
                                <stop
                                    offset="100%"
                                    stopColor={p.color}
                                    stopOpacity="0"
                                />
                            </linearGradient>
                        ))}
                    </defs>
                    {gridLevels.map((g, i) => (
                        <line
                            key={i}
                            x1={PAD.left}
                            y1={g.y}
                            x2={W - PAD.right}
                            y2={g.y}
                            stroke={C.border}
                            strokeWidth="1"
                            strokeDasharray="2 5"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {paths.map((p, i) => (
                        <g key={i}>
                            <path
                                d={p.area}
                                fill={`url(#mc-${i}-${p.color.replace("#", "")})`}
                            />
                            <path
                                d={p.line}
                                fill="none"
                                stroke={p.color}
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </g>
                    ))}
                </svg>
                {/* y-axis numeric levels (HTML overlay — svg is x-stretched so text can't live inside) */}
                {gridLevels.map((g, i) => (
                    <Typography
                        key={i}
                        sx={{
                            position: "absolute",
                            right: 2,
                            top: `${g.y}px`,
                            transform: "translateY(-50%)",
                            fontSize: "0.6rem",
                            color: C.textMuted,
                            bgcolor: "rgba(11,13,18,0.5)",
                            px: 0.5,
                            borderRadius: "3px",
                            pointerEvents: "none",
                        }}
                    >
                        {fmt(g.val)}
                    </Typography>
                ))}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mt: 0.5,
                }}
            >
                <Typography sx={{ fontSize: "0.66rem", color: C.textMuted }}>
                    {labels[0]}
                </Typography>
                <Typography sx={{ fontSize: "0.66rem", color: C.textMuted }}>
                    peak {max >= 1000 ? `${(max / 1000).toFixed(1)}k` : max}
                </Typography>
                <Typography sx={{ fontSize: "0.66rem", color: C.textMuted }}>
                    {labels[1]}
                </Typography>
            </Box>
        </Box>
    );
}
