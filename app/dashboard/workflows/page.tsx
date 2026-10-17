import ListView, { type ListItem } from "@/components/list-view";
import { discoverAccount } from "@/lib/discovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
    const inv = await discoverAccount();
    const items: ListItem[] = inv.workflows.map((w) => ({
        id: w.name,
        primary: w.name,
        secondary:
            [w.class_name, w.script_name].filter(Boolean).join(" · ") ||
            undefined,
    }));
    return (
        <ListView
            title="Workflows"
            subtitle="Durable, multi-step Workflows. New ones appear here automatically."
            panelTitle={`${items.length} workflows`}
            items={items}
            emptyMessage="No Workflows yet — create one and it'll show up here."
            error={inv.errors.workflows?.error}
        />
    );
}
