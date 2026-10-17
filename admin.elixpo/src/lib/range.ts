/** Time-range options shared by the picker (client) and the pages (server). */
import type { Window } from "./metrics";

export const RANGES = [
    { key: "1h", label: "1h", hours: 1 },
    { key: "6h", label: "6h", hours: 6 },
    { key: "24h", label: "24h", hours: 24 },
    { key: "7d", label: "7d", hours: 24 * 7 },
    { key: "30d", label: "30d", hours: 24 * 30 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export interface RangeWindow extends Window {
    key: string;
    label: string;
}

/** Resolve a ?range= value to a concrete time window (defaults to 24h). */
export function rangeWindow(key?: string): RangeWindow {
    const r = RANGES.find((x) => x.key === key) || RANGES[2];
    const until = new Date();
    const since = new Date(until.getTime() - r.hours * 3600_000);
    return {
        since: since.toISOString(),
        until: until.toISOString(),
        key: r.key,
        label: r.label,
    };
}
