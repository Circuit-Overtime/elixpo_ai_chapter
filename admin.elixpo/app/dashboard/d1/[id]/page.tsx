import { acctPath, cfRest, safe } from "@/lib/cloudflare-api";
import { discoverAccount } from "@/lib/discovery";
import { d1Metrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import D1DetailView from "./d1-detail-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function D1DetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ range?: string }>;
}) {
    const { id } = await params;
    const { range } = await searchParams;
    const inv = await discoverAccount();
    const db = inv.d1.find((d) => d.uuid === id);

    const [tablesRes, metrics] = await Promise.all([
        safe(async () => {
            const env = await cfRest<any>(
                await acctPath(`/d1/database/${id}/query`),
                {
                    method: "POST",
                    body: JSON.stringify({
                        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
                        params: [],
                    }),
                },
            );
            return (env.result?.[0]?.results || []).map(
                (r: any) => r.name as string,
            );
        }),
        d1Metrics(id, rangeWindow(range)),
    ]);

    return (
        <D1DetailView
            dbId={id}
            dbName={db?.name || id}
            tables={tablesRes.ok ? tablesRes.data : []}
            tablesError={tablesRes.ok ? null : tablesRes.error}
            metrics={metrics}
        />
    );
}
