import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import people from "../../../content/people.json";
import contributors from "../../../content/contributors.json";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "People, maintainers, and contributors",
  description: "Meet Elixpo's current team and explore evidence-backed contributor records with clear boundaries for roles, dates, corrections, and consent.",
  path: "/people",
});

const rolePeriod = (person: (typeof people.currentTeam)[number]) =>
  person.rolePeriod.precision === "not-publicly-established"
    ? "Current role · start date not publicly established"
    : `${person.rolePeriod.start ?? "Start not recorded"}–present`;

export default function PeoplePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "People of Elixpo",
    description: metadata.description,
    mainEntity: people.currentTeam.map((person) => ({
      "@type": "Person",
      name: person.name,
      url: person.portfolio ?? person.github,
      sameAs: [person.github, ...(person.portfolio ? [person.portfolio] : [])],
      affiliation: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" },
    })),
  };

  return <main className="people-page evidence-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="people-hero">
      <div className="people-hero-geometry" aria-hidden="true"><span/><span/><span/><span/><span/></div>
      <div className="people-hero-copy"><p className="eyebrow">People / responsibility and public evidence</p><h1>Roles describe <em>accountability.</em></h1><p className="lede">Elixpo separates current organization responsibility from project maintenance and contributor recognition. A public GitHub identity is not treated as employment, permanent membership, or consent for a private biography.</p><Link className="text-link" href="/contributors">Explore contributor records <ArrowRight size={15}/></Link></div>
      <dl className="people-hero-facts"><div><dt>Current team</dt><dd>{people.currentTeam.length}</dd></div><div><dt>Featured contributors</dt><dd>{contributors.featured.length}</dd></div><div><dt>Published alumni</dt><dd>{people.alumni.length}</dd></div><div><dt>Published advisors</dt><dd>{people.advisors.length}</dd></div></dl>
    </header>

    <section className="lead-developers people-current-team section-wrap">
      <div className="lead-developers-heading"><p className="eyebrow">Current organization team</p><h3>People with continuing responsibility in the public record.</h3><p>Role start dates are not inferred from first commits. Until a dated appointment record is available, each period is shown honestly as not publicly established.</p></div>
      <div className="lead-developer-grid">
        {people.currentTeam.map((person, index) => <article key={person.handle} className={`lead-developer lead-developer-${index + 1}`}>
          <div className="lead-developer-art" aria-hidden="true"><span>{String(index + 1).padStart(2,"0")}</span><i/><i/><Image src={`https://github.com/${person.handle}.png`} alt="" width={128} height={128} unoptimized /></div>
          <div className="lead-developer-copy"><p className="eyebrow">{person.role}</p><h4>{person.name}</h4><p>{person.summary}</p><small>{rolePeriod(person)}</small><div className="people-role-links"><a href={person.github} target="_blank" rel="noreferrer">@{person.handle} <ArrowUpRight size={14}/></a>{person.portfolio && <a href={person.portfolio} target="_blank" rel="noreferrer">Portfolio <ArrowUpRight size={14}/></a>}<a href={person.evidence[0]} target="_blank" rel="noreferrer">Role evidence <ArrowUpRight size={14}/></a></div></div>
        </article>)}
      </div>
    </section>

    <section className="record-body people-boundaries section-wrap">
      <article><p className="eyebrow">Contributor recognition</p><h2>Public outcomes remain separate from organization roles.</h2><p>{people.roleDefinitions.majorContributors}</p><p>The current contributor edition covers {contributors.featured.length} people from a dated pool of {contributors.selectionPolicy.eligibleContributorCount} eligible Chapter contributors. Leads and automation are excluded before its coverage floor is calculated.</p></article>
      <aside><Link href="/contributors">Browse contributor records <ArrowRight size={14}/></Link><a href={contributors.selectionPolicy.sourceRepository} target="_blank" rel="noreferrer">Inspect the Chapter source <ArrowUpRight size={14}/></a><a href={people.correctionUrl} target="_blank" rel="noreferrer">Request a correction <ArrowUpRight size={14}/></a></aside>
    </section>

    <section className="method-panel people-method"><p className="eyebrow">Role boundaries</p><h2>Empty categories are more accurate than invented titles.</h2><p>{people.methodology}</p><p><strong>Publication and consent:</strong> {people.consentPolicy.currentPublicationResolution}</p><p><strong>Project maintainers:</strong> {people.roleDefinitions.projectMaintainers} No separate project-maintainer roster is published in this edition because repository-by-repository authority still needs verification.</p><p><strong>Alumni:</strong> {people.roleDefinitions.alumni} No alumni record is currently published.</p><p><strong>Advisors:</strong> {people.roleDefinitions.advisors} No advisor record is currently published.</p></section>
  </main>;
}
