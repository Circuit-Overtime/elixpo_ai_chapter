import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    PageHeader,
    Panel,
    SectionError,
    TopList,
} from "@/components/ui";
import { discoverAccount } from "@/lib/discovery";
import { dnsAnalytics, dnsBreakdown } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DnsPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);

    const zones = await Promise.all(
        inv.zones.map(async (z) => {
            const [series, bd] = await Promise.all([
                dnsAnalytics(z.id, w),
                dnsBreakdown(z.id, w),
            ]);
            return { name: z.name, id: z.id, series, bd };
        }),
    );

    return (
        <div>
            <PageHeader
                title="DNS analytics"
                subtitle="Queries, types and response codes per zone"
                timeRange
            />
            {inv.zones.length === 0 && <Empty message="No zones found." />}
            {zones.map((z) => (
                <div key={z.id} style={{ marginBottom: 28 }}>
                    <div
                        style={{
                            color: C.accentLight,
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            marginBottom: 12,
                        }}
                    >
                        {z.name}
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Panel title="DNS queries over time">
                            {z.series.available ? (
                                <MetricChart
                                    points={z.series.points}
                                    series={[
                                        {
                                            key: "queries",
                                            label: "Queries",
                                            color: C.accent,
                                        },
                                    ]}
                                    height={240}
                                />
                            ) : (
                                <SectionError
                                    message={`DNS analytics unavailable: ${z.series.error}`}
                                />
                            )}
                        </Panel>
                    </div>

                    {z.bd.available && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(280px, 1fr))",
                                gap: 12,
                            }}
                        >
                            <Panel title="Top query names" dense>
                                <TopList
                                    color={C.accent}
                                    items={z.bd.queryName
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Query types" dense>
                                <TopList
                                    color={C.accentLight}
                                    items={z.bd.queryType
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Response codes" dense>
                                <TopList
                                    color={C.accentDeep}
                                    items={z.bd.responseCode
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Data centres (colo)" dense>
                                <TopList
                                    color="#86efac"
                                    items={z.bd.colo.slice(0, 12).map((x) => ({
                                        label: x.label,
                                        value: x.count,
                                    }))}
                                />
                            </Panel>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
