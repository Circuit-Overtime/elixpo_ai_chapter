import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, jsonLd } from "@/lib/seo";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BackgroundAurora from "./components/background-aurora";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "./components/theme-provider";
import "./globals.css";

const TAGLINE = "Elixpo Mails — Event-Based Transactional Emails";
const OG_IMAGE = {
    url: "/og-image.png",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: TAGLINE,
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
        { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    ],
    colorScheme: "light dark",
};

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: {
        // Every route shows the Elixpo Mails tagline by default; pages that set
        // their own title get it appended ("Pricing · Elixpo Mails").
        default: TAGLINE,
        template: "%s · Elixpo Mails",
    },
    description: SITE_DESCRIPTION,
    keywords: [
        "Elixpo Mails",
        "Elixpo",
        "transactional email",
        "event-based email",
        "email templates",
        "email API",
        "WYSIWYG email",
        "webhook email",
        "HMAC webhooks",
        "SMTP",
        "List-Unsubscribe",
        "multi-tenant",
        "bring your own sender",
        "Cloudflare",
    ],
    authors: [{ name: "Elixpo", url: "https://elixpo.com" }],
    creator: "Elixpo",
    publisher: "Elixpo",
    applicationName: "Elixpo Mails",
    category: "technology",
    metadataBase: new URL(SITE_URL),
    manifest: "/manifest.webmanifest",
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: SITE_URL,
        siteName: SITE_NAME,
        title: TAGLINE,
        description:
            "Event-based transactional email: bring your own sender, design templates with {{variables}}, and trigger sends with HMAC-signed webhooks — on Cloudflare's edge.",
        images: [OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: TAGLINE,
        description:
            "The transactional email layer for modern software — bring your own sender, design on-brand templates with live preview, and send via signed webhook.",
        images: [OG_IMAGE.url],
    },
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
    icons: {
        // Served as static assets from public/. Kept out of app/ so
        // @cloudflare/next-on-pages doesn't turn each into an edge route.
        icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/icon.png", sizes: "256x256", type: "image/png" },
            { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        shortcut: "/favicon.ico",
        apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
};

// Structured data so search engines render rich results for the org + product.
const JSON_LD = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "Elixpo",
            url: "https://elixpo.com",
            logo: `${SITE_URL}/icon-512.png`,
            sameAs: ["https://github.com/elixpo"],
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_NAME,
            alternateName: ["mails.elixpo", "Elixpo transactional email"],
            inLanguage: "en",
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
        {
            "@type": "SoftwareApplication",
            "@id": `${SITE_URL}/#software`,
            name: SITE_NAME,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            featureList: [
                "Visual email template editor",
                "HMAC-signed webhook delivery",
                "Bring-your-own SMTP",
                "Team workspaces and roles",
                "Delivery logs and suppression management",
            ],
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
    ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" data-theme="light" suppressHydrationWarning>
            <head>
                {/* Set the saved theme before first paint (no flash). */}
                <script
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
                />
            </head>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: jsonLd(JSON_LD) }}
                />
                <ThemeProvider>
                    {/* Aurora behind every route — fades out in light theme via
                        the --aurora-opacity token. */}
                    <BackgroundAurora />
                    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
                        {children}
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
