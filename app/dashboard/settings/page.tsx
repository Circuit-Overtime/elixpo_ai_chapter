import { discoverAccount } from "@/lib/discovery";
import SettingsView from "./settings-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    const inv = await discoverAccount();
    return (
        <SettingsView
            accountId={inv.accountId}
            fetchedAt={inv.fetchedAt}
            errors={inv.errors}
        />
    );
}
