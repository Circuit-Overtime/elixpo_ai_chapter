import { getPortfolioPersons, getPersonContent } from "@/lib/content";
import { buildLandingJsonLd } from "@/lib/seo";
import LandingClient from "@/components/LandingClient";

export default function LandingPage() {
  const profiles = getPortfolioPersons().map((slug) => ({
    slug,
    ...getPersonContent(slug, "profile"),
  }));
  const landingJsonLd = buildLandingJsonLd(profiles);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(landingJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <LandingClient profiles={profiles} />
    </>
  );
}
