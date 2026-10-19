import type { MetadataRoute } from "next";
import { LAST_VERIFIED, LINUX_PACKAGES, PACKAGE_RECORDS } from "@/lib/packages";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), lastModified: LAST_VERIFIED, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/repository/"), lastModified: LAST_VERIFIED, changeFrequency: "monthly", priority: .85 },
    ...PACKAGE_RECORDS.map((record) => ({ url: absoluteUrl(`/${record.slug}/`), lastModified: LAST_VERIFIED, changeFrequency: "monthly" as const, priority: record.kind === "npm" ? .75 : .9 })),
    ...LINUX_PACKAGES.flatMap((record) => ["docs", "about"].map((section) => ({ url: absoluteUrl(`/${record.slug}/${section}/`), lastModified: LAST_VERIFIED, changeFrequency: "monthly" as const, priority: .7 }))),
  ];
}
