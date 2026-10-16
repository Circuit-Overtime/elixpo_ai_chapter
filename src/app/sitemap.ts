import type { MetadataRoute } from "next";
import { DIRECTORY_ENTRIES, familyPath } from "@/lib/directory";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

const ROUTES = [
  "/",
  "/projects",
  "/research",
  "/services",
  "/contributors",
  "/history",
  "/chapter",
  "/partnerships",
  "/packages",
  "/community",
  "/about",
  "/architecture",
  "/assets",
  "/features",
  "/resources",
  "/contributing",
  "/code-of-conduct",
  "/terms",
  "/privacy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ROUTES.map((path) => ({
    url: absoluteUrl(path),
    lastModified: "2026-10-16",
    changeFrequency: path === "/" ? "weekly" as const : "monthly" as const,
    priority: path === "/" ? 1 : path === "/projects" || path === "/research" || path === "/services" ? 0.9 : 0.7,
  }));
  const directoryRoutes = DIRECTORY_ENTRIES.filter((entry) => entry.repository !== "elixpo_chapter").map((entry) => ({
    url: absoluteUrl(`${familyPath(entry.family)}/${entry.slug}`),
    lastModified: "2026-10-16",
    changeFrequency: entry.lifecycle === "archived" ? "yearly" as const : "monthly" as const,
    priority: entry.lifecycle === "archived" ? 0.4 : 0.7,
  }));

  return [...staticRoutes, ...directoryRoutes];
}
