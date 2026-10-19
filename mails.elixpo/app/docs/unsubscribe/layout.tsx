import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "One-click unsubscribe and suppression",
    description:
        "Use RFC 8058 one-click unsubscribe headers and workspace suppression controls for non-transactional email.",
    path: "/docs/unsubscribe",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
