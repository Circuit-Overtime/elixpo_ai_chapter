import type { Metadata } from "next";

export const SITE_URL = "https://elixpo.com";
export const SITE_NAME = "Elixpo";

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

/** Escape JSON-LD before placing it in an inline script element. */
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

interface PageMetadataOptions {
  title: string;
  description: string;
  path: `/${string}` | "/";
  socialImage?: `/${string}`;
}

export function createPageMetadata({
  title,
  description,
  path,
  socialImage,
}: PageMetadataOptions): Metadata {
  const socialTitle = `${title} | ${SITE_NAME}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      url: path,
      title: socialTitle,
      description,
      ...(socialImage ? { images: [{ url: socialImage, width: 1200, height: 630, alt: `${title} — Elixpo` }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      ...(socialImage ? { images: [socialImage] } : {}),
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
}
