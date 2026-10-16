/**
 * Status payload builder — the single source of truth for the public status
 * page, used by both the SSR page (app/page.tsx) and the JSON API route
 * (app/api/status/route.ts). All Cloudflare reads here are KV-cached (see
 * metrics.ts / discovery.ts), so repeated calls within the cache window are
 * cheap. The client layers a 1h localStorage cache on top of this.
 */

import { type ChangeLogItem, fetchChangelogs } from "@/lib/changelog";
import { discoverAccount } from "@/lib/discovery";
import { knownDomains, metaFor } from "@/lib/enrich";
import {
    type DayPoint,
    lastHours,
    zoneBreakdown,
    zoneDailyUptime,
    zoneHourlyUptime,
} from "@/lib/metrics";

export type Health = "operational" | "degraded" | "outage" | "idle";

export interface ProductStatus {
    label: string;
    domain?: string;
    repo?: string;
    health: Health;
    /** "90d" → daily cells; "24h" → hourly cells. */
    window: "90d" | "24h";
    days: DayPoint[];
    uptimePct: number;
    seriesAvailable: boolean;
    total: number;
}

export interface StatusPayload {
    products: ProductStatus[];
    changelogs: ChangeLogItem[];
    fetchedAt: number;
    monitoringAvailable: boolean;
}

const BASE = "elixpo.com";
/** Domains we never surface on the public status page. */
const EXCLUDE = new Set(["url.elixpo.com", "career.elixpo.com"]);

function classify(status: { label: string; count: number }[]): {
    total: number;
    fivexx: number;
} {
    let total = 0;
    let fivexx = 0;
    for (const s of status) {
        const n = Number(s.label);
        total += s.count;
        if (n >= 500) fivexx += s.count;
    }
    return { total, fivexx };
}

function health(total: number, fivexx: number): Health {
    if (total === 0) return "idle";
    const ratio = fivexx / total;
    if (ratio < 0.02) return "operational";
    if (ratio < 0.1) return "degraded";
    return "outage";
}

export async function buildStatus(): Promise<StatusPayload> {
    const w = lastHours(24);
    const [inv, changelogs] = await Promise.all([
        discoverAccount().catch(() => null),
        fetchChangelogs(6).catch(() => []),
    ]);

    if (!inv) {
        return {
            products: knownDomains().map((meta) => ({
                label: meta.label,
                domain: meta.domain,
                repo: meta.repo,
                health: "idle",
                window: meta.domain === BASE ? "90d" : "24h",
                days: [],
                uptimePct: 100,
                seriesAvailable: false,
                total: 0,
            })),
            changelogs,
            fetchedAt: Date.now(),
            monitoringAvailable: false,
        };
    }

    // Canonical service list — built from the registry's known product domains
    // unioned with discovered Pages projects. This is INDEPENDENT of zone
    // analytics: even if Cloudflare zone discovery is unavailable, every service
    // still renders (with "no data" history) so the page is never empty. Zone
    // analytics, when present, is queried per-host and fills in live health.
    const byDomain = new Map<string, { label: string; repo?: string }>();
    for (const p of inv.pages) {
        const domain = p.domains?.find((d) => !d.endsWith(".pages.dev"));
        if (!domain || EXCLUDE.has(domain)) continue;
        const meta = metaFor(p.name);
        byDomain.set(domain, { label: meta.label, repo: meta.repo });
    }
    for (const m of knownDomains()) {
        if (EXCLUDE.has(m.domain)) continue;
        if (!byDomain.has(m.domain)) {
            byDomain.set(m.domain, { label: m.label, repo: m.repo });
        }
    }

    const products: ProductStatus[] = await Promise.all(
        [...byDomain.entries()].map(async ([domain, meta]) => {
            const isBase = domain === BASE;
            const zone = inv.zones
                .filter(
                    (candidate) =>
                        domain === candidate.name ||
                        domain.endsWith(`.${candidate.name}`),
                )
                .sort((a, b) => b.name.length - a.name.length)[0];
            // Current health from the last 24h; bars from the history window
            // appropriate to the service (90d for the base platform, 24h for
            // sub-services, which only retain short-window edge analytics).
            let total = 0;
            let fivexx = 0;
            let series = {
                available: false,
                days: [] as DayPoint[],
                uptimePct: 100,
            };
            if (zone) {
                const [b, s] = await Promise.all([
                    zoneBreakdown(zone.id, w, domain),
                    isBase
                        ? zoneDailyUptime(zone.id, 90)
                        : zoneHourlyUptime(zone.id, domain, 24),
                ]);
                ({ total, fivexx } = classify(b.status));
                series = s;
            }
            return {
                label: meta.label,
                domain,
                repo: meta.repo,
                health: health(total, fivexx),
                window: isBase ? "90d" : "24h",
                days: series.days,
                uptimePct: series.uptimePct,
                seriesAvailable: series.available,
                total,
            } satisfies ProductStatus;
        }),
    );

    // Base platform pinned on top, then the busiest services, then the rest
    // alphabetically (stable, traffic-free services don't jump around).
    products.sort((a, b) => {
        if (a.domain === BASE) return -1;
        if (b.domain === BASE) return 1;
        if (b.total !== a.total) return b.total - a.total;
        return a.label.localeCompare(b.label);
    });

    return {
        products,
        changelogs,
        fetchedAt: inv.fetchedAt,
        monitoringAvailable: true,
    };
}
