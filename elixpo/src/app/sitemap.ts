import type { MetadataRoute } from "next";
import { DIRECTORY_ENTRIES, familyPath } from "@/lib/directory";
import { PACKAGE_RECORDS } from "@/lib/packages";
import { absoluteUrl } from "@/lib/seo";
import contributors from "../../content/contributors.json";
import directory from "../../content/directory.json";
import history from "../../content/history.json";
import organization from "../../content/organization.json";
import packages from "../../content/packages.json";
import people from "../../content/people.json";
import research from "../../content/research.json";
import recognition from "../../content/recognition.json";

export const dynamic = "force-static";

type SitemapFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
type StaticRoute = { path: string; modified: string; priority: number; frequency: SitemapFrequency };

const ROUTES: readonly StaticRoute[] = [
  { path: "/", modified: organization.lastVerified, priority: 1, frequency: "weekly" },
  { path: "/projects", modified: directory.lastVerified, priority: .9, frequency: "weekly" },
  { path: "/research", modified: research.lastVerified, priority: .9, frequency: "weekly" },
  { path: "/services", modified: directory.lastVerified, priority: .9, frequency: "weekly" },
  { path: "/packages", modified: packages.lastVerified, priority: .9, frequency: "weekly" },
  { path: "/contributors", modified: contributors.lastVerified, priority: .8, frequency: "monthly" },
  { path: "/recognition", modified: recognition.lastVerified, priority: .75, frequency: "monthly" },
  { path: "/people", modified: people.lastVerified, priority: .8, frequency: "monthly" },
  { path: "/history", modified: history.lastVerified, priority: .75, frequency: "monthly" },
  ...["/chapter", "/partnerships", "/community", "/about", "/architecture", "/branding", "/contact", "/features", "/resources", "/contributing", "/code-of-conduct", "/licensing", "/terms", "/privacy"].map((path): StaticRoute => ({ path, modified: organization.lastVerified, priority: .7, frequency: "monthly" })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ROUTES.map(({ path, modified, priority, frequency }) => ({
    url: absoluteUrl(path),
    lastModified: modified,
    changeFrequency: frequency,
    priority,
    images: [absoluteUrl(path === "/research" ? "/social/research/index" : "/opengraph-image")],
  }));
  const directoryRoutes = DIRECTORY_ENTRIES.filter((entry) => entry.repository !== "elixpo_chapter" && entry.family !== "research").map((entry) => ({
    url: absoluteUrl(`${familyPath(entry.family)}/${entry.slug}`),
    changeFrequency: entry.lifecycle === "archived" ? "yearly" as const : "monthly" as const,
    priority: entry.lifecycle === "archived" ? 0.4 : 0.7,
    lastModified: entry.statusVerifiedAt,
    images: [absoluteUrl(`/social/${entry.family}/${entry.slug}`)],
  }));
  const packageRoutes = PACKAGE_RECORDS.map((record) => ({
    url: absoluteUrl(`/packages/${record.slug}`),
    changeFrequency: record.status === "maintained" ? "weekly" as const : "monthly" as const,
    priority: record.status === "maintained" ? 0.74 : 0.55,
    lastModified: packages.lastVerified,
    images: [absoluteUrl(`/social/package/${record.slug}`)],
  }));
  const contributorRoutes = contributors.featured.map((person) => ({
    url: absoluteUrl(`/contributors/${person.handle}`),
    changeFrequency: "monthly" as const,
    priority: 0.65,
    lastModified: contributors.lastVerified,
    images: [absoluteUrl(`/social/contributor/${person.handle}`)],
  }));
  const recognitionRoutes = recognition.records.map((record) => ({
    url: absoluteUrl(`/recognition/${record.id.toLowerCase()}`),
    changeFrequency: "yearly" as const,
    priority: 0.62,
    lastModified: record.issuedAt,
    images: [absoluteUrl(`/social/recognition/${record.id.toLowerCase()}`)],
  }));

  return [...staticRoutes, ...directoryRoutes, ...packageRoutes, ...contributorRoutes, ...recognitionRoutes];
}
