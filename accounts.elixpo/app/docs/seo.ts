import type { Metadata } from "next";

export function createDocsMetadata(
    title: string,
    description: string,
    path: string,
): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            url: path,
            title,
            description,
            images: [
                {
                    url: "/og-docs.png",
                    width: 1280,
                    height: 720,
                    alt: `${title} — Elixpo Accounts documentation`,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: ["/og-docs.png"],
        },
    };
}
