"use client";

import { Empty, PageHeader, Panel, StatusChip } from "@/components/ui";
import type { AuditEntry } from "@/lib/audit";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "@mui/material";

export default function AuditView({
    entries,
    error,
}: { entries: AuditEntry[]; error?: string | null }) {
    return (
        <Box>
            <PageHeader
                title="Audit log"
                subtitle="Every admin write action, newest first"
            />
            <Panel title={`${entries.length} entries`}>
                {error ? (
                    <Empty message={error} />
                ) : entries.length === 0 ? (
                    <Empty message="No admin actions recorded yet." />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {["When", "Actor", "Action", "Target"].map(
                                    (h) => (
                                        <TableCell
                                            key={h}
                                            sx={{
                                                color: "#9b7bf7",
                                                fontWeight: 700,
                                                fontSize: "0.78rem",
                                                borderBottom:
                                                    "1px solid rgba(255,255,255,0.1)",
                                            }}
                                        >
                                            {h}
                                        </TableCell>
                                    ),
                                )}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((e, i) => (
                                <TableRow
                                    key={i}
                                    sx={{
                                        "&:hover": {
                                            bgcolor: "rgba(155,123,247,0.04)",
                                        },
                                    }}
                                >
                                    <TableCell
                                        sx={{
                                            color: "rgba(245,245,244,0.7)",
                                            fontSize: "0.78rem",
                                            borderBottom:
                                                "1px solid rgba(255,255,255,0.05)",
                                        }}
                                    >
                                        {new Date(e.ts).toLocaleString()}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            color: "rgba(245,245,244,0.85)",
                                            fontSize: "0.78rem",
                                            borderBottom:
                                                "1px solid rgba(255,255,255,0.05)",
                                        }}
                                    >
                                        {e.actor}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            borderBottom:
                                                "1px solid rgba(255,255,255,0.05)",
                                        }}
                                    >
                                        <StatusChip
                                            label={e.action}
                                            tone="info"
                                        />
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            color: "rgba(245,245,244,0.6)",
                                            fontSize: "0.76rem",
                                            fontFamily:
                                                "var(--font-geist-mono), monospace",
                                            borderBottom:
                                                "1px solid rgba(255,255,255,0.05)",
                                        }}
                                    >
                                        {e.target || "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Panel>
        </Box>
    );
}
