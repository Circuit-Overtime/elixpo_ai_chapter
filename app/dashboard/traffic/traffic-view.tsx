"use client";

import ExpandableGlobe from "@/components/expandable-globe";
import MetricChart from "@/components/metric-chart";
import {
    C,
    Donut,
    Empty,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
    StatusBar,
    TopList,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import type { MetricSeries, ZoneBreakdown } from "@/lib/metrics";
import { Box, Typography } from "@mui/material";

export interface ZoneData {
    name: string;
    id: string;
    traffic: MetricSeries;
    breakdown: ZoneBreakdown;
}

export default function TrafficView({ zones }: { zones: ZoneData[] }) {
    return (
        <Box>
            <PageHeader
                title="Traffic"
                subtitle="HTTP analytics across all zones"
                timeRange
            />
            {zones.length === 0 && <Empty message="No zones found." />}
            {zones.map((z) => (
                <ZoneBlock key={z.id} z={z} />
            ))}
        </Box>
    );
}

function ZoneBlock({ z }: { z: ZoneData }) {
    const t = z.traffic;
    const b = z.breakdown;
    const reqSpark = t.points.map((p) => Number(p.requests) || 0);
    const bytSpark = t.points.map((p) => Number(p.bytes) || 0);
    const peak = Math.max(...reqSpark, 0);

    return (
        <Box sx={{ mb: 4 }}>
            <Typography
                sx={{
                    color: C.accentLight,
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    mb: 1.5,
                }}
            >
                {z.name}
            </Typography>

            {!t.available ? (
                <SectionError
                    message={`Zone analytics unavailable: ${t.error}`}
                />
            ) : (
                <>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(210px, 1fr))",
                            gap: 1.5,
                            mb: 1.5,
                        }}
                    >
                        <KpiTile
                            label="Total requests"
                            value={fmt(t.totals.requests || 0)}
                            delta={trend(reqSpark)}
                            spark={reqSpark}
                            color={C.accent}
                        />
                        <KpiTile
                            label="Bandwidth"
                            value={fmtBytes(t.totals.bytes || 0)}
                            spark={bytSpark}
                            color={C.accentLight}
                        />
                        <KpiTile
                            label="Peak / hr"
                            value={fmt(peak)}
                            spark={reqSpark}
                            color={C.accentDeep}
                        />
                        <KpiTile
                            label="Countries"
                            value={b.country.length}
                            sub="distinct in window"
                            spark={b.country.slice(0, 12).map((c) => c.count)}
                            color="#5fb6ff"
                        />
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                        <Panel title="Requests over time">
                            <MetricChart
                                points={t.points}
                                series={[
                                    {
                                        key: "requests",
                                        label: "Requests",
                                        color: "#9b7bf7",
                                    },
                                    {
                                        key: "bytes",
                                        label: "Bytes",
                                        color: "#5fb6ff",
                                    },
                                ]}
                                height={220}
                            />
                        </Panel>
                    </Box>

                    {b.available && (
                        <>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: {
                                        xs: "1fr",
                                        lg: "1.7fr 1fr",
                                    },
                                    gap: 1.5,
                                    mb: 1.5,
                                }}
                            >
                                <Panel title="Requests by country">
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: {
                                                xs: "1fr",
                                                sm: "auto 1fr",
                                            },
                                            gap: 2,
                                            alignItems: "center",
                                        }}
                                    >
                                        <ExpandableGlobe
                                            country={b.country}
                                            size={300}
                                        />
                                        <TopList
                                            items={b.country
                                                .slice(0, 9)
                                                .map((c) => ({
                                                    label: c.label,
                                                    value: c.count,
                                                }))}
                                        />
                                    </Box>
                                </Panel>
                                <Panel title="Requests by device">
                                    {b.device.length ? (
                                        <Donut
                                            size={180}
                                            data={b.device.map((d) => ({
                                                label: d.label || "unknown",
                                                value: d.count,
                                            }))}
                                        />
                                    ) : (
                                        <Empty message="No device data." />
                                    )}
                                </Panel>
                            </Box>

                            {/* Status Codes — grouped stacked bar (full width) */}
                            <Box sx={{ mb: 1.5 }}>
                                <Panel title="Status Codes">
                                    <StatusBar status={b.status} />
                                </Panel>
                            </Box>

                            {/* Top Paths | Top Hosts | Top IPs */}
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(320px, 1fr))",
                                    gap: 1.5,
                                    mb: 1.5,
                                }}
                            >
                                <Panel title="Top Paths" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.path.slice(0, 12).map((p) => ({
                                            label: p.label,
                                            value: p.count,
                                        }))}
                                    />
                                </Panel>
                                <Panel title="Top Hosts" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.host.slice(0, 12).map((h) => ({
                                            label: h.label,
                                            value: h.count,
                                        }))}
                                    />
                                </Panel>
                                <Panel title="Top IPs" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.ip.slice(0, 12).map((x) => ({
                                            label: x.label || "—",
                                            value: x.count,
                                        }))}
                                    />
                                </Panel>
                            </Box>

                            {/* Top Browsers | Top Operating Systems | Top User Agents */}
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(320px, 1fr))",
                                    gap: 1.5,
                                    mb: 1.5,
                                }}
                            >
                                <Panel title="Top Browsers" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.browser
                                            .slice(0, 12)
                                            .map((x) => ({
                                                label: x.label || "—",
                                                value: x.count,
                                            }))}
                                    />
                                </Panel>
                                <Panel title="Top Operating Systems" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.os.slice(0, 12).map((x) => ({
                                            label: x.label || "—",
                                            value: x.count,
                                        }))}
                                    />
                                </Panel>
                                <Panel title="Top User Agents" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.userAgent
                                            .slice(0, 12)
                                            .map((x) => ({
                                                label:
                                                    x.label ||
                                                    "(empty user agent)",
                                                value: x.count,
                                            }))}
                                    />
                                </Panel>
                            </Box>

                            {/* HTTP & TLS versions */}
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(320px, 1fr))",
                                    gap: 1.5,
                                }}
                            >
                                <Panel title="HTTP versions" dense>
                                    <TopList
                                        color={C.accentLight}
                                        items={b.httpProtocol
                                            .slice(0, 8)
                                            .map((x) => ({
                                                label: x.label || "—",
                                                value: x.count,
                                            }))}
                                    />
                                </Panel>
                                <Panel title="TLS versions" dense>
                                    <TopList
                                        color={C.accentDeep}
                                        items={b.tls.slice(0, 8).map((x) => ({
                                            label: x.label || "—",
                                            value: x.count,
                                        }))}
                                    />
                                </Panel>
                            </Box>

                            {/* Cache status + Origin status codes */}
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(320px, 1fr))",
                                    gap: 1.5,
                                    mt: 1.5,
                                }}
                            >
                                <Panel title="Cache status" dense>
                                    <TopList
                                        color={C.accent}
                                        items={b.cacheStatus
                                            .slice(0, 8)
                                            .map((x) => ({
                                                label: x.label || "—",
                                                value: x.count,
                                            }))}
                                    />
                                </Panel>
                                <Panel title="Origin status codes">
                                    <StatusBar status={b.originStatus} />
                                </Panel>
                            </Box>
                        </>
                    )}
                </>
            )}
        </Box>
    );
}
