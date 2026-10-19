import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Webhook authentication",
    description:
        "Authenticate Elixpo Mails webhook requests with timestamped HMAC-SHA256 signatures and replay protection.",
    path: "/docs/authentication",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
