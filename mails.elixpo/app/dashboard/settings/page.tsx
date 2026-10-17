export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { requireDashboardSession } from "@/lib/dashboard-session";
import { getTenant } from "@/lib/tenant";
import GroupsIcon from "@mui/icons-material/Groups";
import LockIcon from "@mui/icons-material/Lock";
import { Box, Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { PRIMARY_BTN, PageHeader } from "../../components/dashboard-ui";
import DriveConnectionCard from "../../components/drive-connection-card";
import { GlassCard } from "../../components/glass-card";
import WorkspaceNameForm from "../../components/workspace-name-form";

const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const BORDER = "var(--border)";

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <Box>
            <Typography
                sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--fg-faint)",
                    mb: 0.7,
                }}
            >
                {label}
            </Typography>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 1.6,
                    py: 1.15,
                    borderRadius: "10px",
                    border: `1px solid ${BORDER}`,
                    background: "var(--field-bg)",
                }}
            >
                <Typography
                    sx={{
                        fontSize: "0.92rem",
                        color: value ? "var(--fg)" : "var(--fg-faint)",
                        fontFamily: mono ? "var(--font-geist-mono)" : undefined,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {value || "—"}
                </Typography>
                <LockIcon sx={{ fontSize: 15, color: "var(--fg-faint)", flexShrink: 0 }} />
            </Box>
        </Box>
    );
}

export default async function SettingsPage() {
    const session = await requireDashboardSession();

    let workspaceName = "";
    try {
        const db = await getDatabase();
        const tenant = await getTenant(db, session.tenantId);
        workspaceName = tenant?.name || "";
    } catch {
        workspaceName = "";
    }

    return (
        <Box>
            <PageHeader
                title="Settings"
                description="Manage your workspace and review the identity synced from Elixpo Accounts."
            />

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(12, 1fr)" },
                    gap: 2.5,
                    alignItems: "start",
                }}
            >
                {/* Workspace — editable */}
                <Box sx={{ gridColumn: { md: "span 7" } }}>
                    <GlassCard>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT, mb: 0.4 }}
                        >
                            Workspace
                        </Typography>
                        <Typography sx={{ color: TEXT_55, fontSize: "0.88rem", mb: 2.5 }}>
                            Your business name across mail.elixpo. The workspace ID is a fixed
                            internal identifier and can&rsquo;t be changed.
                        </Typography>

                        <WorkspaceNameForm initialName={workspaceName} />

                        <Box sx={{ mt: 2.5 }}>
                            <ReadOnlyField label="Workspace ID" value={session.tenantId} mono />
                        </Box>
                    </GlassCard>
                </Box>

                {/* Account identity — read-only from Accounts */}
                <Box sx={{ gridColumn: { md: "span 5" } }}>
                    <GlassCard>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT, mb: 0.4 }}
                        >
                            Account identity
                        </Typography>
                        <Typography sx={{ color: TEXT_55, fontSize: "0.88rem", mb: 2.5 }}>
                            Read-only — synced from your Elixpo Accounts profile.
                        </Typography>
                        <Stack spacing={2}>
                            <ReadOnlyField label="Name" value={session.name || ""} />
                            <ReadOnlyField label="Email" value={session.email} />
                            <ReadOnlyField label="Account ID" value={session.uid} mono />
                        </Stack>
                    </GlassCard>
                </Box>

                {/* Connections — Google Drive for attachments */}
                <Box sx={{ gridColumn: { md: "span 7" } }}>
                    <DriveConnectionCard />
                </Box>

                {/* Team & access */}
                <Box sx={{ gridColumn: { md: "span 5" } }}>
                    <GlassCard>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT, mb: 0.4 }}
                        >
                            Team &amp; access
                        </Typography>
                        <Typography sx={{ color: TEXT_55, fontSize: "0.88rem", mb: 2 }}>
                            Invite people to this workspace, set roles (admin, writer, viewer), and
                            approve join requests.
                        </Typography>
                        <Button
                            component={Link}
                            href="/workspace"
                            startIcon={<GroupsIcon sx={{ fontSize: "1.1rem !important" }} />}
                            sx={{ ...PRIMARY_BTN, whiteSpace: "nowrap" }}
                        >
                            Manage workspace
                        </Button>
                    </GlassCard>
                </Box>
            </Box>
        </Box>
    );
}
