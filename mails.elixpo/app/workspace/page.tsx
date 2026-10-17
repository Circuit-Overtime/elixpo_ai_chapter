export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { requireDashboardSession } from "@/lib/dashboard-session";
import { getWorkspaceInfo } from "@/lib/workspace";
import { redirect } from "next/navigation";

/** /workspace — redirect to the active workspace's slugged page. */
export default async function WorkspaceIndex() {
    const session = await requireDashboardSession();
    let slug: string | null = null;
    try {
        const db = await getDatabase();
        const info = await getWorkspaceInfo(db, session.tenantId);
        slug = info?.slug || null;
    } catch {
        slug = null;
    }
    if (!slug) redirect("/workspace/new");
    redirect(`/workspace/${slug}`);
}
