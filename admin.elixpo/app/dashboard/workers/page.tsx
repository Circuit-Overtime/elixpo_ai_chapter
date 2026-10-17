import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    PageHeader,
    Panel,
    SectionError,
    StatusChip,
} from "@/components/ui";
import { discoverAccount, workerSchedules } from "@/lib/discovery";
import { autoLabel } from "@/lib/enrich";
import { fmt } from "@/lib/format";
import { workersMetrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function Stat({
    label,
    value,
    color,
}: { label: string; value: string; color: string }) {
    return (
        <div>
            <div
                style={{
                    color: C.textMuted,
                    fontSize: "0.64rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                }}
            >
                {label}
            </div>
            <div style={{ color, fontSize: "1.05rem", fontWeight: 700 }}>
                {value}
            </div>
        </div>
    );
}

export default async function WorkersPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);

    const data = await Promise.all(
        inv.workers.map(async (script) => ({
            name: script.id,
            modified: script.modified_on,
            m: await workersMetrics(script.id, w),
            crons: await workerSchedules(script.id),
        })),
    );

    return (
        <div>
            <PageHeader
                title="Workers"
                subtitle="Invocations, errors, subrequests & cron per script"
                timeRange
            />
            {inv.errors.workers && (
                <SectionError
                    message={`Couldn't list Workers: ${inv.errors.workers.error}`}
                />
            )}
            {inv.workers.length === 0 ? (
                <Empty message="No Workers found." />
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(440px, 1fr))",
                        gap: 12,
                    }}
                >
                    {data.map(({ name, m, crons, modified }) => (
                        <Panel
                            key={name}
                            title={autoLabel(name)}
                            action={
                                crons.length > 0 ? (
                                    <StatusChip
                                        label={`cron: ${crons.length}`}
                                        tone="info"
                                    />
                                ) : undefined
                            }
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    gap: 8,
                                    marginBottom: 12,
                                }}
                            >
                                <Stat
                                    label="Requests"
                                    value={fmt(m.totals.requests || 0)}
                                    color={C.accent}
                                />
                                <Stat
                                    label="Errors"
                                    value={fmt(m.totals.errors || 0)}
                                    color={C.error}
                                />
                                <Stat
                                    label="Subrequests"
                                    value={fmt(m.totals.subrequests || 0)}
                                    color="#86efac"
                                />
                            </div>
                            {m.available ? (
                                <MetricChart
                                    points={m.points}
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
                                        {
                                            key: "subrequests",
                                            label: "Subrequests",
                                            color: "#86efac",
                                        },
                                    ]}
                                    height={150}
                                />
                            ) : (
                                <SectionError
                                    message={`Metrics unavailable: ${m.error}`}
                                />
                            )}
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 6,
                                    marginTop: 10,
                                }}
                            >
                                <StatusChip label={name} tone="neutral" />
                                {crons.map((c) => (
                                    <StatusChip
                                        key={c}
                                        label={`⏱ ${c}`}
                                        tone="info"
                                    />
                                ))}
                                {modified && (
                                    <StatusChip
                                        label={`updated ${new Date(modified).toLocaleDateString()}`}
                                        tone="neutral"
                                    />
                                )}
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}
