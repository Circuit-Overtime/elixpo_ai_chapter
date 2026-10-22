"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * GitHub-style rolling 12-month contribution calendar.
 * Restyled to LixBlogs design tokens — purple accent palette, rounded cells.
 *
 * Props:
 *   username — whose contributions to show
 *   timezone — IANA timezone string (optional, falls back to creator's tz)
 */

// 5-step accessible color scale (light + dark themes)
const LEVELS = [
    {
        min: 0,
        max: 0,
        label: "No posts",
        light: "#ebedf0",
        dark: "rgba(255,255,255,0.06)",
    },
    {
        min: 1,
        max: 1,
        label: "1 post",
        light: "#d4c5f9",
        dark: "rgba(155,123,247,0.25)",
    },
    {
        min: 2,
        max: 3,
        label: "2–3 posts",
        light: "#b69aff",
        dark: "rgba(155,123,247,0.45)",
    },
    {
        min: 4,
        max: 6,
        label: "4–6 posts",
        light: "#9b7bf7",
        dark: "rgba(155,123,247,0.7)",
    },
    {
        min: 7,
        max: Infinity,
        label: "7+ posts",
        light: "#7c3aed",
        dark: "#9b7bf7",
    },
];

function getLevel(count) {
    return LEVELS.findIndex((l) => count >= l.min && count <= l.max);
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Generate the 52×7 grid of dates for the past 12 months
function buildCalendarGrid() {
    const today = new Date();
    const grid = [];

    // Start from the Sunday of the week 52 weeks ago
    const start = new Date(today);
    start.setDate(start.getDate() - 364 - start.getDay());

    for (let week = 0; week < 53; week++) {
        const days = [];
        for (let day = 0; day < 7; day++) {
            const d = new Date(start);
            d.setDate(d.getDate() + (week * 7 + day));
            if (d <= today) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                days.push({ date: `${y}-${m}-${dd}`, d: new Date(d) });
            } else {
                days.push(null);
            }
        }
        grid.push(days);
    }

    return grid;
}

function formatDate(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export default function ContributionGraph({ username, timezone }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [focusedCell, setFocusedCell] = useState(null); // { week, day }
    const [isDark, setIsDark] = useState(false);

    // Detect theme
    useEffect(() => {
        const check = () => {
            const el = document.documentElement;
            setIsDark(
                el.classList.contains("dark") ||
                    el.getAttribute("data-theme") === "dark" ||
                    window.matchMedia("(prefers-color-scheme: dark)").matches,
            );
        };
        check();
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", check);
        const observer = new MutationObserver(check);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
        });
        return () => {
            mq.removeEventListener("change", check);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!username) return;
        const qs = timezone ? `?timezone=${encodeURIComponent(timezone)}` : "";
        fetch(`/api/users/${encodeURIComponent(username)}/contributions${qs}`)
            .then((r) =>
                r.ok ? r.json() : Promise.reject(new Error("Failed to load")),
            )
            .then((d) => setData(d))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [username, timezone]);

    const grid = useMemo(() => buildCalendarGrid(), []);

    // Month labels — show at the start of each month
    const monthLabels = useMemo(() => {
        const labels = [];
        let lastMonth = -1;
        for (let w = 0; w < grid.length; w++) {
            const firstDay = grid[w].find((d) => d !== null);
            if (firstDay) {
                const month = firstDay.d.getMonth();
                if (month !== lastMonth) {
                    labels.push({ week: w, label: MONTHS[month] });
                    lastMonth = month;
                }
            }
        }
        return labels;
    }, [grid]);

    const handleKeyDown = useCallback(
        (e, week, day) => {
            let nw = week;
            let nd = day;
            switch (e.key) {
                case "ArrowRight":
                    nw = Math.min(week + 1, grid.length - 1);
                    break;
                case "ArrowLeft":
                    nw = Math.max(week - 1, 0);
                    break;
                case "ArrowDown":
                    nd = Math.min(day + 1, 6);
                    break;
                case "ArrowUp":
                    nd = Math.max(day - 1, 0);
                    break;
                default:
                    return;
            }
            e.preventDefault();
            setFocusedCell({ week: nw, day: nd });
        },
        [grid.length],
    );

    // Auto-focus when focusedCell changes
    useEffect(() => {
        if (focusedCell) {
            const el = document.querySelector(
                `[data-cell="${focusedCell.week}-${focusedCell.day}"]`,
            );
            if (el) el.focus();
        }
    }, [focusedCell]);

    const cellSize = 12;
    const cellGap = 3;
    const labelWidth = 28;
    const headerHeight = 18;

    if (loading) {
        return (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4">
                <div className="h-4 w-32 bg-[var(--bg-elevated)] animate-pulse rounded mb-3" />
                <div className="h-[100px] bg-[var(--bg-elevated)] animate-pulse rounded" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4 text-center">
                <p className="text-[13px] text-[var(--text-faint)]">
                    Unable to load activity
                </p>
            </div>
        );
    }

    const days = data?.days || {};
    const total = data?.total || 0;

    // Empty state
    if (total === 0) {
        return (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-5 text-center">
                <ion-icon
                    name="calendar-outline"
                    style={{ fontSize: "28px", color: "var(--text-faint)" }}
                />
                <p className="text-[13px] text-[var(--text-muted)] mt-2 font-medium">
                    No publishing activity yet
                </p>
                <p className="text-[11px] text-[var(--text-faint)] mt-1">
                    Posts will appear here once published
                </p>
            </div>
        );
    }

    const svgWidth = labelWidth + grid.length * (cellSize + cellGap);
    const svgHeight = headerHeight + 7 * (cellSize + cellGap);

    return (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4">
            {/* Header: total + year */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] text-[var(--text-primary)] font-semibold">
                    {total} post{total !== 1 ? "s" : ""} in the last year
                </p>
            </div>

            {/* Calendar grid */}
            <div
                className="overflow-x-auto"
                style={{ WebkitOverflowScrolling: "touch" }}
            >
                <svg
                    width="100%"
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    preserveAspectRatio="xMinYMid meet"
                    aria-label={`Publishing activity: ${total} post${total !== 1 ? "s" : ""} in the last year`}
                    style={{ display: "block", minWidth: `${svgWidth}px` }}
                >
                    {/* Month labels */}
                    {monthLabels.map(({ week, label }) => (
                        <text
                            key={`m-${week}`}
                            x={labelWidth + week * (cellSize + cellGap)}
                            y={12}
                            className="fill-[var(--text-faint)]"
                            style={{ fontSize: "10px", fontFamily: "inherit" }}
                        >
                            {label}
                        </text>
                    ))}

                    {/* Day labels (Mon, Wed, Fri) */}
                    {[1, 3, 5].map((d) => (
                        <text
                            key={`d-${d}`}
                            x={0}
                            y={
                                headerHeight +
                                d * (cellSize + cellGap) +
                                cellSize -
                                2
                            }
                            className="fill-[var(--text-faint)]"
                            style={{ fontSize: "9px", fontFamily: "inherit" }}
                        >
                            {DAYS[d].slice(0, 3)}
                        </text>
                    ))}

                    {/* Cells */}
                    {grid.map((week, wi) =>
                        week.map((cell, di) => {
                            if (!cell) return null;
                            const count = days[cell.date] || 0;
                            const level = getLevel(count);
                            const color = isDark
                                ? LEVELS[level].dark
                                : LEVELS[level].light;
                            const label =
                                count === 0
                                    ? `No posts on ${formatDate(cell.date)}`
                                    : `${count} post${count !== 1 ? "s" : ""} on ${formatDate(cell.date)}`;

                            return (
                                <rect
                                    key={cell.date}
                                    data-cell={`${wi}-${di}`}
                                    x={labelWidth + wi * (cellSize + cellGap)}
                                    y={headerHeight + di * (cellSize + cellGap)}
                                    width={cellSize}
                                    height={cellSize}
                                    rx={2}
                                    ry={2}
                                    fill={color}
                                    aria-label={label}
                                    tabIndex={
                                        focusedCell?.week === wi &&
                                        focusedCell?.day === di
                                            ? 0
                                            : -1
                                    }
                                    onKeyDown={(e) => handleKeyDown(e, wi, di)}
                                    onFocus={() =>
                                        setFocusedCell({ week: wi, day: di })
                                    }
                                    style={{
                                        outline: "none",
                                        cursor: "default",
                                    }}
                                >
                                    <title>{label}</title>
                                </rect>
                            );
                        }),
                    )}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 text-[10px] text-[var(--text-faint)]">
                <span>Less</span>
                {LEVELS.map((level, i) => (
                    <span
                        key={level.label}
                        className="inline-block rounded-sm"
                        style={{
                            width: "10px",
                            height: "10px",
                            backgroundColor: isDark ? level.dark : level.light,
                        }}
                        title={level.label}
                    />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
