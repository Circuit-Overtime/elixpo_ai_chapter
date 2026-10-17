import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "Developer SDK — @elixpo/accounts",
    "Use the edge-safe @elixpo/accounts TypeScript SDK for OAuth discovery, S256 PKCE, callback validation, token rotation, revocation, and JWKS verification.",
    "/docs/lixaccounts",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
