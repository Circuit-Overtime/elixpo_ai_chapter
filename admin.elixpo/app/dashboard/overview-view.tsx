"use client";

import BarChart, { statusBars } from "@/components/bar-chart";
import ExpandableGlobe from "@/components/expandable-globe";
import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
    StatusChip,
    TopList,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import type { Inventory } from "@/lib/discovery";
import { autoLabel, metaFor } from "@/lib/enrich";
import type { MetricSeries, ZoneBreakdown } from "@/lib/metrics";
import { Warning } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";

const grid = (min: number) => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: 1.5,
});

function CompactRow({
    primary,
    secondary,
    href,
    chip,
}: {
    primary: string;
    secondary?: string;
    href?: string;
    chip?: React.ReactNode;
}) {
    const inner = (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                px: 1,
                py: 0.8,
                borderBottom: `1px solid ${C.border}`,
                "&:hover": href ? { bgcolor: C.panelHover } : undefined,
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    sx={{
                        color: C.text,
                        fontSize: "0.82rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {primary}
                </Typography>
                {secondary && (
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.7rem",
                            fontFamily: "var(--font-geist-mono), monospace",
                        }}
                    >
                        {secondary}
                    </Typography>
                )}
            </Box>
            {chip}
        </Box>
    );
    return href ? (
        <Link href={href} style={{ textDecoration: "none" }}>
            {inner}
        </Link>
    ) : (
        inner
    );
}

export default function OverviewView({
    inv,
    workers,
    traffic,
    breakdown,
    primaryZoneName,
}: {
    inv: Inventory;
    workers: MetricSeries;
    traffic: MetricSeries | null;
    breakdown: ZoneBreakdown | null;
    primaryZoneName?: string;
}) {
    const deadQueues = inv.queues.filter(
        (q) => (q.consumers_total_count ?? 0) === 0,
    );
    const failedSections = Object.entries(inv.errors).filter(
        ([, e]) => e !== null,
    ) as [string, { error: string }][];

    const wReq = workers.points.map((p) => Number(p.requests) || 0);
    const wErr = workers.points.map((p) => Number(p.errors) || 0);
    const tReq = traffic?.points.map((p) => Number(p.requests) || 0) || [];
    const tByt = traffic?.points.map((p) => Number(p.bytes) || 0) || [];

    return (
        <Box>
            <PageHeader
                title="Overview"
                subtitle={`Elixpo Cloudflare account · refreshed ${new Date(inv.fetchedAt).toLocaleTimeString()}`}
                timeRange
            />

            {deadQueues.length > 0 && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        mb: 2,
                        p: 1.25,
                        borderRadius: "6px",
                        bgcolor: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.3)",
                    }}
                >
                    <Warning sx={{ color: C.warn, fontSize: "1.1rem" }} />
                    <Typography sx={{ color: C.warn, fontSize: "0.8rem" }}>
                        {deadQueues.length} queue
                        {deadQueues.length > 1 ? "s have" : " has"} no consumer:{" "}
                        <b>{deadQueues.map((q) => q.queue_name).join(", ")}</b>
                    </Typography>
                </Box>
            )}

            {/* KPI hero row */}
            <Box sx={{ ...grid(220), mb: 1.5 }}>
                <KpiTile
                    label={`Requests · ${primaryZoneName || "zone"}`}
                    value={
                        traffic?.available
                            ? fmt(traffic.totals.requests || 0)
                            : "—"
                    }
                    delta={trend(tReq)}
                    spark={tReq}
                    color={C.accent}
                />
                <KpiTile
                    label="Bandwidth"
                    value={
                        traffic?.available
                            ? fmtBytes(traffic.totals.bytes || 0)
                            : "—"
                    }
                    spark={tByt}
                    color="#22c55e"
                />
                <KpiTile
                    label="Worker requests"
                    value={
                        workers.available
                            ? fmt(workers.totals.requests || 0)
                            : "—"
                    }
                    delta={trend(wReq)}
                    spark={wReq}
                    color="#a855f7"
                />
                <KpiTile
                    label="Worker errors"
                    value={
                        workers.available
                            ? fmt(workers.totals.errors || 0)
                            : "—"
                    }
                    spark={wErr}
                    color={C.error}
                />
            </Box>

            {/* resource counts */}
            <Box sx={{ ...grid(150), mb: 2 }}>
                <KpiTile label="Pages" value={inv.pages.length} />
                <KpiTile
                    label="Workers"
                    value={inv.workers.length}
                    href="/dashboard/workers"
                />
                <KpiTile
                    label="D1"
                    value={inv.d1.length}
                    href="/dashboard/d1"
                />
                <KpiTile
                    label="KV"
                    value={inv.kv.length}
                    href="/dashboard/kv"
                />
                <KpiTile
                    label="Queues"
                    value={inv.queues.length}
                    href="/dashboard/queues"
                />
                <KpiTile
                    label="Durable Objects"
                    value={inv.durableObjects.length}
                    href="/dashboard/durable-objects"
                />
                <KpiTile
                    label="Workflows"
                    value={inv.workflows.length}
                    href="/dashboard/workflows"
                />
                <KpiTile
                    label="Zones"
                    value={inv.zones.length}
                    href="/dashboard/traffic"
                />
            </Box>

            {/* charts */}
            <Box sx={{ ...grid(440), mb: 2 }}>
                <Panel title={`Requests over time · ${primaryZoneName || ""}`}>
                    {traffic ? (
                        traffic.available ? (
                            <MetricChart
                                points={traffic.points}
                                series={[
                                    {
                                        key: "requests",
                                        label: "Requests",
                                        color: C.accent,
                                    },
                                ]}
                            />
                        ) : (
                            <SectionError
                                message={`Zone analytics unavailable: ${traffic.error}`}
                            />
                        )
                    ) : (
                        <Empty message="No zones discovered." />
                    )}
                </Panel>
                <Panel title="Workers invocations · all scripts">
                    {workers.available ? (
                        <MetricChart
                            points={workers.points}
                            series={[
                                {
                                    key: "requests",
                                    label: "Requests",
                                    color: "#a855f7",
                                },
                                {
                                    key: "errors",
                                    label: "Errors",
                                    color: C.error,
                                },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Metrics unavailable: ${workers.error}`}
                        />
                    )}
                </Panel>
            </Box>

            {/* geo + breakdowns — fills the row Cloudflare uses for the globe */}
            {breakdown?.available && (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", lg: "1.4fr 1fr 1fr" },
                        gap: 1.5,
                        mb: 2,
                    }}
                >
                    <Panel
                        title={`Requests by country · ${primaryZoneName || ""}`}
                    >
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
                                country={breakdown.country}
                                size={300}
                            />
                            <TopList
                                color={C.accent}
                                items={breakdown.country
                                    .slice(0, 8)
                                    .map((c) => ({
                                        label: c.label,
                                        value: c.count,
                                    }))}
                            />
                        </Box>
                    </Panel>
                    <Panel title="Status Codes">
                        <BarChart
                            data={statusBars(breakdown.status)}
                            height={190}
                        />
                    </Panel>
                    <Panel title="Requests by device">
                        {breakdown.device.length ? (
                            <BarChart
                                data={breakdown.device.map((d) => ({
                                    label: d.label || "unknown",
                                    value: d.count,
                                }))}
                                height={190}
                            />
                        ) : (
                            <Empty message="No device data." />
                        )}
                    </Panel>
                </Box>
            )}

            {/* top hosts + paths */}
            {breakdown?.available && (
                <Box sx={{ ...grid(360), mb: 2 }}>
                    <Panel title="Top hosts">
                        <TopList
                            color={C.accentDeep}
                            items={breakdown.host.slice(0, 8).map((h) => ({
                                label: h.label,
                                value: h.count,
                            }))}
                        />
                    </Panel>
                    <Panel title="Top paths">
                        <TopList
                            color="#86efac"
                            items={breakdown.path.slice(0, 8).map((p) => ({
                                label: p.label,
                                value: p.count,
                            }))}
                        />
                    </Panel>
                </Box>
            )}

            {/* discovery-driven resource lists */}
            <Box sx={grid(340)}>
                <Panel title={`Pages projects · ${inv.pages.length}`} dense>
                    {inv.pages.length ? (
                        inv.pages.map((p) => {
                            const domain =
                                p.domains?.find(
                                    (d) => !d.endsWith(".pages.dev"),
                                ) || p.domains?.[0];
                            return (
                                <CompactRow
                                    key={p.name}
                                    primary={metaFor(p.name).label}
                                    secondary={domain || p.name}
                                    href={
                                        domain ? `https://${domain}` : undefined
                                    }
                                />
                            );
                        })
                    ) : (
                        <Empty message="No Pages projects." />
                    )}
                </Panel>

                <Panel title={`Workers · ${inv.workers.length}`} dense>
                    {inv.workers.length ? (
                        inv.workers.map((w) => (
                            <CompactRow
                                key={w.id}
                                primary={autoLabel(w.id)}
                                secondary={w.id}
                                href="/dashboard/workers"
                            />
                        ))
                    ) : (
                        <Empty message="No Workers." />
                    )}
                </Panel>

                <Panel title={`D1 databases · ${inv.d1.length}`} dense>
                    {inv.d1.length ? (
                        inv.d1.map((d) => (
                            <CompactRow
                                key={d.uuid}
                                primary={d.name}
                                secondary={
                                    d.num_tables != null
                                        ? `${d.num_tables} tables`
                                        : d.uuid
                                }
                                href={`/dashboard/d1/${d.uuid}`}
                            />
                        ))
                    ) : (
                        <Empty message="No D1 databases." />
                    )}
                </Panel>

                <Panel title={`KV namespaces · ${inv.kv.length}`} dense>
                    {inv.kv.length ? (
                        inv.kv.map((k) => (
                            <CompactRow
                                key={k.id}
                                primary={k.title}
                                secondary={k.id}
                                href="/dashboard/kv"
                            />
                        ))
                    ) : (
                        <Empty message="No KV namespaces." />
                    )}
                </Panel>

                <Panel title={`Queues · ${inv.queues.length}`} dense>
                    {inv.queues.length ? (
                        inv.queues.map((q) => (
                            <CompactRow
                                key={q.queue_id}
                                primary={q.queue_name}
                                secondary={`${q.producers_total_count ?? 0} prod · ${q.consumers_total_count ?? 0} cons`}
                                href="/dashboard/queues"
                                chip={
                                    (q.consumers_total_count ?? 0) === 0 ? (
                                        <StatusChip
                                            label="no consumer"
                                            tone="warning"
                                        />
                                    ) : (
                                        <StatusChip
                                            label="active"
                                            tone="success"
                                        />
                                    )
                                }
                            />
                        ))
                    ) : (
                        <Empty message="No queues." />
                    )}
                </Panel>

                <Panel
                    title={`Durable Objects · ${inv.durableObjects.length}`}
                    dense
                >
                    {inv.durableObjects.length ? (
                        inv.durableObjects.map((d) => (
                            <CompactRow
                                key={d.id}
                                primary={d.class || d.name || d.id}
                                secondary={d.script || d.id}
                                href="/dashboard/durable-objects"
                            />
                        ))
                    ) : (
                        <Empty message="No Durable Object namespaces." />
                    )}
                </Panel>

                <Panel title={`Zones · ${inv.zones.length}`} dense>
                    {inv.zones.length ? (
                        inv.zones.map((z) => (
                            <CompactRow
                                key={z.id}
                                primary={z.name}
                                secondary={z.id}
                                chip={
                                    <StatusChip
                                        label={z.status || "?"}
                                        tone={
                                            z.status === "active"
                                                ? "success"
                                                : "neutral"
                                        }
                                    />
                                }
                            />
                        ))
                    ) : (
                        <Empty message="No zones." />
                    )}
                </Panel>

                <Panel title={`Workflows · ${inv.workflows.length}`} dense>
                    {inv.workflows.length ? (
                        inv.workflows.map((w) => (
                            <CompactRow
                                key={w.name}
                                primary={w.name}
                                secondary={w.class_name || w.script_name}
                            />
                        ))
                    ) : (
                        <Empty message="No Workflows yet." />
                    )}
                </Panel>
            </Box>

            {failedSections.length > 0 && (
                <Box sx={{ mt: 2 }}>
                    <Typography
                        sx={{ color: C.textMuted, fontSize: "0.76rem", mb: 1 }}
                    >
                        Some resource types couldn't be listed (token scope or
                        product not enabled):
                    </Typography>
                    <Box sx={grid(300)}>
                        {failedSections.map(([name, e]) => (
                            <SectionError
                                key={name}
                                message={`${name}: ${e.error}`}
                            />
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
}
