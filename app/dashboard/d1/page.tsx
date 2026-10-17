import ListView, { type ListItem } from "@/components/list-view";
import { discoverAccount } from "@/lib/discovery";
import { fmtBytes } from "@/lib/format";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function D1ListPage() {
    const inv = await discoverAccount();
    const items: ListItem[] = inv.d1.map((d) => ({
        id: d.uuid,
        primary: d.name,
        secondary: `${d.num_tables ?? "?"} tables · ${d.file_size != null ? fmtBytes(d.file_size) : "?"}`,
        href: `/dashboard/d1/${d.uuid}`,
    }));
    return (
        <ListView
            title="D1 databases"
            subtitle="Click a database to view metrics and run queries"
            panelTitle={`${items.length} databases`}
            items={items}
            emptyMessage="No D1 databases found."
            error={inv.errors.d1?.error}
        />
    );
}
