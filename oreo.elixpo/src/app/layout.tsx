import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header         from "@/components/Header";
import Footer         from "@/components/Footer";
import PageTransition from "@/components/PageTransition";
import JsonLd         from "@/components/JsonLd";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

// SEO + social-card metadata. The og-banner.png referenced here is the
// same artwork used as the README banner on the main repo — generated
// from `prompts/site_assets.md` and dropped into /public/og-banner.png.
// Keeping a single image for both surfaces means a contributor only
// has to refresh one file when the brand shifts.

const SITE_TITLE       = "OreoOS — an open-source OS in a pocket-sized badge";
const SITE_DESCRIPTION =
    "OreoOS is an open-source operating system for the Elixpo Badge, bringing MicroPython, wireless connectivity, file sharing, apps, games, hardware integrations, and developer tools into a pocket-sized programmable device built for makers, hackers, students, and communities.";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  SITE_TITLE,
    template: "%s | OreoOS",
  },
  description: SITE_DESCRIPTION,
  applicationName: "OreoOS",
  category: "technology",
  authors: [{ name: "Elixpo", url: "https://github.com/elixpo" }],
  creator: "Elixpo",
  publisher: "Elixpo",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  keywords: [
  "OreoOS",
  "Elixpo Badge",
  "Open Source",
  "Open Source OS",
  "Open Hardware",
  "Embedded Systems",
  "MicroPython",
  "ESP32-S3",
  "open hardware",
  "Developer Badge",
  "Conference Badge",
  "IoT",
  "Wireless Development",
  "BLE",
  "WiFi",
  "Infrared",
  "File Sharing",
  "File Transfer",
  "App Store",
  "Developer Tools",
  "Makers",
  "Hackers",
  "Electronics",
  "Hardware Projects",
  "IR quest"
  ],
  // Per-route titles override `default` via Next's metadata API;
  // robots gets allow-everywhere here because the site is fully public.
  robots: {
    index: true, follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description:  "Explore OreoOS, the open-source operating system powering the Elixpo Badge with MicroPython, wireless connectivity, apps, developer tools, and hardware integrations for makers and developers.",
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [{
      url:     OG_IMAGE,
      width:   1280,
      height:  720,
      alt:     "OreoOS running on the open-source ESP32-S3 Oreo Badge"
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description:  "Build, hack, and create with OreoOS—an open-source operating system for the Elixpo Badge featuring MicroPython, apps, wireless connectivity, and developer-friendly tools.",
    images: [OG_IMAGE],
  },
  // Icons — generated from public/oreo.elixpo.png (the brand mark) into a
  // full favicon set. .ico carries 16/32/48 for legacy + tab pinning; the
  // PNG sizes cover modern browsers; apple-touch + 192/512 cover iOS and
  // PWA installs. Cloudflare Pages serves each file verbatim from /public.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

// Next 14 moved themeColor / colorScheme out of `metadata` into a
// separate `viewport` export — they're per-render rather than static.
export const viewport: Viewport = {
  themeColor: "#0F0C1C",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <JsonLd data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "Elixpo",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              sameAs: [
                "https://github.com/elixpo",
                "https://github.com/elixpo/oreo",
              ],
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: SITE_NAME,
              description: SITE_DESCRIPTION,
              publisher: { "@id": `${SITE_URL}/#organization` },
              inLanguage: "en",
            },
            {
              "@type": "SoftwareSourceCode",
              "@id": `${SITE_URL}/#software`,
              name: "OreoOS",
              description: SITE_DESCRIPTION,
              codeRepository: "https://github.com/elixpo/oreo",
              license: "https://github.com/elixpo/oreo/blob/main/LICENSE",
              programmingLanguage: ["Python", "C", "TypeScript"],
              runtimePlatform: "MicroPython on ESP32-S3",
              author: { "@id": `${SITE_URL}/#organization` },
            },
          ],
        }} />
        <Header />
        <main className="flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}
