import { StoryHome } from "@/components/StoryHome";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";
import organization from "../../content/organization.json";

export const metadata = createPageMetadata({
  title: "Open-source projects, research, and public services",
  description: organization.oneLineDescription,
  path: "/",
});

const jsonLd = { "@context": "https://schema.org", "@graph": [
  { "@type": "Organization", "@id": "https://elixpo.com/#organization", name: "Elixpo", url: "https://elixpo.com", logo: "https://elixpo.com/logos/logo.webp", description: organization.fullDescription, sameAs: ["https://github.com/elixpo", "https://github.com/elixpo/elixpo_chapter", "https://huggingface.co/Elixpo"] },
  { "@type": "WebSite", "@id": "https://elixpo.com/#website", name: "Elixpo", url: "https://elixpo.com", description: organization.oneLineDescription, publisher: { "@id": "https://elixpo.com/#organization" }, inLanguage: "en" },
] };

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <StoryHome />
    </>
  );
}
