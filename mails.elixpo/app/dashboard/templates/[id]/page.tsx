export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import TemplateComposer from "../../../components/template-composer";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
    await requireDashboardSession();
    const { id } = await params;
    return <TemplateComposer templateId={id} />;
}
