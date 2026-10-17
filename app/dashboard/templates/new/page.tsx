export const runtime = "edge";

import { requireDashboardSession } from "@/lib/dashboard-session";
import TemplateComposer from "../../../components/template-composer";

export default async function NewTemplatePage() {
    await requireDashboardSession();
    return <TemplateComposer />;
}
