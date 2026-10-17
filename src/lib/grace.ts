/**
 * Grace windows for credential rotation. When a merchant rotates a secret they
 * can let the OLD value keep working for a short window so their integration can
 * redeploy without dropped requests. "immediate" kills the old value at once.
 */

export const GRACE_OPTIONS = {
    immediate: {
        label: "Rotate immediately",
        sql: null as string | null,
        minutes: 0,
    },
    "5m": { label: "Keep old valid 5 minutes", sql: "+5 minutes", minutes: 5 },
    "10m": {
        label: "Keep old valid 10 minutes",
        sql: "+10 minutes",
        minutes: 10,
    },
    "1h": { label: "Keep old valid 1 hour", sql: "+1 hour", minutes: 60 },
} as const;

export type GraceOption = keyof typeof GRACE_OPTIONS;

/** Normalise a requested grace option, defaulting to immediate. */
export function resolveGrace(opt: unknown): {
    key: GraceOption;
    sql: string | null;
    minutes: number;
} {
    const key = (
        typeof opt === "string" && opt in GRACE_OPTIONS ? opt : "immediate"
    ) as GraceOption;
    const g = GRACE_OPTIONS[key];
    return { key, sql: g.sql, minutes: g.minutes };
}
