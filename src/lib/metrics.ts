/**
 * Metrics catalog — every chart the dashboard renders, backed by the Cloudflare
 * GraphQL Analytics API. Each function returns a normalized MetricSeries and
 * never throws: a missing scope / unentitled product yields { available:false }
 * so the UI shows a disabled card instead of crashing.
 *
 * Dataset/field names are validated against the live API during Step 6; the
 * graceful wrapper means an incorrect field degrades one card, not the page.
 */

import { cfGraphQL, getAccountId } from "./cloudflare-api";
import { cached } from "./kv";

/** ~45s read-through cache window for analytics calls. */
const METRIC_TTL = 45;

export interface MetricPoint {
    ts: string;
    [metric: string]: number | string;
}

export interface MetricSeries {
    available: boolean;
    error?: string;
    points: MetricPoint[];
    totals: Record<string, number>;
}

const EMPTY = (error?: string): MetricSeries => ({
    available: !error,
    error,
    points: [],
    totals: {},
});

export interface Window {
    since: string; // ISO
    until: string; // ISO
}

export function lastHours(h = 24): Window {
    const until = new Date();
    const since = new Date(until.getTime() - h * 3600_000);
    return { since: since.toISOString(), until: until.toISOString() };
}

export function lastDays(d = 7): Window {
    const until = new Date();
    const since = new Date(until.getTime() - d * 86400_000);
    return { since: since.toISOString(), until: until.toISOString() };
}

async function run<T>(
    query: string,
    variables: Record<string, unknown>,
): Promise<T> {
    return cfGraphQL<T>(query, variables);
}

function sumTotals(
    points: MetricPoint[],
    fields: string[],
): Record<string, number> {
    const t: Record<string, number> = {};
    for (const f of fields) t[f] = 0;
    for (const p of points) {
        for (const f of fields) {
            const v = p[f];
            if (typeof v === "number") t[f] += v;
        }
    }
    return t;
}

/* ------------------------------------------------------------------ Workers */

export async function workersMetrics(
    scriptName: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!,$script:String!){
              viewer{accounts(filter:{accountTag:$a}){
                workersInvocationsAdaptive(limit:10000,
                  filter:{datetime_geq:$s,datetime_leq:$u,scriptName:$script},
                  orderBy:[datetimeHour_ASC]){
                  sum{requests errors subrequests}
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until, script: scriptName },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            requests: r.sum.requests ?? 0,
            errors: r.sum.errors ?? 0,
            subrequests: r.sum.subrequests ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, ["requests", "errors", "subrequests"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/** Account-wide Workers invocations (all scripts), bucketed hourly. */
export async function workersMetricsAll(
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!){
              viewer{accounts(filter:{accountTag:$a}){
                workersInvocationsAdaptive(limit:10000,
                  filter:{datetime_geq:$s,datetime_leq:$u},
                  orderBy:[datetimeHour_ASC]){
                  sum{requests errors}
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
        // Multiple script rows can share an hour — fold them together.
        const byHour = new Map<string, MetricPoint>();
        for (const r of rows) {
            const ts = r.dimensions.datetimeHour;
            const p = byHour.get(ts) || { ts, requests: 0, errors: 0 };
            p.requests = (p.requests as number) + (r.sum.requests ?? 0);
            p.errors = (p.errors as number) + (r.sum.errors ?? 0);
            byHour.set(ts, p);
        }
        const points = Array.from(byHour.values()).sort((a, b) =>
            String(a.ts).localeCompare(String(b.ts)),
        );
        return {
            available: true,
            points,
            totals: sumTotals(points, ["requests", "errors"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/* ----------------------------------------------------------------------- D1 */

export async function d1Metrics(
    databaseId: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!,$db:string!){
              viewer{accounts(filter:{accountTag:$a}){
                d1AnalyticsAdaptiveGroups(limit:10000,
                  filter:{datetimeHour_geq:$s,datetimeHour_leq:$u,databaseId:$db},
                  orderBy:[datetimeHour_ASC]){
                  sum{readQueries writeQueries rowsRead rowsWritten}
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until, db: databaseId },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            readQueries: r.sum.readQueries ?? 0,
            writeQueries: r.sum.writeQueries ?? 0,
            rowsRead: r.sum.rowsRead ?? 0,
            rowsWritten: r.sum.rowsWritten ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, [
                "readQueries",
                "writeQueries",
                "rowsRead",
                "rowsWritten",
            ]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/* ----------------------------------------------------------------------- KV */

export async function kvMetrics(
    namespaceId: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!,$ns:string!){
              viewer{accounts(filter:{accountTag:$a}){
                kvOperationsAdaptiveGroups(limit:10000,
                  filter:{datetimeHour_geq:$s,datetimeHour_leq:$u,namespaceId:$ns},
                  orderBy:[datetimeHour_ASC]){
                  sum{requests}
                  dimensions{datetimeHour actionType}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until, ns: namespaceId },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? [];
        // Pivot actionType (read/write/delete/list) into columns per hour.
        const byHour = new Map<string, MetricPoint>();
        for (const r of rows) {
            const ts = r.dimensions.datetimeHour;
            const action = r.dimensions.actionType || "op";
            const p: MetricPoint = byHour.get(ts) || { ts };
            p[action] = ((p[action] as number) || 0) + (r.sum.requests ?? 0);
            byHour.set(ts, p);
        }
        const points = Array.from(byHour.values()).sort((a, b) =>
            String(a.ts).localeCompare(String(b.ts)),
        );
        const cols = Array.from(
            new Set(rows.map((r: any) => r.dimensions.actionType || "op")),
        ) as string[];
        return { available: true, points, totals: sumTotals(points, cols) };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/* -------------------------------------------------------------------- Queues */

export async function queueMetrics(
    queueId: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!,$q:string!){
              viewer{accounts(filter:{accountTag:$a}){
                queueBacklogAdaptiveGroups(limit:10000,
                  filter:{datetimeHour_geq:$s,datetimeHour_leq:$u,queueId:$q},
                  orderBy:[datetimeHour_ASC]){
                  avg{messages bytes}
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until, q: queueId },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.queueBacklogAdaptiveGroups ?? [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            backlogMessages: r.avg?.messages ?? 0,
            backlogBytes: r.avg?.bytes ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, ["backlogMessages", "backlogBytes"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/* ----------------------------------------------------------- Durable Objects */

export async function doMetrics(
    namespaceId?: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const nf = namespaceId ? ",namespaceId:$ns" : "";
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!${namespaceId ? ",$ns:string!" : ""}){
              viewer{accounts(filter:{accountTag:$a}){
                durableObjectsInvocationsAdaptiveGroups(limit:10000,
                  filter:{datetimeHour_geq:$s,datetimeHour_leq:$u${nf}},
                  orderBy:[datetimeHour_ASC]){
                  sum{requests errors responseBodySize}
                  dimensions{datetimeHour}
                }
              }}
            }`,
            {
                a: account,
                s: w.since,
                u: w.until,
                ...(namespaceId ? { ns: namespaceId } : {}),
            },
        );
        const rows =
            data?.viewer?.accounts?.[0]
                ?.durableObjectsInvocationsAdaptiveGroups ?? [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            requests: r.sum.requests ?? 0,
            errors: r.sum.errors ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, ["requests", "errors"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

/* ------------------------------------------------------------- Zone traffic */

export async function zoneTraffic(
    zoneTag: string,
    w = lastHours(),
): Promise<MetricSeries> {
    return cached(
        `zt:${zoneTag}:${w.since}:${w.until}`,
        METRIC_TTL,
        async () => {
            try {
                const data = await run<any>(
                    `query($z:String!,$s:Time!,$u:Time!){
              viewer{zones(filter:{zoneTag:$z}){
                httpRequestsAdaptiveGroups(limit:10000,
                  filter:{datetime_geq:$s,datetime_leq:$u},
                  orderBy:[datetimeHour_ASC]){
                  count
                  sum{edgeResponseBytes}
                  dimensions{datetimeHour}
                }
              }}
            }`,
                    { z: zoneTag, s: w.since, u: w.until },
                );
                const rows =
                    data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
                const points: MetricPoint[] = rows.map((r: any) => ({
                    ts: r.dimensions.datetimeHour,
                    requests: r.count ?? 0,
                    bytes: r.sum?.edgeResponseBytes ?? 0,
                }));
                return {
                    available: true,
                    points,
                    totals: sumTotals(points, ["requests", "bytes"]),
                };
            } catch (e) {
                return EMPTY((e as Error).message);
            }
        },
    );
}

/** Traffic for a single host (e.g. blogs.elixpo.com) within its zone. Used by
 * per-project pages to show that project's slice of the zone's traffic. */
export async function hostTraffic(
    zoneTag: string,
    host: string,
    w = lastHours(),
): Promise<MetricSeries> {
    return cached(
        `ht:${zoneTag}:${host}:${w.since}:${w.until}`,
        METRIC_TTL,
        async () => {
            try {
                const data = await run<any>(
                    `query($z:String!,$s:Time!,$u:Time!,$h:string!){
              viewer{zones(filter:{zoneTag:$z}){
                httpRequestsAdaptiveGroups(limit:10000,
                  filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h},
                  orderBy:[datetimeHour_ASC]){
                  count sum{edgeResponseBytes} dimensions{datetimeHour}
                }
              }}
            }`,
                    { z: zoneTag, s: w.since, u: w.until, h: host },
                );
                const rows =
                    data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
                const points: MetricPoint[] = rows.map((r: any) => ({
                    ts: r.dimensions.datetimeHour,
                    requests: r.count ?? 0,
                    bytes: r.sum?.edgeResponseBytes ?? 0,
                }));
                return {
                    available: true,
                    points,
                    totals: sumTotals(points, ["requests", "bytes"]),
                };
            } catch (e) {
                return EMPTY((e as Error).message);
            }
        },
    );
}

/* ---------------------------------------------------- Daily uptime (status page) */

export interface DayPoint {
    date: string;
    total: number;
    errors: number; // 5xx
}
export interface DailyUptime {
    available: boolean;
    error?: string;
    days: DayPoint[];
    uptimePct: number;
}

/** Zone-wide daily uptime history (httpRequests1dGroups, up to ~90 days). */
export async function zoneDailyUptime(
    zoneTag: string,
    days = 90,
): Promise<DailyUptime> {
    return cached(`du:${zoneTag}:${days}`, 600, async () => {
        try {
            const since = new Date(Date.now() - days * 86400_000)
                .toISOString()
                .slice(0, 10);
            const data = await run<any>(
                `query($z:String!,$d:String!){viewer{zones(filter:{zoneTag:$z}){
                    httpRequests1dGroups(limit:200,filter:{date_geq:$d},orderBy:[date_ASC]){
                        dimensions{date}
                        sum{requests responseStatusMap{edgeResponseStatus requests}}
                    }
                }}}`,
                { z: zoneTag, d: since },
            );
            const rows = data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
            const out: DayPoint[] = rows.map((r: any) => {
                const total = r.sum?.requests ?? 0;
                const errors = (r.sum?.responseStatusMap || [])
                    .filter((m: any) => Number(m.edgeResponseStatus) >= 500)
                    .reduce((a: number, m: any) => a + (m.requests ?? 0), 0);
                return { date: r.dimensions.date, total, errors };
            });
            const t = out.reduce((a, d) => a + d.total, 0);
            const e = out.reduce((a, d) => a + d.errors, 0);
            return {
                available: true,
                days: out,
                uptimePct: t > 0 ? ((t - e) / t) * 100 : 100,
            };
        } catch (err) {
            return {
                available: false,
                error: (err as Error).message,
                days: [],
                uptimePct: 100,
            };
        }
    });
}

/**
 * Per-host hourly uptime over the last N hours (httpRequestsAdaptiveGroups,
 * scoped to one domain). Returns a full N-cell grid — hours with no traffic are
 * emitted as zero-request cells so the bar strip stays aligned to real time.
 * Used for sub-pages, which only have short-window edge analytics retention.
 */
export async function zoneHourlyUptime(
    zoneTag: string,
    host: string,
    hours = 24,
): Promise<DailyUptime> {
    return cached(`hu:${zoneTag}:${host}:${hours}`, METRIC_TTL, async () => {
        try {
            const w = lastHours(hours);
            const data = await run<any>(
                `query($z:String!,$s:Time!,$u:Time!,$h:string!){viewer{zones(filter:{zoneTag:$z}){
                    httpRequestsAdaptiveGroups(limit:5000,
                        filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h},
                        orderBy:[datetimeHour_ASC]){
                        count
                        dimensions{datetimeHour edgeResponseStatus}
                    }
                }}}`,
                { z: zoneTag, s: w.since, u: w.until, h: host },
            );
            const rows =
                data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
            // Aggregate (hour → total/5xx). Key on the "YYYY-MM-DDTHH" prefix so
            // it lines up with the grid we synthesize below.
            const byHour = new Map<string, { total: number; errors: number }>();
            for (const r of rows) {
                const hour = String(r.dimensions.datetimeHour).slice(0, 13);
                const status = Number(r.dimensions.edgeResponseStatus);
                const c = r.count ?? 0;
                const cur = byHour.get(hour) || { total: 0, errors: 0 };
                cur.total += c;
                if (status >= 500) cur.errors += c;
                byHour.set(hour, cur);
            }
            const now = Date.now();
            const days: DayPoint[] = [];
            for (let i = hours - 1; i >= 0; i--) {
                const key = new Date(now - i * 3600_000)
                    .toISOString()
                    .slice(0, 13);
                const v = byHour.get(key) || { total: 0, errors: 0 };
                days.push({
                    date: `${key}:00Z`,
                    total: v.total,
                    errors: v.errors,
                });
            }
            const t = days.reduce((a, d) => a + d.total, 0);
            const e = days.reduce((a, d) => a + d.errors, 0);
            return {
                available: true,
                days,
                uptimePct: t > 0 ? ((t - e) / t) * 100 : 100,
            };
        } catch (err) {
            return {
                available: false,
                error: (err as Error).message,
                days: [],
                uptimePct: 100,
            };
        }
    });
}

/* --------------------------------------------------------------- DNS / zone */

export async function dnsAnalytics(
    zoneTag: string,
    w = lastHours(),
): Promise<MetricSeries> {
    try {
        const data = await run<any>(
            `query($z:String!,$s:Time!,$u:Time!){
              viewer{zones(filter:{zoneTag:$z}){
                dnsAnalyticsAdaptiveGroups(limit:10000,
                  filter:{datetime_geq:$s,datetime_leq:$u},
                  orderBy:[datetimeHour_ASC]){
                  count
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { z: zoneTag, s: w.since, u: w.until },
        );
        const rows = data?.viewer?.zones?.[0]?.dnsAnalyticsAdaptiveGroups ?? [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            queries: r.count ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, ["queries"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}

export interface DnsBreakdown {
    available: boolean;
    error?: string;
    queryName: Dim[];
    queryType: Dim[];
    responseCode: Dim[];
    colo: Dim[];
}

export async function dnsBreakdown(
    zoneTag: string,
    w = lastHours(),
): Promise<DnsBreakdown> {
    const empty: DnsBreakdown = {
        available: false,
        queryName: [],
        queryType: [],
        responseCode: [],
        colo: [],
    };
    try {
        const grp = (alias: string, dim: string, limit = 12) =>
            `${alias}:dnsAnalyticsAdaptiveGroups(limit:${limit},filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[count_DESC]){count dimensions{${dim}}}`;
        const data = await run<any>(
            `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){
                ${grp("qn", "queryName")}
                ${grp("qt", "queryType")}
                ${grp("rc", "responseCode")}
                ${grp("co", "coloName")}
            }}}`,
            { z: zoneTag, s: w.since, u: w.until },
        );
        const z = data?.viewer?.zones?.[0] || {};
        const map = (rows: any[], key: string): Dim[] =>
            (rows || []).map((r) => ({
                label: String(r.dimensions[key] ?? "—"),
                count: r.count ?? 0,
            }));
        return {
            available: true,
            queryName: map(z.qn, "queryName"),
            queryType: map(z.qt, "queryType"),
            responseCode: map(z.rc, "responseCode"),
            colo: map(z.co, "coloName"),
        };
    } catch (e) {
        return { ...empty, error: (e as Error).message };
    }
}

/* -------------------------------------------------- Zone breakdowns (traffic) */

export interface Dim {
    label: string;
    count: number;
}
export interface ZoneBreakdown {
    available: boolean;
    error?: string;
    country: Dim[];
    status: Dim[];
    device: Dim[];
    host: Dim[];
    path: Dim[];
    browser: Dim[];
    os: Dim[];
    userAgent: Dim[];
    httpProtocol: Dim[];
    tls: Dim[];
    ip: Dim[];
    cacheStatus: Dim[];
    originStatus: Dim[];
}

export async function zoneBreakdown(
    zoneTag: string,
    w = lastHours(),
    host?: string,
): Promise<ZoneBreakdown> {
    return cached(
        `zb:${zoneTag}:${host || "*"}:${w.since}:${w.until}`,
        METRIC_TTL,
        () => zoneBreakdownUncached(zoneTag, w, host),
    );
}

async function zoneBreakdownUncached(
    zoneTag: string,
    w: Window,
    host?: string,
): Promise<ZoneBreakdown> {
    const empty: ZoneBreakdown = {
        available: false,
        country: [],
        status: [],
        device: [],
        host: [],
        path: [],
        browser: [],
        os: [],
        userAgent: [],
        httpProtocol: [],
        tls: [],
        ip: [],
        cacheStatus: [],
        originStatus: [],
    };
    try {
        // Optional host filter lets per-project pages scope breakdowns to one domain.
        const hf = host ? ",clientRequestHTTPHost:$h" : "";
        const grp = (alias: string, dim: string, limit = 10) =>
            `${alias}:httpRequestsAdaptiveGroups(limit:${limit},filter:{datetime_geq:$s,datetime_leq:$u${hf}},orderBy:[count_DESC]){count dimensions{${dim}}}`;
        const data = await run<any>(
            `query($z:String!,$s:Time!,$u:Time!${host ? ",$h:string!" : ""}){viewer{zones(filter:{zoneTag:$z}){
                ${grp("country", "clientCountryName")}
                ${grp("status", "edgeResponseStatus")}
                ${grp("device", "clientDeviceType", 6)}
                ${grp("host", "clientRequestHTTPHost")}
                ${grp("path", "clientRequestPath")}
                ${grp("browser", "userAgentBrowser")}
                ${grp("os", "userAgentOS")}
                ${grp("ua", "userAgent")}
                ${grp("proto", "clientRequestHTTPProtocol")}
                ${grp("tls", "clientSSLProtocol")}
                ${grp("ip", "clientIP")}
                ${grp("cache", "cacheStatus")}
                ${grp("origin", "originResponseStatus")}
            }}}`,
            {
                z: zoneTag,
                s: w.since,
                u: w.until,
                ...(host ? { h: host } : {}),
            },
        );
        const z = data?.viewer?.zones?.[0] || {};
        const map = (rows: any[], key: string): Dim[] =>
            (rows || []).map((r) => ({
                label: String(r.dimensions[key] ?? "—"),
                count: r.count ?? 0,
            }));
        return {
            available: true,
            country: map(z.country, "clientCountryName"),
            status: map(z.status, "edgeResponseStatus"),
            device: map(z.device, "clientDeviceType"),
            host: map(z.host, "clientRequestHTTPHost"),
            path: map(z.path, "clientRequestPath"),
            browser: map(z.browser, "userAgentBrowser"),
            os: map(z.os, "userAgentOS"),
            userAgent: map(z.ua, "userAgent"),
            httpProtocol: map(z.proto, "clientRequestHTTPProtocol"),
            tls: map(z.tls, "clientSSLProtocol"),
            ip: map(z.ip, "clientIP"),
            cacheStatus: map(z.cache, "cacheStatus"),
            originStatus: map(z.origin, "originResponseStatus"),
        };
    } catch (e) {
        return { ...empty, error: (e as Error).message };
    }
}

/* ------------------------------------------------------------------ Gateway */

export async function gatewayDns(w = lastHours()): Promise<MetricSeries> {
    try {
        const account = await getAccountId();
        const data = await run<any>(
            `query($a:String!,$s:Time!,$u:Time!){
              viewer{accounts(filter:{accountTag:$a}){
                gatewayResolverQueriesAdaptiveGroups(limit:10000,
                  filter:{datetimeHour_geq:$s,datetimeHour_leq:$u},
                  orderBy:[datetimeHour_ASC]){
                  count
                  dimensions{datetimeHour}
                }
              }}
            }`,
            { a: account, s: w.since, u: w.until },
        );
        const rows =
            data?.viewer?.accounts?.[0]?.gatewayResolverQueriesAdaptiveGroups ??
            [];
        const points: MetricPoint[] = rows.map((r: any) => ({
            ts: r.dimensions.datetimeHour,
            queries: r.count ?? 0,
        }));
        return {
            available: true,
            points,
            totals: sumTotals(points, ["queries"]),
        };
    } catch (e) {
        return EMPTY((e as Error).message);
    }
}
