import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import contributors from "../../../../content/contributors.json";
import { PrintRecordButton } from "@/components/PrintRecordButton";
import { DIRECTORY_ENTRIES, familyPath } from "@/lib/directory";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

type PageProps = { params: Promise<{ handle: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return contributors.featured.map((person) => ({ handle: person.handle }));
}

function getContributor(handle: string) {
  return contributors.featured.find((person) => person.handle === handle);
}

function getProjectRecord(projectId: string) {
  return DIRECTORY_ENTRIES.find((entry) => entry.repository === projectId);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const person = getContributor(handle);
  if (!person) return {};
  return createPageMetadata({
    title: `${person.name} — public contribution record`,
    description: `${person.name}'s evidence-backed Elixpo contribution record for ${person.activeWindow}, with projects, outcomes, skills, attribution boundaries, and primary source links.`,
    path: `/contributors/${person.handle}`,
    socialImage: `/social/contributor/${person.handle}`,
  });
}

export default async function ContributorRecordPage({ params }: PageProps) {
  const { handle } = await params;
  const person = getContributor(handle);
  if (!person) notFound();

  const canonicalUrl = `https://elixpo.com/contributors/${person.handle}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${person.name} — Elixpo contribution record`,
    url: canonicalUrl,
    mainEntity: {
      "@type": "Person",
      name: person.name,
      identifier: [person.handle, person.recordId],
      url: canonicalUrl,
      sameAs: [person.github, ...(person.portfolio ? [person.portfolio] : [])],
      knowsAbout: [...new Set(person.workRecords.flatMap((record) => record.demonstratedSkills))],
      subjectOf: person.evidence.map((url) => ({ "@type": "WebPage", url })),
    },
  };

  return <main className="page-shell contributor-record">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <div className="record-actions"><Link className="record-back" href="/contributors"><ArrowLeft size={14} /> All contributor records</Link><PrintRecordButton /></div>
    <header className="record-hero">
      <div className="record-portrait"><span>PUBLIC RECORD</span><i /><i /><Image src={`https://github.com/${person.handle}.png`} alt={`${person.name} profile`} width={360} height={360} unoptimized /></div>
      <div><p className="eyebrow">Contributor / @{person.handle}</p><h1>{person.name}</h1><p className="lede">{person.story}</p><dl><div><dt>Record ID</dt><dd>{person.recordId}</dd></div><div><dt>Observed window</dt><dd>{person.activeWindow}</dd></div><div><dt>Primary evidence records</dt><dd>{person.evidence.length}</dd></div><div><dt>Record reviewed</dt><dd>{contributors.lastVerified}</dd></div></dl></div>
    </header>

    <section className="record-verification" aria-label="Record verification"><div><p className="eyebrow">Verify this record</p><strong>{person.recordId}</strong></div><div><span>Canonical URL</span><a href={canonicalUrl}>{canonicalUrl}</a></div><p>{contributors.recordPolicy.verificationRule}</p></section>

    <section className="record-body">
      <article><p className="eyebrow">Public outcome</p><h2>What this record supports.</h2><p>{person.story}</p><p>The activity total comes from the dated Elixpo Chapter contributor snapshot. It provides selection context; the linked commits are the evidence for the described work.</p></article>
      <aside><p className="eyebrow">Profiles</p><a href={person.github} target="_blank" rel="noreferrer">GitHub profile <ArrowUpRight size={14} /></a>{person.portfolio && <a href={person.portfolio} target="_blank" rel="noreferrer">Portfolio on me.elixpo.com <ArrowUpRight size={14} /></a>}<a href={canonicalUrl}>Stable public record <ArrowUpRight size={14} /></a></aside>
    </section>

    <section className="contribution-work" aria-labelledby="structured-work-title">
      <div className="section-heading split"><div><p className="eyebrow">Structured work record</p><h2 id="structured-work-title">Projects, role, outcome, and demonstrated skills.</h2></div><p>Each field is limited to what the linked public evidence supports. Missing reviewer attribution is shown explicitly rather than inferred.</p></div>
      <div className="contribution-work-grid">{person.workRecords.map((record) => <article key={record.label}>
        <div className="work-record-heading"><p className="eyebrow">{record.dateRange}</p><h3>{record.label}</h3><span>{record.role}</span></div>
        <p>{record.outcome}</p>
        <dl>
          <div><dt>Projects</dt><dd>{record.projectIds.map((projectId) => {
            const project = getProjectRecord(projectId);
            if (!project || project.repository === "elixpo_chapter") return <span key={projectId}>{project?.name ?? projectId}</span>;
            return <Link key={projectId} href={`${familyPath(project.family)}/${project.slug}`}>{project.name}</Link>;
          })}</dd></div>
          <div><dt>Demonstrated skills</dt><dd>{record.demonstratedSkills.map((skill) => <span key={skill}>{skill}</span>)}</dd></div>
          <div><dt>Review attribution</dt><dd className="review-attribution"><b>{record.reviewAttribution.reviewer ?? "No individual reviewer recorded"}</b><small>{record.reviewAttribution.statement}</small></dd></div>
        </dl>
        <div className="work-evidence-links">{record.evidenceIndexes.map((evidenceIndex) => <a key={person.evidence[evidenceIndex]} href={person.evidence[evidenceIndex]} target="_blank" rel="noreferrer">Evidence {evidenceIndex + 1} <ArrowUpRight size={14} /></a>)}</div>
      </article>)}</div>
    </section>

    <section className="record-evidence"><div className="section-heading split"><div><p className="eyebrow">Primary evidence</p><h2>Inspect the work directly.</h2></div><p>Evidence links point to the public source record. They are preserved independently from this summary so the claim can be checked.</p></div><div>{person.evidence.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><span>{String(index + 1).padStart(2,"0")}</span><b>Chapter contribution evidence</b><small>{url}</small><ArrowUpRight size={16} /></a>)}</div></section>

    <section className="method-panel"><p className="eyebrow">Record boundary</p><h2>Evidence, not a decorative credential.</h2><p>This page records attributable public work observed in a dated repository snapshot. It is not a certification, academic award, employment verification, or guarantee of present affiliation.</p><p>{contributors.recordPolicy.correctionRule}</p><p>{contributors.recordPolicy.fraudRule}</p><div className="inline-links"><a className="text-link" href={contributors.selectionPolicy.correctionUrl} target="_blank" rel="noreferrer">Request a correction <ArrowUpRight size={14} /></a><a className="text-link" href={contributors.selectionPolicy.optOutUrl} target="_blank" rel="noreferrer">Request removal <ArrowUpRight size={14} /></a><a className="text-link" href="https://github.com/elixpo/elixpo/blob/main/docs/policies/contributor-records.md" target="_blank" rel="noreferrer">Read the record policy <ArrowUpRight size={14} /></a></div></section>
  </main>;
}
