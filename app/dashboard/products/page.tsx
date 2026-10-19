export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import { Box } from "@mui/material";
import { PageHeader } from "../../components/dashboard-ui";
import ProductsManager from "../../components/products-manager";

export default async function ProductsPage() {
    await requireDashboardSession();
    return (
        <Box>
            <PageHeader
                title="Products"
                description="Group your templates and issue the credentials your service uses to trigger sends."
            />
            <ProductsManager />
        </Box>
    );
}
