import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Github, MessageCircle } from "lucide-react";
import type { DirectoryEntry } from "@/lib/directory";
import { discussionUrl, familyPath, RELATIONSHIP_DESCRIPTIONS, RELATIONSHIP_LABELS } from "@/lib/directory";
import { serializeJsonLd } from "@/lib/seo";
import { ProjectMark } from "@/components/ProjectMark";

export function DossierPage({ entry }: { entry: DirectoryEntry }) {
  const path = familyPath(entry.family);
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": entry.family === "research" ? "ResearchProject" : entry.family === "service" ? "WebApplication" : "SoftwareSourceCode", name: entry.name, description: entry.description, url: entry.website ?? `https://elixpo.com${path}/${entry.slug}`, codeRepository: entry.repositoryUrl, isPartOf: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Elixpo", item: "https://elixpo.com" }, { "@type": "ListItem", position: 2, name: entry.family === "project" ? "Projects" : entry.family === "research" ? "Research" : "Services", item: `https://elixpo.com${path}` }, { "@type": "ListItem", position: 3, name: entry.name, item: `https://elixpo.com${path}/${entry.slug}` }] },
  ] };

  return (
    <main className="page-shell dossier-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <Link className="back-link" href={path}><ArrowLeft size={15} /> Back to {entry.family}</Link>
      <article>
        <header className="dossier-hero">
          <div>
            <ProjectMark seed={entry.slug} icon={entry.icon} size="large" />
            <p className="eyebrow">{entry.family} dossier · {RELATIONSHIP_LABELS[entry.relationship]}</p>
            <h1>{entry.name}</h1>
            <p className="lede">{entry.summary}</p>
          </div>
          <dl className="dossier-facts">
            <div><dt>Lifecycle</dt><dd><span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span></dd></div>
            <div><dt>Relationship</dt><dd>{RELATIONSHIP_LABELS[entry.relationship]}</dd></div>
            <div><dt>Registry state</dt><dd>{entry.verificationState.replaceAll("-", " ")}</dd></div>
            <div><dt>Repository</dt><dd>{entry.repository}</dd></div>
            <div><dt>Repository license</dt><dd>{entry.licenseEvidence.spdxId ?? entry.licenseEvidence.classification.replaceAll("-", " ")}</dd></div>
          </dl>
        </header>

        <section className="dossier-body">
          <div>
            <p className="eyebrow">What it is</p>
            <h2>A public record, not a marketing placeholder.</h2>
            <p className="body-copy">{entry.description}</p>
            <p className="body-copy"><strong>{RELATIONSHIP_LABELS[entry.relationship]}.</strong> {RELATIONSHIP_DESCRIPTIONS[entry.relationship]}</p>
          </div>
          <aside>
            <p className="eyebrow">Focus</p>
            <ul>{entry.focus.map((item) => <li key={item}>{item}</li>)}</ul>
            <div className="dossier-actions">
              <a href={entry.repositoryUrl} target="_blank" rel="noreferrer"><Github size={16} /> View repository</a>
              {entry.website && <a href={entry.website} target="_blank" rel="noreferrer">Visit live site <ArrowUpRight size={15} /></a>}
              <a href={discussionUrl(entry)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Discuss this {entry.family}</a>
            </div>
            {entry.evidence && <div className="evidence-links"><p className="eyebrow">Research record</p>{entry.evidence.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label} <ArrowUpRight size={13} /></a>)}</div>}
            <div className="evidence-links"><p className="eyebrow">License evidence</p><p>{entry.licenseEvidence.summary}</p>{entry.licenseEvidence.evidenceUrl && <a href={entry.licenseEvidence.evidenceUrl} target="_blank" rel="noreferrer">Open controlling license <ArrowUpRight size={13} /></a>}<small>License checked {entry.licenseEvidence.verifiedAt} · registry status checked {entry.statusVerifiedAt}</small><Link href="/resources">How registry evidence works <ArrowUpRight size={13} /></Link></div>
          </aside>
        </section>

        {entry.lifecycle === "archived" && (
          <section className="notice-panel">
            <p className="eyebrow">Archive notice</p>
            <h2>This work is preserved, but not maintained.</h2>
            <p>The repository remains available for reference. Elixpo is not promising fixes, releases, support, or service availability for this project.</p>
          </section>
        )}
      </article>
    </main>
  );
}
