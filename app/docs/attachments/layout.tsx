import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Email attachments",
    description:
        "Attach Google Drive files, fixed URLs, or per-recipient variable files to transactional email templates.",
    path: "/docs/attachments",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
