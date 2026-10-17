import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: {
        default: "Elixpo Status - Live service health & uptime",
        template: "%s - Elixpo Status",
    },
    description:
        "Check the real-time operational status of all Elixpo services - including Sketch, Blogs, Accounts, Payouts, Mail, Portfolio and more. View 90 days of uptime history, live incident updates, and service health indicators powered directly by real Cloudflare traffic data. No third-party tool, no manual updates - always accurate.",
    applicationName: "Elixpo Status",
    keywords: [
        "Elixpo",
        "Elixpo status",
        "status page",
        "uptime",
        "service status",
        "operational status",
        "incident",
        "system status",
        "Cloudflare",
        "uptime history",
        "live incidents",
        "elixpo sketch status",
        "elixpo accounts status",
        "elixpo blogs status",
        "elixpo payouts status",
        "is elixpo down",
        "elixpo service health",
    ],
    authors: [{ name: "Elixpo", url: "https://elixpo.com" }],
    creator: "Elixpo",
    publisher: "Elixpo",
    category: "technology",
    metadataBase: new URL("https://status.elixpo.com"),
    alternates: { canonical: "/" },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
        type: "website",
        siteName: "Elixpo Status",
        locale: "en_US",
        title: "Elixpo Status - Live service health & uptime",
        description:
            "Live health dashboard for all Elixpo services. See which services are operational, degraded, or experiencing an outage - with 90 days of uptime history.",
        url: "https://status.elixpo.com",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Elixpo Status - live health of every Elixpo service",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Elixpo Status - Live service health & uptime",
        description:
            "Live health dashboard for all Elixpo services. See which services are operational, degraded, or experiencing an outage - with 90 days of uptime history.",
        images: ["/og-image.png"],
    },
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/icon.png", sizes: "32x32", type: "image/png" },
            { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    },
    manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
    themeColor: "#faf9f7",
    colorScheme: "light",
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
