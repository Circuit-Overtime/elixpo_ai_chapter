export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import ProductDetail from "../../../components/product-detail";

export default async function ProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireDashboardSession();
    const { id } = await params;
    return <ProductDetail id={id} />;
}
