import "./globals.css";
import Script from "next/script";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/seo";
import { MediaDecodeReveal } from "@/components/Animations";

export const metadata = {
  title: {
    default: LANDING_TITLE,
    template: "%s | Elixpo",
  },
  description: LANDING_DESCRIPTION,
  applicationName: "Elixpo Member Portfolios",
  category: "portfolio",
  alternates: { canonical: "/" },
  creator: "Elixpo",
  publisher: "Elixpo",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Elixpo",
    url: "/",
    locale: "en_IN",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    images: [{ url: "/og-image.webp", width: 1200, height: 630, alt: "Elixpo member portfolios" }],
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    images: [{ url: "/og-image.webp", alt: "Elixpo member portfolios" }],
  },
  metadataBase: new URL("https://me.elixpo.com"),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="media-decode-enabled">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bitcount+Grid+Double:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css"
        />
        <script
          type="module"
          src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"
        />
        <script
          noModule
          src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"
        />
      </head>
      <body>
        {children}
        <MediaDecodeReveal />
        <noscript>
          <style>{`.media-decode-enabled img, .media-decode-enabled [style*="background-image"] { visibility: visible !important; }`}</style>
        </noscript>
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
