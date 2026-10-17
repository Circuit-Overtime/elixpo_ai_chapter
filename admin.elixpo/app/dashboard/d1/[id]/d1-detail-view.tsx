"use client";

import MetricChart from "@/components/metric-chart";
import QueryConsole from "@/components/query-console";
import { KpiTile, PageHeader, Panel, SectionError } from "@/components/ui";
import type { MetricSeries } from "@/lib/metrics";
import { Box } from "@mui/material";

export default function D1DetailView({
    dbId,
    dbName,
    tables,
    tablesError,
    metrics,
}: {
    dbId: string;
    dbName: string;
    tables: string[];
    tablesError?: string | null;
    metrics: MetricSeries;
}) {
    return (
        <Box>
            <PageHeader title={dbName} subtitle={`D1 · ${dbId}`} timeRange />

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 2,
                    mb: 3,
                }}
            >
                <KpiTile
                    label="Read queries · 24h"
                    value={metrics.totals.readQueries?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.readQueries) || 0,
                    )}
                    color="#22c55e"
                />
                <KpiTile
                    label="Write queries · 24h"
                    value={metrics.totals.writeQueries?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.writeQueries) || 0,
                    )}
                    color="#f59e0b"
                />
                <KpiTile
                    label="Rows read · 24h"
                    value={metrics.totals.rowsRead?.toLocaleString() ?? "—"}
                    spark={metrics.points.map((p) => Number(p.rowsRead) || 0)}
                    color="#4593ff"
                />
                <KpiTile
                    label="Rows written · 24h"
                    value={metrics.totals.rowsWritten?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.rowsWritten) || 0,
                    )}
                    color="#a855f7"
                />
            </Box>

            <Box sx={{ mb: 3 }}>
                <Panel title="D1 activity · 24h">
                    {metrics.available ? (
                        <MetricChart
                            points={metrics.points}
                            series={[
                                {
                                    key: "readQueries",
                                    label: "Reads",
                                    color: "#86efac",
                                },
                                {
                                    key: "writeQueries",
                                    label: "Writes",
                                    color: "#fbbf24",
                                },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Metrics unavailable: ${metrics.error}`}
                        />
                    )}
                </Panel>
            </Box>

            <Panel title="Query console">
                {tablesError && (
                    <SectionError
                        message={`Couldn't list tables: ${tablesError}`}
                    />
                )}
                <QueryConsole dbId={dbId} tables={tables} />
            </Panel>
        </Box>
    );
}
