export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box, Container } from "@mui/material";
import DashboardTopbar, { type DashboardUser } from "../../components/dashboard-topbar";
import WorkspaceConsole from "../../components/workspace-console";

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
    const session = await requireDashboardSession();
    const { slug } = await params;

    const user: DashboardUser = {
        name: session.name || "",
        email: session.email,
        avatar: session.avatar ?? null,
        tenantId: session.tenantId,
    };

    return (
        <Box sx={{ position: "relative", minHeight: "100vh", color: "var(--fg)" }}>
            <DashboardTopbar user={user} />
            <Box component="main">
                <Container maxWidth="lg" sx={{ py: { xs: 3.5, md: 5 }, px: { xs: 2, md: 3 } }}>
                    <WorkspaceConsole slug={slug} initialTenantId={session.tenantId} />
                </Container>
            </Box>
        </Box>
    );
}
