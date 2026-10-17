import ListView, { type ListItem } from "@/components/list-view";
import { discoverAccount } from "@/lib/discovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function QueuesPage() {
    const inv = await discoverAccount();
    const items: ListItem[] = inv.queues.map((q) => {
        const consumers = q.consumers_total_count ?? 0;
        return {
            id: q.queue_id,
            primary: q.queue_name,
            secondary: `${q.producers_total_count ?? 0} producers · ${consumers} consumers · ${q.queue_id}`,
            chip:
                consumers === 0
                    ? { label: "no consumer", tone: "warning" as const }
                    : { label: "active", tone: "success" as const },
        };
    });
    return (
        <ListView
            title="Queues"
            subtitle="A queue with no consumer will accumulate unprocessed messages"
            panelTitle={`${items.length} queues`}
            items={items}
            emptyMessage="No queues found."
            error={inv.errors.queues?.error}
        />
    );
}
