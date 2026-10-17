import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
    StatusChip,
} from "@/components/ui";
import { discoverAccount } from "@/lib/discovery";
import { autoLabel } from "@/lib/enrich";
import { fmt } from "@/lib/format";
import { doMetrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import { Box } from "@mui/material";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DoDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ range?: string }>;
}) {
    const { id } = await params;
    const { range } = await searchParams;
    const inv = await discoverAccount();
    const ns = inv.durableObjects.find((d) => d.id === id);
    const metrics = await doMetrics(id, rangeWindow(range));

    return (
        <Box>
            <PageHeader
                title={ns?.class || ns?.name || autoLabel(id)}
                subtitle={`Durable Object · ${id}`}
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
                    label="Requests · window"
                    value={fmt(metrics.totals.requests || 0)}
                    spark={metrics.points.map((p) => Number(p.requests) || 0)}
                    color={C.accent}
                />
                <KpiTile
                    label="Errors · window"
                    value={fmt(metrics.totals.errors || 0)}
                    spark={metrics.points.map((p) => Number(p.errors) || 0)}
                    color={C.error}
                />
                <KpiTile
                    label="Script"
                    value={ns?.script || "—"}
                    color={C.accentLight}
                />
                <KpiTile
                    label="Storage"
                    value={ns?.use_sqlite ? "SQLite" : "KV"}
                    color="#86efac"
                />
            </Box>

            <Box sx={{ mb: 1.5 }}>
                <Panel title="Durable Object requests over time">
                    {metrics.available ? (
                        <MetricChart
                            points={metrics.points}
                            series={[
                                {
                                    key: "requests",
                                    label: "Requests",
                                    color: C.accent,
                                },
                                {
                                    key: "errors",
                                    label: "Errors",
                                    color: C.error,
                                },
                            ]}
                            height={220}
                        />
                    ) : (
                        <SectionError
                            message={`Metrics unavailable: ${metrics.error}`}
                        />
                    )}
                </Panel>
            </Box>

            <Panel title="Details">
                {ns ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        <StatusChip
                            label={`class: ${ns.class || "?"}`}
                            tone="info"
                        />
                        <StatusChip
                            label={`script: ${ns.script || "?"}`}
                            tone="neutral"
                        />
                        <StatusChip
                            label={
                                ns.use_sqlite ? "SQLite storage" : "KV storage"
                            }
                            tone="success"
                        />
                        <StatusChip label={`id: ${ns.id}`} tone="neutral" />
                    </Box>
                ) : (
                    <Empty message="Namespace not found in discovery." />
                )}
            </Panel>
        </Box>
    );
}
