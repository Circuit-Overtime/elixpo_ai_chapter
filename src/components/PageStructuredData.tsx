import { serializeJsonLd } from "@/lib/seo";

export function PageStructuredData({
  name,
  description,
  path,
  type = "WebPage",
}: {
  name: string;
  description: string;
  path: `/${string}`;
  type?: "WebPage" | "CollectionPage" | "AboutPage";
}) {
  const url = `https://elixpo.com${path}`;
  const data = {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${url}#page`,
    name,
    description,
    url,
    isPartOf: { "@type": "WebSite", "@id": "https://elixpo.com/#website", name: "Elixpo", url: "https://elixpo.com" },
    publisher: { "@type": "Organization", "@id": "https://elixpo.com/#organization", name: "Elixpo", url: "https://elixpo.com", logo: "https://elixpo.com/logos/logo.webp" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Elixpo", item: "https://elixpo.com" },
        { "@type": "ListItem", position: 2, name, item: url },
      ],
    },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
