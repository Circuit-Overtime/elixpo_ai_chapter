import type { Metadata } from "next";
import DocsClientLayout from "./DocsClientLayout";

export const runtime = "edge";

export const metadata: Metadata = {
    title: {
        default: "Documentation",
        template: "%s | Elixpo Mails Docs",
    },
    description:
        "Developer documentation for Elixpo Mails. Read our guides, learn how to integrate transactional emails, design WYSIWYG templates, and trigger notifications via webhooks.",
    openGraph: {
        title: "Documentation — Elixpo Mails",
        description:
            "Developer documentation for Elixpo Mails. Read our guides, learn how to integrate transactional emails, design WYSIWYG templates, and trigger notifications via webhooks.",
        images: [
            {
                url: "/og-docs.png",
                width: 1200,
                height: 630,
                alt: "Elixpo Mails Developer Documentation",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Documentation — Elixpo Mails",
        description:
            "Developer documentation for Elixpo Mails. Read our guides, learn how to integrate transactional emails, design WYSIWYG templates, and trigger notifications via webhooks.",
        images: ["/og-docs.png"],
    },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <DocsClientLayout>{children}</DocsClientLayout>;
}
