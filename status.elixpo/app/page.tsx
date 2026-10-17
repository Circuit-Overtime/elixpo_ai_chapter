/**
 * PUBLIC status page at the site root (/) — live health of every Elixpo
 * product, derived from Cloudflare edge analytics (per-host status codes).
 * No third-party uptime tool needed; this is Cloudflare-native.
 *
 * The SSR payload is built (and KV-cached) by buildStatus(); the client view
 * layers a 1h localStorage cache + manual refresh on top to minimise calls.
 */

import { buildStatus } from "@/lib/status-data";
import type { Metadata } from "next";
import StatusView from "./status-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STATUS_TITLE = "Elixpo Status — Live service health & uptime";
const STATUS_DESC =
    "Real-time operational status, uptime history, and request health (2xx/3xx/4xx/5xx) for every Elixpo service — blogs, sketch, accounts, payouts, mail and more.";
const STATUS_URL = "https://status.elixpo.com";

export const metadata: Metadata = {
    title: STATUS_TITLE,
    description: STATUS_DESC,
    metadataBase: new URL("https://status.elixpo.com"),
    applicationName: "Elixpo Status",
    keywords: [
        "Elixpo",
        "status",
        "uptime",
        "service status",
        "incident",
        "operational status",
        "Elixpo status page",
    ],
    alternates: { canonical: STATUS_URL },
    robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/icon.png", sizes: "32x32", type: "image/png" },
            { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
        apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    },
    openGraph: {
        type: "website",
        siteName: "Elixpo Status",
        title: STATUS_TITLE,
        description: STATUS_DESC,
        url: STATUS_URL,
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Elixpo Status — live health of every Elixpo service",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: STATUS_TITLE,
        description: STATUS_DESC,
        images: ["/og-image.png"],
    },
};

/** Rich-result structured data (schema.org). Keeps the org/site graph stable
 * for crawlers; the live status itself is rendered in the page body. */
const JSON_LD = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": "https://elixpo.com/#organization",
            name: "Elixpo",
            url: "https://elixpo.com",
            logo: "https://status.elixpo.com/logo.png",
            sameAs: ["https://github.com/elixpo"],
        },
        {
            "@type": "WebSite",
            "@id": "https://status.elixpo.com/#website",
            url: STATUS_URL,
            name: "Elixpo Status",
            description: STATUS_DESC,
            inLanguage: "en",
            publisher: { "@id": "https://elixpo.com/#organization" },
        },
        {
            "@type": "WebPage",
            "@id": "https://status.elixpo.com/#webpage",
            url: STATUS_URL,
            name: STATUS_TITLE,
            description: STATUS_DESC,
            isPartOf: { "@id": "https://status.elixpo.com/#website" },
            about: { "@id": "https://elixpo.com/#organization" },
            primaryImageOfPage: "https://status.elixpo.com/og-image.png",
        },
    ],
};

export default async function StatusPage() {
    const initial = await buildStatus();
    return (
        <>
            <script
                type="application/ld+json"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inlined as a script.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
            />
            <StatusView initial={initial} />
        </>
    );
}
