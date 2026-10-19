import type { Metadata } from "next";

export const SITE_URL = "https://agent.elixpo.com";
export const SITE_NAME = "Elixpoo";
export const SITE_TITLE = "Elixpoo v2 — GitHub Project Management Agent";
export const SITE_DESCRIPTION =
  "Elixpoo v2 is Elixpo's open-source GitHub project-management agent for bounded triage, exact mentions, pull-request review, Project V2 synchronization, Discussions, and merge memory.";

export const SOCIAL_IMAGE = {
  url: "/default.png",
  width: 1280,
  height: 720,
  type: "image/png",
  alt: "Elixpoo v2 — bounded GitHub project management across Elixpo repositories",
};

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const canonical = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}
