import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import contributors from "../../../content/contributors.json";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

const featuredContributors = [...contributors.featured].sort((a, b) => b.observedContributions - a.observedContributions);
const coverage = Math.round(featuredContributors.length / contributors.selectionPolicy.eligibleContributorCount * 1000) / 10;

export const metadata = createPageMetadata({
  title: "Contributors and public credit",
  description: `Meet ${featuredContributors.length} non-lead contributors representing more than ${contributors.selectionPolicy.minimumCoveragePercent}% of the eligible Elixpo Chapter contributor community, with evidence-backed activity and outcomes.`,
  path: "/contributors",
});

export default function ContributorsPage() {
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Elixpo contributors", description: metadata.description, mainEntity: featuredContributors.map((person) => ({ "@type": "Person", name: person.name, identifier: person.recordId, url: `https://elixpo.com/contributors/${person.handle}`, sameAs: [person.github, ...(person.portfolio ? [person.portfolio] : [])] })) };

  return <main className="page-shell evidence-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="contributor-hero">
      <div><p className="eyebrow">People / evidence-led recognition</p><h1>Credit the work.<br />Explain the <em>impact.</em></h1><p className="lede">This edition features the highest-contributing eligible people in the Elixpo Chapter record. Leads and automation are excluded before the coverage threshold is calculated.</p></div>
      <dl><div><dt>Featured people</dt><dd>{featuredContributors.length}</dd></div><div><dt>Eligible contributors</dt><dd>{contributors.selectionPolicy.eligibleContributorCount}</dd></div><div><dt>Coverage</dt><dd>{coverage}%</dd></div><div><dt>Required floor</dt><dd>{contributors.selectionPolicy.minimumCoveragePercent}%</dd></div></dl>
    </header>
    <section className="contributor-intro section-heading split"><div><p className="eyebrow">Current edition</p><h2>At least one fifth of the eligible Chapter community.</h2></div><p>Placement follows the dated GitHub contribution snapshot. Each profile also explains a concrete body of work so that recognition remains useful beyond a leaderboard.</p></section>
    <section className="contributor-ledger">{featuredContributors.map((person, index) => <article key={person.handle}><div className="contributor-rank">{String(index + 1).padStart(2,"0")}</div><Image src={`https://github.com/${person.handle}.png`} alt={`${person.name} profile`} width={136} height={136} unoptimized /><div className="contributor-story"><p className="eyebrow">Observed window · {person.activeWindow}</p><h2><Link href={`/contributors/${person.handle}`}>{person.name}</Link></h2><p>{person.story}</p><small>{person.observedContributions} contributions observed · Record {person.recordId}</small></div><div className="contributor-links"><Link href={`/contributors/${person.handle}`}>Public contribution record <ArrowUpRight size={14}/></Link>{person.portfolio && <a href={person.portfolio} target="_blank" rel="noreferrer">Portfolio on me.elixpo.com <ArrowUpRight size={14}/></a>}<a href={person.github} target="_blank" rel="noreferrer">GitHub profile <ArrowUpRight size={14}/></a>{person.evidence.map((url, evidenceIndex) => <a key={url} href={url} target="_blank" rel="noreferrer">Evidence {evidenceIndex + 1} <ArrowUpRight size={14}/></a>)}</div></article>)}</section>
    <section className="method-panel"><p className="eyebrow">Method and limits</p><h2>Contribution is larger than a commit count.</h2><p>{contributors.methodology}</p><p>{contributors.selectionPolicy.basis}</p><p>The audit is a dated snapshot, not a permanent ranking. Reviews, issue triage, design, support, event work, and research labor may not appear in GitHub totals; future editions should add those only when evidence is available.</p><div className="inline-links"><a className="text-link" href={contributors.selectionPolicy.correctionUrl} target="_blank" rel="noreferrer">Request a correction <ArrowUpRight size={14}/></a><a className="text-link" href={contributors.selectionPolicy.optOutUrl} target="_blank" rel="noreferrer">Request removal <ArrowUpRight size={14}/></a><a className="text-link" href={contributors.selectionPolicy.sourceRepository} target="_blank" rel="noreferrer">Inspect the Chapter record <ArrowUpRight size={14}/></a></div></section>
  </main>;
}
