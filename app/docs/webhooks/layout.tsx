import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "Authentication Webhooks",
    "Receive signed user, authorization, and application lifecycle events with per-endpoint secrets, retries, timestamp validation, and deduplication.",
    "/docs/webhooks",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
