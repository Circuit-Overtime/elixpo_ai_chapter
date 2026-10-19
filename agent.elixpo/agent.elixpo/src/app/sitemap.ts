import type { MetadataRoute } from "next";
import { absoluteUrl, SOCIAL_IMAGE } from "@/lib/site-metadata";


export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/docs", priority: 0.9, changeFrequency: "weekly" as const },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
    ...(path === "/" ? { images: [absoluteUrl(SOCIAL_IMAGE.url)] } : {}),
  }));
}
