import type { Metadata, Viewport } from "next";
import "./globals.css";
import "lenis/dist/lenis.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { MegaNavbar } from "@/components/MegaNavbar";
import { Footer } from "@/components/Footer";
import { MotionPreferences } from "@/components/MotionPreferences";
import { PortalAnalytics } from "@/components/PortalAnalytics";
import { SITE_URL } from "@/lib/seo";

export const viewport: Viewport = {
  themeColor: "#f6f5f0",
  colorScheme: "light",
};

const SITE_DESCRIPTION =
  "Elixpo is an open-source project foundry where people build software, operate open services, share reproducible research, and release meaningful work together.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Elixpo",
  title: {
    default: "Elixpo — An Open-Source Project Foundry",
    template: "%s | Elixpo",
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: "Ayushman Bhattacharya", url: "https://github.com/Circuit-Overtime" }],
  creator: "Elixpo",
  publisher: "Elixpo",
  category: "technology",
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logos/logo.webp", type: "image/webp" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon.png" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Elixpo",
    title: "Elixpo — An Open-Source Project Foundry",
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Elixpo — open-source project foundry" }],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@elixpo",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <MotionPreferences>
          <SmoothScroll />
          <PortalAnalytics />
          <div className="site-frame selection:bg-[#bde8ce] selection:text-[#142018]">
            <MegaNavbar />
            <div className="site-content">{children}</div>
            <Footer />
          </div>
        </MotionPreferences>
      </body>
    </html>
  );
}
