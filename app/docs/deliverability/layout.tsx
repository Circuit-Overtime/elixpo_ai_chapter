import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Gmail deliverability and sender authentication",
    description:
        "Configure SPF, DKIM, DMARC, TLS, one-click unsubscribe, consent, reputation monitoring, and gradual volume ramp-up for Elixpo Mails.",
    path: "/docs/deliverability",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
