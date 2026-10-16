import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { MegaNavbar } from "@/components/MegaNavbar";
import { Footer } from "@/components/Footer";
import { SITE_URL } from "@/lib/seo";

// Global dark shell - overrides the semantic theme tokens to dark so every
// route matches, and applies the design font.
const darkShell = {
  "--background": "#000000",
  "--foreground": "#E1E0CC",
  "--card": "#161616",
  "--card-hover": "#1d1d1d",
  "--muted": "#9a988c",
  "--border": "rgba(255,255,255,0.12)",
  "--accent": "#DEDBC8",
  "--accent-light": "#E1E0CC",
  fontFamily: "var(--font-ui-sans)",
} as CSSProperties;

export const viewport: Viewport = {
  themeColor: "#000000",
};

const SITE_DESCRIPTION =
  "Explore Elixpo's open-source tools for publishing, visual collaboration, AI-assisted search, portfolios, identity, short links, QR codes, and software packages.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Elixpo",
  title: {
    default: "Elixpo — Open-Source Tools for Creators and Developers",
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
    title: "Elixpo — Open-Source Tools for Creators and Developers",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.webp",
        width: 1852,
        height: 813,
        type: "image/webp",
        alt: "Elixpo — Developer-first open-source ecosystem"
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.webp"],
    creator: "@elixpo",
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
        <SmoothScroll />
        <div
          className="bg-background text-foreground min-h-screen flex flex-col overflow-x-hidden antialiased selection:bg-primary selection:text-black"
          style={darkShell}
        >
          <MegaNavbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
