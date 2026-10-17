import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "OAuth Error Reference",
    "Handle OAuth 2.0 authorization, token, scope, network, protocol, and verification errors returned by Elixpo Accounts and its TypeScript SDK.",
    "/docs/errors",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
