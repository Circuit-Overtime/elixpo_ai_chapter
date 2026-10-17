import type { Metadata, Viewport } from "next";
import { ThemeModeProvider, ThemeModeScript } from "@/components/theme-mode";
import { Sofia_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://payouts.elixpo.com";
const OG_IMAGE = {
    url: "/og-image.png",
    width: 1423,
    height: 747,
    type: "image/png",
    alt: "Elixpo Pay — Payments & Payouts",
};

export const viewport: Viewport = {
    themeColor: "var(--app-bg)",
    colorScheme: "light",
};

const sofiaSans = Sofia_Sans({
    variable: "--font-sofia-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: {
        default: "Elixpo Pay — Payments & Payouts for the Elixpo ecosystem",
        template: "%s | Elixpo Pay",
    },
    description:
        "Add payments and payouts to your platform with one integration. Elixpo Pay charges your customers and pays your creators straight to their banks — Razorpay today, Stripe coming soon for international.",
    keywords: [
        "Elixpo",
        "Elixpo Pay",
        "payments",
        "payouts",
        "checkout",
        "Razorpay",
        "subscriptions",
        "entitlements",
        "billing",
    ],
    authors: [{ name: "Elixpo", url: "https://elixpo.com" }],
    creator: "Elixpo",
    publisher: "Elixpo",
    applicationName: "Elixpo Pay",
    category: "finance",
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: SITE_URL,
        siteName: "Elixpo Pay",
        title: "Elixpo Pay — Payments & Payouts",
        description:
            "Add payments and payouts to your platform with one integration — we charge your customers and pay your creators. Razorpay today, Stripe coming soon.",
        images: [OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: "Elixpo Pay — Payments & Payouts",
        description:
            "Payments and payouts for your platform, in one integration. We charge your customers and pay your creators — Razorpay today, Stripe coming soon.",
        images: [OG_IMAGE.url],
    },
    icons: {
        icon: [
            { url: "/icon.png", sizes: "256x256", type: "image/png" },
            { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
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
            name: "Elixpo Pay",
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
        {
            "@type": "SoftwareApplication",
            name: "Elixpo Pay",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web",
            url: SITE_URL,
            description:
                "Add payments and payouts to your platform with one integration. We charge your customers and pay your creators — Razorpay today, Stripe coming soon for international.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <ThemeModeScript />
            </head>
            <body
                className={`${sofiaSans.variable} ${geistMono.variable} antialiased`}
            >
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(JSON_LD),
                    }}
                />
                <ThemeModeProvider>{children}</ThemeModeProvider>
            </body>
        </html>
    );
}
