import type { Metadata } from "next";

export const SITE_URL = "https://mails.elixpo.com";
export const SITE_NAME = "Elixpo Mails";
export const SITE_DESCRIPTION =
    "Developer-first transactional email infrastructure with visual templates, team workspaces, signed webhooks, delivery logs, and bring-your-own SMTP.";

export function absoluteUrl(path: string): string {
    return new URL(path, SITE_URL).toString();
}

export function jsonLd(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function pageMetadata({
    title,
    description,
    path,
    image = "/og-image.png",
}: {
    title: string;
    description: string;
    path: string;
    image?: string;
}): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            title,
            description,
            url: path,
            images: [{ url: image, width: 1200, height: 630, alt: `${title} — ${SITE_NAME}` }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}

export const PRIVATE_METADATA: Metadata = {
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};
