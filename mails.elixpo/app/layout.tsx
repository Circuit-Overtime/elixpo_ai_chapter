import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BackgroundAurora from "./components/background-aurora";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "./components/theme-provider";
import "./globals.css";

const SITE_URL = "https://mails.elixpo.com";
const TAGLINE = "Elixpo Mails — Event-Based Transactional Emails";
const OG_IMAGE = {
    url: "/og-image.png",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: TAGLINE,
};

export const viewport: Viewport = {
    themeColor: "#0b0d12",
    colorScheme: "dark",
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
    description:
        "Elixpo Mails — event-based transactional email for the Elixpo suite. Bring your own sender (SMTP / Gmail, encrypted), design on-brand emails with {{variables}} in a live WYSIWYG editor, and trigger sends from your service with HMAC-signed webhooks — attachments, one-click unsubscribe, and delivery logs, on Cloudflare's edge.",
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
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: SITE_URL,
        siteName: "Elixpo Mails",
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
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: "mail.elixpo",
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
        {
            "@type": "SoftwareApplication",
            name: "mail.elixpo",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: SITE_URL,
            description:
                "Event-based transactional email for the Elixpo ecosystem — bring your own sender, design templates with {{variable}} placeholders in a WYSIWYG editor, and trigger sends via webhook on Cloudflare's edge.",
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
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
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
