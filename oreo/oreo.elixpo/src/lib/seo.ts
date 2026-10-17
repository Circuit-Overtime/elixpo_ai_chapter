import type { Metadata } from "next";

export const SITE_URL = "https://oreo.elixpo.com";
export const SITE_NAME = "OreoOS";
export const OG_IMAGE = "/og-banner.png";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
};

/** Consistent canonical, social, and crawler metadata for static routes. */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  type = "website",
}: PageMetadataOptions): Metadata {
  const canonical = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}/`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type,
      url: canonical,
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      images: [{
        url: OG_IMAGE,
        width: 1280,
        height: 720,
        alt: "OreoOS running on the open-source ESP32-S3 Oreo Badge",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
