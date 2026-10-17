export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box } from "@mui/material";
import { PageHeader } from "../../components/dashboard-ui";
import SendersManager from "../../components/senders-manager";

export default async function SendersPage() {
    await requireDashboardSession();
    return (
        <Box>
            <PageHeader
                title="Senders"
                description="The mailboxes you send from — your email and app password, encrypted at rest and never returned. Each product has a default sender."
            />
            <SendersManager />
        </Box>
    );
}
