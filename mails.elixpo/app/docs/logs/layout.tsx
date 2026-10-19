import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Email delivery logs",
    description:
        "Inspect sent, queued, failed, and suppressed transactional email attempts with SMTP responses and delivery context.",
    path: "/docs/logs",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
