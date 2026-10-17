"use client";

import { C, PageHeader, Panel, StatusChip } from "@/components/ui";
import type { SectionError } from "@/lib/discovery";
import { Box, Typography } from "@mui/material";

const SECTION_LABELS: Record<string, string> = {
    pages: "Pages",
    workers: "Workers",
    d1: "D1",
    kv: "KV",
    queues: "Queues",
    durableObjects: "Durable Objects",
    workflows: "Workflows",
    zones: "Zones",
};

function Row({
    label,
    value,
    mono,
}: { label: string; value: string; mono?: boolean }) {
    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: "space-between",
                py: 0.85,
                borderBottom: `1px solid ${C.border}`,
            }}
        >
            <Typography sx={{ color: C.textMuted, fontSize: "0.8rem" }}>
                {label}
            </Typography>
            <Typography
                sx={{
                    color: C.text,
                    fontSize: "0.8rem",
                    fontFamily: mono
                        ? "var(--font-geist-mono), monospace"
                        : undefined,
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}

export default function SettingsView({
    accountId,
    fetchedAt,
    errors,
}: {
    accountId: string;
    fetchedAt: number;
    errors: Record<string, SectionError>;
}) {
    return (
        <Box>
            <PageHeader
                title="Settings"
                subtitle="Token scopes & discovery health"
            />
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: 1.5,
                }}
            >
                <Panel title="Account">
                    <Row label="Account ID" value={accountId} mono />
                    <Row
                        label="Discovery cached at"
                        value={new Date(fetchedAt).toLocaleString()}
                    />
                </Panel>

                <Panel title="Discovery / token scope health">
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.76rem",
                            mb: 1.25,
                        }}
                    >
                        A failing section usually means CF_API_TOKEN is missing
                        that scope, or the product isn't enabled.
                    </Typography>
                    {Object.entries(SECTION_LABELS).map(([key, label]) => (
                        <Box
                            key={key}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                py: 0.8,
                                borderBottom: `1px solid ${C.border}`,
                            }}
                        >
                            <Typography
                                sx={{ color: C.text, fontSize: "0.82rem" }}
                            >
                                {label}
                            </Typography>
                            {errors[key] ? (
                                <StatusChip
                                    label="unavailable"
                                    tone="warning"
                                />
                            ) : (
                                <StatusChip label="ok" tone="success" />
                            )}
                        </Box>
                    ))}
                </Panel>
            </Box>
        </Box>
    );
}
