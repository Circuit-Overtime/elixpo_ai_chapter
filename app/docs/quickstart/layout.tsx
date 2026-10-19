import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Transactional email quickstart",
    description:
        "Connect an SMTP sender, create an email template, sign a webhook request, and send your first transactional email with Elixpo Mails.",
    path: "/docs/quickstart",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
