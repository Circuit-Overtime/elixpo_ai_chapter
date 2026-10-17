import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "User Management API",
    "Read verified user identity and profile data from Elixpo Accounts with OAuth scopes, access tokens, and the user information API.",
    "/docs/users-api",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
