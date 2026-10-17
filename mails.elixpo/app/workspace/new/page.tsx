export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box, Container } from "@mui/material";
import CreateWorkspace from "../../components/create-workspace";
import DashboardTopbar, { type DashboardUser } from "../../components/dashboard-topbar";

export default async function NewWorkspacePage() {
    const session = await requireDashboardSession();
    const user: DashboardUser = {
        name: session.name || "",
        email: session.email,
        avatar: session.avatar ?? null,
        tenantId: session.tenantId,
    };
    return (
        <Box sx={{ minHeight: "100vh", color: "var(--fg)" }}>
            <DashboardTopbar user={user} />
            <Container maxWidth="lg" sx={{ py: { xs: 3.5, md: 5 } }}>
                <CreateWorkspace />
            </Container>
        </Box>
    );
}
