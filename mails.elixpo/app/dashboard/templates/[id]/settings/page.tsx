export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import TemplateSettings from "../../../../components/template-settings";

export default async function TemplateSettingsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireDashboardSession();
    const { id } = await params;
    return <TemplateSettings templateId={id} />;
}
