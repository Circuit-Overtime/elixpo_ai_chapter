import "./globals.css";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/seo";

export const metadata = {
  title: { default: LANDING_TITLE, template: "%s | Elixpo" },
  description: LANDING_DESCRIPTION,
  applicationName: "Elixpo Member Portfolios",
  category: "portfolio",
  alternates: { canonical: "/" },
  creator: "Elixpo",
  publisher: "Elixpo",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, noimageindex: false, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  manifest: "/site.webmanifest",
  openGraph: { type: "website", siteName: "Elixpo Member Portfolios", url: "/", locale: "en_IN", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: [{ url: "/og-image.webp", width: 1280, height: 720, alt: "Elixpo member portfolios" }] },
  twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: ["/og-image.webp"] },
  metadataBase: new URL("https://me.elixpo.com"),
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
