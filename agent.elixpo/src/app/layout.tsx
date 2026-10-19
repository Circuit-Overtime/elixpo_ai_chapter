import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, SOCIAL_IMAGE } from "@/lib/site-metadata";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d0c",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Elixpo", url: "https://github.com/elixpo" }],
  creator: "Elixpo",
  publisher: "Elixpo",
  generator: "Next.js",
  category: "Developer Tools",
  classification: "Open-source GitHub project management software",
  referrer: "origin-when-cross-origin",
  keywords: [
    "Elixpoo",
    "Elixpoo v2",
    "GitHub project management agent",
    "GitHub Project V2 automation",
    "pull request review automation",
    "issue triage automation",
    "open source GitHub automation",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Elixpo",
      url: "https://elixpo.com",
      logo: `${SITE_URL}/logo.png`,
      sameAs: ["https://github.com/elixpo"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      softwareVersion: "2.0.0",
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      codeRepository: "https://github.com/elixpo/agent.elixpo",
      programmingLanguage: ["Python", "TypeScript", "YAML"],
      runtimePlatform: "GitHub Actions",
      license: "https://opensource.org/license/mit",
      isAccessibleForFree: true,
      author: { "@id": `${SITE_URL}/#organization` },
      image: `${SITE_URL}${SOCIAL_IMAGE.url}`,
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
