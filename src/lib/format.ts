/** Pure formatting helpers — safe to import from both server and client code. */

export function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
}

export function fmtBytes(n: number): string {
    if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`;
    if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
    if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`;
    return `${n} B`;
}

/** Period-over-period trend %: second half vs first half of the series. */
export function trend(values: number[]): number | null {
    if (values.length < 4) return null;
    const mid = Math.floor(values.length / 2);
    const a = values.slice(0, mid).reduce((s, v) => s + v, 0);
    const b = values.slice(mid).reduce((s, v) => s + v, 0);
    if (a === 0) return b > 0 ? 100 : 0;
    return ((b - a) / a) * 100;
}
