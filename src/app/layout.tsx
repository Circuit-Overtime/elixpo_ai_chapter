import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { SITE_URL } from "@/lib/seo";

const description = "Install signed Linux applications from Elixpo and browse maintained developer packages with source, release, license, and support records.";

export const viewport: Viewport = { themeColor: "#f7f6f0", colorScheme: "light" };
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Elixpo Packages", template: "%s | Elixpo Packages" },
  description,
  applicationName: "Elixpo Packages",
  creator: "Elixpo",
  publisher: "Elixpo",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  category: "software",
  keywords: ["Elixpo Packages", "signed APT repository", "Linux applications", "Debian packages", "npm packages", "open source"],
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/favicon.png", type: "image/png" }], shortcut: ["/favicon.ico"] },
  alternates: { canonical: "/", types: { "application/atom+xml": "/feed.xml" } },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { type: "website", locale: "en_US", siteName: "Elixpo Packages", title: "Elixpo Packages", description, url: SITE_URL, images: [{ url: "/social/index", width: 1200, height: 630, alt: "Elixpo Packages — source, verification, and signed releases" }] },
  twitter: { card: "summary_large_image", title: "Elixpo Packages", description, images: ["/social/index"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="site-header"><Link className="brand" href="/"><Image src="https://elixpo.com/logos/logo.png" width={38} height={38} alt="" priority /><span><b>Elixpo</b><small>Packages</small></span></Link><nav aria-label="Primary navigation"><Link href="/#linux">Linux apps</Link><Link href="/#developer">Developer packages</Link><Link href="/repository">APT repository</Link><a href="https://github.com/elixpo/packages.elixpo">Source ↗</a><a className="portal-link" href="https://elixpo.com/packages">Elixpo.com ↗</a></nav></header>
    {children}
    <footer><div className="footer-brand"><Image src="https://elixpo.com/logos/logo.png" width={44} height={44} alt="" /><div><strong>Elixpo Packages</strong><p>Open-source software distributed with public release and trust records.</p></div></div><nav><a href="https://github.com/elixpo/packages.elixpo">GitHub</a><a href="https://elixpo.com/packages">Organization directory</a><a href="/feed.xml">Atom feed</a><a href="https://github.com/elixpo/packages.elixpo/issues">Support</a></nav></footer>
  </body></html>;
}
