import ListView, { type ListItem } from "@/components/list-view";
import { discoverAccount } from "@/lib/discovery";
import { metaFor } from "@/lib/enrich";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function KvListPage() {
    const inv = await discoverAccount();
    const items: ListItem[] = inv.kv.map((k) => ({
        id: k.id,
        primary: k.title,
        secondary: `${metaFor(k.title).label} · ${k.id}`,
        href: `/dashboard/kv/${k.id}`,
    }));
    return (
        <ListView
            title="KV namespaces"
            subtitle="Click a namespace to view metrics and browse keys"
            panelTitle={`${items.length} namespaces`}
            items={items}
            emptyMessage="No KV namespaces found."
            error={inv.errors.kv?.error}
        />
    );
}
