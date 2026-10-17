import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
        default: "Elixpo Admin — Cloudflare Control Plane",
        template: "%s | Elixpo Admin",
    },
    description:
        "Elixpo Admin is the centralized control plane for the Elixpo platform, providing real-time observability across Cloudflare Pages, Workers, D1, KV, Queues, Durable Objects, Workflows, deployments, analytics, and platform health from a single secure dashboard.",
    applicationName: "Elixpo Admin",
    keywords: [
        "Elixpo",
        "Elixpo Admin",
        "Cloudflare",
        "Cloudflare Pages",
        "Cloudflare Workers",
        "Cloudflare D1",
        "Cloudflare KV",
        "Cloudflare Queues",
        "Cloudflare Workflows",
        "admin",
        "dashboard",
        "observability",
        "status",
        "analytics",
        "D1",
        "KV",
        "Workers",
        "Infrastructure",
        "Infrastructure Management",
        "Admin Dashboard",
        "Platform Monitoring",
        "Platform Health",
    ],
    authors: [{ name: "Elixpo", url: "https://elixpo.com" }],
    creator: "Elixpo",
    publisher: "Elixpo",
    metadataBase: new URL("https://admin.elixpo.com"),
    alternates: { canonical: "/" },
    // App is admin-gated → default noindex; the public /status page overrides this.
    robots: { index: false, follow: false },
    openGraph: {
        type: "website",
        siteName: "Elixpo Admin",
        title: "Elixpo Admin — Platform Operations & Cloudflare Control Plane",
        description:
            "Monitor and manage the entire Elixpo platform with centralized infrastructure management, live platform health, deployment insights, and Cloudflare observability.",
        url: "https://admin.elixpo.com",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Elixpo Admin Dashboard",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Elixpo Admin — Platform Operations & Cloudflare Control Plane",
        description:
            "Monitor and manage the entire Elixpo platform with centralized infrastructure management, live platform health, deployment insights, and Cloudflare observability.",
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
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}
