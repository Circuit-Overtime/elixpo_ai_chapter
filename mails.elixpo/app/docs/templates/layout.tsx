import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
    title: "Email templates and variables",
    description:
        "Build reusable transactional email templates with visual editing, live preview, and per-recipient variables.",
    path: "/docs/templates",
    image: "/og-docs.png",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
