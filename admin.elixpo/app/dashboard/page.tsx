/**
 * Overview — account-wide health, fully driven by auto-discovery. Every resource
 * the account has is listed here; new ones appear automatically on next refresh.
 */

import { discoverAccount } from "@/lib/discovery";
import { workersMetricsAll, zoneBreakdown, zoneTraffic } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import OverviewView from "./overview-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OverviewPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);
    const primaryZone =
        inv.zones.find((z) => z.name === "elixpo.com") || inv.zones[0];

    const [workers, traffic, breakdown] = await Promise.all([
        workersMetricsAll(w),
        primaryZone ? zoneTraffic(primaryZone.id, w) : Promise.resolve(null),
        primaryZone ? zoneBreakdown(primaryZone.id, w) : Promise.resolve(null),
    ]);

    return (
        <OverviewView
            inv={inv}
            workers={workers}
            traffic={traffic}
            breakdown={breakdown}
            primaryZoneName={primaryZone?.name}
        />
    );
}
