import type { MetadataRoute } from "next";
import { LINUX_PACKAGES, PACKAGE_RECORDS } from "@/lib/packages";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/repository/"), changeFrequency: "monthly", priority: .85 },
    ...PACKAGE_RECORDS.map((record) => ({ url: absoluteUrl(`/${record.slug}/`), changeFrequency: "monthly" as const, priority: record.kind === "linux" ? .9 : .75 })),
    ...LINUX_PACKAGES.flatMap((record) => ["docs", "about"].map((section) => ({ url: absoluteUrl(`/${record.slug}/${section}/`), changeFrequency: "monthly" as const, priority: .7 }))),
  ];
}
