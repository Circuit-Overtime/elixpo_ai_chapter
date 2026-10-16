import type { Metadata } from "next";

export const SITE_URL = "https://packages.elixpo.com";
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString();
export const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function pageMetadata(title: string, description: string, path: string, socialSlug = "index"): Metadata {
  const socialImage = `/social/${socialSlug}`;
  const canonicalPath = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}/`;
  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      types: { "application/atom+xml": "/feed.xml" },
    },
    openGraph: { type: "website", siteName: "Elixpo Packages", title, description, url: canonicalPath, images: [{ url: socialImage, width: 1200, height: 630, alt: `${title} — Elixpo Packages` }] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}
