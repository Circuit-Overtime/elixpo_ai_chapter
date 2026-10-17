export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { resolveActiveRole } from "@/lib/workspace-guard";
import { Box, Container } from "@mui/material";
import type React from "react";
import ContextualTip from "../components/contextual-tip";
import DashboardTopbar, { type DashboardUser } from "../components/dashboard-topbar";
import { RoleProvider } from "../components/role-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await requireDashboardSession();

    const user: DashboardUser = {
        name: session.name || "",
        email: session.email,
        avatar: session.avatar ?? null,
        tenantId: session.tenantId,
    };

    // Live role from the DB → drives UI write-gating (mirrors the API guards).
    const role = (await resolveActiveRole(session)) ?? "viewer";

    return (
        <RoleProvider role={role}>
            <Box sx={{ position: "relative", minHeight: "100vh", color: "var(--fg)" }}>
                {/* Aurora background is global (root layout). Top nav, full-width content. */}
                <DashboardTopbar user={user} />
                <Box component="main">
                    <Container maxWidth="lg" sx={{ py: { xs: 3.5, md: 5 }, px: { xs: 2, md: 3 } }}>
                        {children}
                    </Container>
                </Box>
                <ContextualTip />
            </Box>
        </RoleProvider>
    );
}
