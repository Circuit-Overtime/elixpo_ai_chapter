import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "API Key Management",
    "Create and manage scoped API keys for Elixpo Accounts developer operations with secure hashing, expiration, and revocation.",
    "/docs/api-keys",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
