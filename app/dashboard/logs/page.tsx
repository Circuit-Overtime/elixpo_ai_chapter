export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box } from "@mui/material";
import { PageHeader } from "../../components/dashboard-ui";
import LogsManager from "../../components/logs-manager";

export default async function LogsPage() {
    await requireDashboardSession();
    return (
        <Box>
            <PageHeader
                title="Delivery logs"
                description="Every triggered send — success or failure — is recorded here with its recipient, status, and the variables merged in."
            />
            <LogsManager />
        </Box>
    );
}
