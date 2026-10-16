import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import { ProjectMark } from "@/components/ProjectMark";
import { getDirectoryEntries } from "@/lib/directory";
import { LIVE_RESEARCH_DEMOS, RESEARCH_LAST_VERIFIED, RESEARCH_RECORDS } from "@/lib/research";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";
import people from "../../../content/people.json";

const pageMetadata = createPageMetadata({
  title: "Open research, experiments, and reproducibility",
  description: "Explore Elixpo research with papers, source code, lifecycle status, models, and reproducibility records, led by OctaBit, OreoLook, and MonoDiffuse.",
  path: "/research",
  socialImage: "/social/research/index",
});
export const metadata = {
  ...pageMetadata,
  alternates: {
    ...pageMetadata.alternates,
    types: { "application/atom+xml": "/research/feed.xml" },
  },
};

const leadingResearchSlugs = ["octabit", "oreolook", "monodiffuse"];
const research = [...getDirectoryEntries("research")].sort((left, right) => {
  const leftRank = leadingResearchSlugs.indexOf(left.slug);
  const rightRank = leadingResearchSlugs.indexOf(right.slug);
  return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
});
const leadingResearch = leadingResearchSlugs.map((slug) => research.find((entry) => entry.slug === slug)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
const researchByAuthor = new Map<string, { slug: string; title: string }[]>();
for (const record of RESEARCH_RECORDS) for (const author of record.authors) researchByAuthor.set(author.name, [...(researchByAuthor.get(author.name) ?? []), { slug: record.slug, title: record.title }]);
const teamResearchers = people.currentTeam.flatMap((person) => {
  const records = researchByAuthor.get(person.name);
  return records?.length ? [{ ...person, records }] : [];
});
const researchContributors = people.researchContributors.map((person) => ({
  ...person,
  records: person.relatedResearch.flatMap((slug) => {
    const record = RESEARCH_RECORDS.find((entry) => entry.slug === slug);
    return record ? [{ slug: record.slug, title: record.title }] : [];
  }),
}));
const researchPeople = [...teamResearchers, ...researchContributors];
export default function ResearchPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Elixpo Open Research",
        description: metadata.description,
        url: "https://elixpo.com/research",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: research.map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: entry.name, url: `https://research.elixpo.com/${entry.slug}` })),
        },
      },
      ...RESEARCH_RECORDS.map((record) => ({
        "@type": record.researchStatus === "technical-report" ? "TechArticle" : record.paperUrl ? "ScholarlyArticle" : "ResearchProject",
        name: record.title,
        description: record.abstract,
        url: `https://research.elixpo.com/${record.slug}`,
        codeRepository: record.codeUrl,
        ...(record.paperUrl ? { sameAs: record.paperUrl } : {}),
        ...(record.releasedAt ? { datePublished: record.releasedAt } : {}),
        ...(record.authors.length ? { author: record.authors.map((author) => ({ "@type": "Person", name: author.name, ...(author.affiliation ? { affiliation: { "@type": "Organization", name: author.affiliation } } : {}) })) } : {}),
      })),
    ],
  };

  return <main className="research-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

    <header className="research-hero">
      <div className="research-hero-copy">
        <p className="eyebrow">Elixpo Research</p>
        <h1>We publish research with its code, evidence, and <em>current status.</em></h1>
        <p>Elixpo’s research directory connects experiments to their implementations, papers, datasets, models, demonstrations, and reproducibility records. Completed, paused, and archived work remains visible with an accurate lifecycle.</p>
      </div>
      <div className="research-hero-objects" aria-hidden="true">
        <span className="research-orbit research-orbit-one" />
        <span className="research-orbit research-orbit-two" />
        <div className="research-object research-object-code"><i /><i /><i /><b>001101</b></div>
        <div className="research-object research-object-model"><span>ONNX</span><b>W1A32</b></div>
        <div className="research-object research-object-paper"><span>ARXIV</span><b>2609.05463</b></div>
      </div>
      <div className="research-hero-note"><strong>{research.length}</strong><span>documented research records</span></div>
    </header>

    <section className="leading-research section-wrap" aria-labelledby="leading-research">
      <div className="section-heading split">
        <div><p className="eyebrow">Leading research</p><h2 id="leading-research">Current work with the strongest public record.</h2></div>
        <p>These records currently lead the Elixpo research program. They combine a defined research question with public implementation evidence, publication material, or runnable artifacts.</p>
      </div>
      <div className="leading-research-grid">
        {leadingResearch.map((entry, index) => <Link href={`/research/${entry.slug}`} key={entry.slug}>
          <div className={`leading-research-art leading-research-art-${index + 1}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i/><i/><ProjectMark seed={entry.slug} icon={entry.icon} size="large" /></div>
          <div className="leading-research-copy"><p className="eyebrow">{entry.focus.slice(0, 2).join(" · ")}</p><h3>{entry.name}</h3><p>{entry.summary}</p><span>Open research record <ArrowRight size={15}/></span></div>
        </Link>)}
      </div>
    </section>

    <section className="research-people section-wrap" aria-labelledby="research-people">
      <div className="section-heading split"><div><p className="eyebrow">Research people</p><h2 id="research-people">The people connecting research to implementation.</h2></div><p>Each person appears through a verified Elixpo research role, authorship record, or attributable repository work. This is a public record of contribution, not a ranking of researchers.</p></div>
      <div className="research-people-grid">{researchPeople.map((person, index) => <article key={person.handle}><div className={`research-person-mark research-person-mark-${index + 1}`} aria-hidden="true"><Image src={`https://github.com/${person.handle}.png`} alt="" width={128} height={128} unoptimized /><i/><i/></div><div className="research-person-copy"><p className="eyebrow">{person.role}</p><h3>{person.name}</h3><p>{person.summary}</p><div className="research-person-work"><span>Related research</span>{person.records.map((record) => <Link href={`/research/${record.slug}`} key={record.slug}>{record.title} <ArrowRight size={13}/></Link>)}</div><div className="research-person-links">{person.portfolio && <a href={person.portfolio}>Portfolio <ArrowUpRight size={13}/></a>}<a href={person.github}>GitHub <ArrowUpRight size={13}/></a></div></div></article>)}</div>
    </section>

    <section className="research-spaces section-wrap" aria-labelledby="live-experiments">
      <div className="section-heading split">
        <div><p className="eyebrow">Live experiments</p><h2 id="live-experiments">Run the public demonstrations.</h2></div>
        <p>These Hugging Face Spaces provide interactive access to current Elixpo research. Each demonstration links back to its project record and underlying artifacts.</p>
      </div>
      <div className="space-grid">
        {LIVE_RESEARCH_DEMOS.map((space, index) => <article className={`space-card ${index % 2 === 1 ? "space-card-violet" : "space-card-blue"}`} key={space.url}>
          <div className="space-card-art" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i /><i /><i /></div>
          <div className="space-card-copy">
            <p className="eyebrow">Interactive research artifact</p>
            <div className="space-title-row"><h3>{space.name}</h3><span className="hf-badge">HF Space</span></div>
            <p>{space.description}</p>
            <ul>{space.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
            <div className="space-actions">
              <a href={space.url} target="_blank" rel="noreferrer">Launch on Hugging Face <ArrowUpRight size={16} /></a>
              <Link href={`/research/${space.relatedSlug}`}>View research record <ArrowRight size={15} /></Link>
            </div>
          </div>
        </article>)}
      </div>
      <p className="registry-date">Research metadata last verified {RESEARCH_LAST_VERIFIED}.</p>
    </section>

    <section className="research-directory section-wrap" aria-labelledby="research-index">
      <div className="section-heading split">
        <div><p className="eyebrow">Research index</p><h2 id="research-index">All research records and their current lifecycle.</h2><a className="text-link" href="/research/feed.xml">Subscribe to the research feed <ArrowUpRight size={14}/></a></div>
        <p>The directory includes active investigations, completed studies, paused work, and historical experiments. Lifecycle labels describe the present state rather than the importance of the work.</p>
      </div>
      <div className="research-list">
        {research.map((entry, index) => <article key={entry.slug}>
          <div className="research-list-index">{String(index + 1).padStart(2, "0")}</div>
          <ProjectMark seed={entry.slug} icon={entry.icon} size="large" />
          <div className="research-list-copy">
            <div><p className="eyebrow">{entry.focus.slice(0, 2).join(" · ")}</p><span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span></div>
            <h3>{entry.name}</h3>
            <p>{entry.description}</p>
          </div>
          <div className="research-list-links">
            <Link href={`/research/${entry.slug}`}>Research record <ArrowRight size={15} /></Link>
            <a href={entry.repositoryUrl} target="_blank" rel="noreferrer"><Github size={14} /> Source repository</a>
            {entry.evidence?.slice(0, 2).map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label} <ArrowUpRight size={13} /></a>)}
          </div>
        </article>)}
      </div>
    </section>

    <section className="research-method section-wrap">
      <div><p className="eyebrow">Publication standard</p><h2>Research remains connected to the material needed to evaluate it.</h2></div>
      <div className="research-method-grid">
        <article><span>01</span><h3>Source</h3><p>The implementation and important revisions remain available through the linked repository.</p></article>
        <article><span>02</span><h3>Evidence</h3><p>Papers, datasets, model files, and evaluation records are linked when they have been released.</p></article>
        <article><span>03</span><h3>Reproduction</h3><p>Runnable demonstrations and documented environments make results easier to inspect independently.</p></article>
        <article><span>04</span><h3>Status</h3><p>Every record states whether work is active, paused, completed, or archived.</p></article>
      </div>
    </section>
  </main>;
}
