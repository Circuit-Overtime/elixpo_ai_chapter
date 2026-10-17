import { createDocsMetadata } from "../seo";

export const runtime = "edge";

export const metadata = createDocsMetadata(
    "Self-Hosting Elixpo Accounts",
    "Run the open Elixpo Accounts authentication platform with Next.js, Cloudflare Pages, D1, KV, Web Crypto, and your own deployment configuration.",
    "/docs/self-hosting",
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
