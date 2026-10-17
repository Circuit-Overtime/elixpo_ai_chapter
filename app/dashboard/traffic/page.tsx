import { discoverAccount } from "@/lib/discovery";
import { zoneBreakdown, zoneTraffic } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import TrafficView, { type ZoneData } from "./traffic-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TrafficPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);
    const zones: ZoneData[] = await Promise.all(
        inv.zones.map(async (z) => {
            const [traffic, breakdown] = await Promise.all([
                zoneTraffic(z.id, w),
                zoneBreakdown(z.id, w),
            ]);
            return { name: z.name, id: z.id, traffic, breakdown };
        }),
    );
    return <TrafficView zones={zones} />;
}
