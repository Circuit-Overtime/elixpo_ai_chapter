import { getPortfolioPersons } from "@/lib/content";
import {
  getAbsoluteUrl,
  getMemberImagePath,
  isMemberSectionIndexable,
  MEMBER_SECTION_SLUGS,
  SITE_URL,
} from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap() {
  const memberPages = getPortfolioPersons().flatMap((person) => {
    const sections = MEMBER_SECTION_SLUGS.filter((section) =>
      isMemberSectionIndexable(person, section),
    );

    return [
      {
        url: getAbsoluteUrl(`/${person}`),
        changeFrequency: "monthly",
        priority: 0.9,
        images: [getAbsoluteUrl(getMemberImagePath(person))],
      },
      ...sections.map((section) => ({
        url: getAbsoluteUrl(`/${person}/${section}`),
        changeFrequency: "monthly",
        priority: 0.7,
      })),
    ];
  });

  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
      images: [getAbsoluteUrl("/og-image.webp")],
    },
    ...memberPages,
  ];
}
