"use client";

/**
 * D1 SQL query console — a textarea + Run, with table shortcuts and a results
 * grid. Phase 1 is read-only (SELECT/WITH/EXPLAIN/PRAGMA), enforced server-side.
 */

import { PlayArrow } from "@mui/icons-material";
import {
    Box,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import { useState } from "react";

interface QueryResult {
    results?: Record<string, unknown>[];
    meta?: {
        duration?: number;
        rows_read?: number;
        rows_written?: number;
    } | null;
    error?: string;
}

export default function QueryConsole({
    dbId,
    tables,
}: {
    dbId: string;
    tables: string[];
}) {
    const [sql, setSql] = useState(
        "SELECT name FROM sqlite_master WHERE type='table';",
    );
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<QueryResult | null>(null);

    async function run() {
        setRunning(true);
        setResult(null);
        try {
            const res = await fetch(`/api/cf/d1/${dbId}/query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sql }),
            });
            const body = (await res.json()) as QueryResult & { error?: string };
            if (!res.ok)
                setResult({ error: body.error || `Error ${res.status}` });
            else setResult(body);
        } catch (e) {
            setResult({ error: (e as Error).message });
        } finally {
            setRunning(false);
        }
    }

    const rows = result?.results || [];
    const columns = rows.length ? Object.keys(rows[0]) : [];

    return (
        <Box>
            {tables.length > 0 && (
                <Box
                    sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.75,
                        mb: 1.5,
                    }}
                >
                    {tables.map((t) => (
                        <Chip
                            key={t}
                            label={t}
                            size="small"
                            onClick={() =>
                                setSql(`SELECT * FROM "${t}" LIMIT 100;`)
                            }
                            sx={{
                                height: 24,
                                fontSize: "0.72rem",
                                fontFamily: "var(--font-geist-mono), monospace",
                                color: "#86efac",
                                bgcolor: "rgba(134,239,172,0.1)",
                                border: "1px solid rgba(134,239,172,0.25)",
                                cursor: "pointer",
                                "&:hover": { bgcolor: "rgba(134,239,172,0.2)" },
                            }}
                        />
                    ))}
                </Box>
            )}

            <Box
                component="textarea"
                value={sql}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setSql(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
                }}
                spellCheck={false}
                sx={{
                    width: "100%",
                    minHeight: 120,
                    resize: "vertical",
                    p: 1.5,
                    borderRadius: "12px",
                    bgcolor: "rgba(0,0,0,0.35)",
                    color: "#f5f5f4",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    outline: "none",
                    "&:focus": { borderColor: "#9b7bf7" },
                }}
            />

            <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1.5 }}
            >
                <Button
                    onClick={run}
                    disabled={running}
                    startIcon={<PlayArrow />}
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: "#fff",
                        px: 2.5,
                        borderRadius: "10px",
                        background:
                            "linear-gradient(180deg, #a98cff 0%, #7c5cff 100%)",
                        "&:hover": {
                            background:
                                "linear-gradient(180deg, #b69aff 0%, #8b6cff 100%)",
                        },
                        "&.Mui-disabled": {
                            color: "rgba(255,255,255,0.5)",
                            background: "rgba(255,255,255,0.08)",
                        },
                    }}
                >
                    {running ? "Running…" : "Run"}
                </Button>
                <Typography
                    sx={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: "0.72rem",
                    }}
                >
                    ⌘/Ctrl + Enter · read-only (SELECT / WITH / EXPLAIN /
                    PRAGMA)
                </Typography>
                {result?.meta && (
                    <Typography
                        sx={{
                            color: "rgba(255,255,255,0.45)",
                            fontSize: "0.72rem",
                            ml: "auto",
                        }}
                    >
                        {rows.length} rows · {result.meta.rows_read ?? "?"} read
                        · {result.meta.duration ?? "?"}ms
                    </Typography>
                )}
            </Box>

            {result?.error && (
                <Box
                    sx={{
                        mt: 2,
                        p: 1.5,
                        borderRadius: "10px",
                        bgcolor: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: "0.8rem",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {result.error}
                </Box>
            )}

            {rows.length > 0 && (
                <TableContainer
                    sx={{
                        mt: 2,
                        maxHeight: 460,
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.08)",
                    }}
                >
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {columns.map((c) => (
                                    <TableCell
                                        key={c}
                                        sx={{
                                            bgcolor: "rgba(20,24,18,0.95)",
                                            color: "#9b7bf7",
                                            fontWeight: 700,
                                            fontSize: "0.78rem",
                                            borderBottom:
                                                "1px solid rgba(255,255,255,0.1)",
                                            fontFamily:
                                                "var(--font-geist-mono), monospace",
                                        }}
                                    >
                                        {c}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((r, i) => (
                                <TableRow
                                    key={i}
                                    sx={{
                                        "&:hover": {
                                            bgcolor: "rgba(155,123,247,0.04)",
                                        },
                                    }}
                                >
                                    {columns.map((c) => (
                                        <TableCell
                                            key={c}
                                            sx={{
                                                color: "rgba(245,245,244,0.85)",
                                                fontSize: "0.78rem",
                                                borderBottom:
                                                    "1px solid rgba(255,255,255,0.05)",
                                                fontFamily:
                                                    "var(--font-geist-mono), monospace",
                                                maxWidth: 360,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatCell(r[c])}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {result && !result.error && rows.length === 0 && (
                <Typography
                    sx={{
                        mt: 2,
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "0.85rem",
                    }}
                >
                    Query OK — 0 rows returned.
                </Typography>
            )}
        </Box>
    );
}

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}
