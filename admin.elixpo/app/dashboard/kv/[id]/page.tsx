import { discoverAccount } from "@/lib/discovery";
import { kvMetrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import KvDetailView from "./kv-detail-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function KvDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ range?: string }>;
}) {
    const { id } = await params;
    const { range } = await searchParams;
    const inv = await discoverAccount();
    const ns = inv.kv.find((n) => n.id === id);
    const metrics = await kvMetrics(id, rangeWindow(range));
    return <KvDetailView id={id} title={ns?.title || id} metrics={metrics} />;
}
