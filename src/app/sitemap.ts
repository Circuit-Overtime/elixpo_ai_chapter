import type { MetadataRoute } from "next";
import { DIRECTORY_ENTRIES, familyPath } from "@/lib/directory";
import { PACKAGE_RECORDS } from "@/lib/packages";
import { absoluteUrl } from "@/lib/seo";
import contributors from "../../content/contributors.json";

export const dynamic = "force-static";

const ROUTES = [
  "/",
  "/projects",
  "/research",
  "/services",
  "/contributors",
  "/people",
  "/history",
  "/chapter",
  "/partnerships",
  "/packages",
  "/community",
  "/about",
  "/architecture",
  "/branding",
  "/contact",
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
    changeFrequency: path === "/" ? "weekly" as const : "monthly" as const,
    priority: path === "/" ? 1 : path === "/projects" || path === "/research" || path === "/services" ? 0.9 : 0.7,
  }));
  const directoryRoutes = DIRECTORY_ENTRIES.filter((entry) => entry.repository !== "elixpo_chapter" && entry.family !== "research").map((entry) => ({
    url: absoluteUrl(`${familyPath(entry.family)}/${entry.slug}`),
    changeFrequency: entry.lifecycle === "archived" ? "yearly" as const : "monthly" as const,
    priority: entry.lifecycle === "archived" ? 0.4 : 0.7,
  }));
  const packageRoutes = PACKAGE_RECORDS.map((record) => ({
    url: absoluteUrl(`/packages/${record.slug}`),
    changeFrequency: record.status === "maintained" ? "weekly" as const : "monthly" as const,
    priority: record.status === "maintained" ? 0.74 : 0.55,
  }));
  const contributorRoutes = contributors.featured.map((person) => ({
    url: absoluteUrl(`/contributors/${person.handle}`),
    changeFrequency: "monthly" as const,
    priority: 0.65,
  }));

  return [...staticRoutes, ...directoryRoutes, ...packageRoutes, ...contributorRoutes];
}
