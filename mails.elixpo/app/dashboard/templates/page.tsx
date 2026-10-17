export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box } from "@mui/material";
import { PageHeader } from "../../components/dashboard-ui";
import TemplatesList from "../../components/templates-list";

export default async function TemplatesPage() {
    await requireDashboardSession();
    return (
        <Box>
            <PageHeader
                title="Templates"
                description="Design transactional emails in the visual editor with {{variable}} placeholders."
            />
            <TemplatesList />
        </Box>
    );
}
