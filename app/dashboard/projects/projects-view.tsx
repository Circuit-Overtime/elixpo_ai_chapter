"use client";

import { KpiTile, PageHeader, fmt, trend } from "@/components/ui";
import { Box } from "@mui/material";

export interface ProjItem {
    name: string;
    label: string;
    domain?: string;
    available: boolean;
    requests: number;
    spark: number[];
}

export default function ProjectsView({ projects }: { projects: ProjItem[] }) {
    return (
        <Box>
            <PageHeader
                title="Projects"
                subtitle="Every Cloudflare project, with its traffic. Click through for bindings & full monitoring."
                timeRange
            />
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 1.5,
                }}
            >
                {projects.map((p) => (
                    <KpiTile
                        key={p.name}
                        label={p.label}
                        value={p.available ? fmt(p.requests) : "—"}
                        sub={p.domain || p.name}
                        spark={p.spark}
                        delta={p.spark.length ? trend(p.spark) : null}
                        href={`/dashboard/projects/${p.name}`}
                    />
                ))}
            </Box>
        </Box>
    );
}
