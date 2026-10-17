import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "Authentication Quickstart",
    "Add branded sign-in and sign-out to your application with Elixpo Accounts using OAuth 2.0, PKCE, hosted account screens, or the TypeScript SDK.",
    "/docs/quickstart",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
