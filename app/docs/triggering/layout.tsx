import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Trigger transactional email",
    description:
        "Send transactional email through signed Elixpo Mails webhook endpoints with variables and idempotency keys.",
    path: "/docs/triggering",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
