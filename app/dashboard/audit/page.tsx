import { listAudit } from "@/lib/audit";
import { safe } from "@/lib/cloudflare-api";
import AuditView from "./audit-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AuditPage() {
    const res = await safe(() => listAudit(150));
    return (
        <AuditView
            entries={res.ok ? res.data : []}
            error={
                res.ok
                    ? null
                    : `Audit log unavailable (admin-cache KV not reachable): ${res.error}`
            }
        />
    );
}
