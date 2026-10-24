import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "OAuth 2.0 & OpenID Connect",
    "Integrate authorization code flow, S256 PKCE, refresh-token rotation, revocation, scopes, account selection, and OpenID Connect with Elixpo Accounts.",
    "/docs/oauth",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
