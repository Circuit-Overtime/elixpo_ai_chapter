import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download, Github } from "lucide-react";
import type { DirectoryEntry } from "@/lib/directory";
import type { ResearchRecord } from "@/lib/research";
import { serializeJsonLd } from "@/lib/seo";
import { ProjectMark } from "@/components/ProjectMark";

export function ResearchRecordPage({ entry, record }: { entry: DirectoryEntry; record: ResearchRecord }) {
  const canonicalUrl = `https://elixpo.com/research/${entry.slug}`;
  const artifactType = (kind: string) => kind === "dataset" || kind === "evaluation" ? "Dataset" : kind === "package" ? "SoftwareApplication" : kind === "paper" ? "ScholarlyArticle" : kind === "hardware" ? "Product" : "CreativeWork";
  const artifactNodes = record.artifacts.map((artifact, index) => ({
    "@type": artifactType(artifact.kind),
    "@id": `${canonicalUrl}#artifact-${index + 1}`,
    name: artifact.label,
    url: artifact.url,
    ...(artifact.license ? { license: artifact.license } : {}),
    isPartOf: { "@id": `${canonicalUrl}#research` },
  }));
  const demoNodes = record.liveDemos.map((demo, index) => ({
    "@type": "SoftwareApplication",
    "@id": `${canonicalUrl}#demo-${index + 1}`,
    name: demo.name,
    description: demo.description,
    url: demo.url,
    applicationCategory: "ResearchApplication",
    isPartOf: { "@id": `${canonicalUrl}#research` },
  }));
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": record.researchStatus === "technical-report" ? "TechArticle" : record.paperUrl ? "ScholarlyArticle" : "ResearchProject", "@id": `${canonicalUrl}#research`, name: record.title, headline: record.title, description: record.abstract, url: canonicalUrl, codeRepository: record.codeUrl, publisher: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" }, ...(record.paperUrl ? { sameAs: record.paperUrl } : {}), ...(record.releasedAt ? { datePublished: record.releasedAt } : {}), ...("doi" in record && record.doi ? { identifier: { "@type": "PropertyValue", propertyID: "DOI", value: record.doi } } : {}), ...(record.authors.length ? { author: record.authors.map((author) => ({ "@type": "Person", name: author.name, ...(author.affiliation ? { affiliation: { "@type": "Organization", name: author.affiliation } } : {}) })) } : {}), ...((artifactNodes.length || demoNodes.length) ? { hasPart: [...artifactNodes, ...demoNodes].map((node) => ({ "@id": node["@id"] })) } : {}) },
    { "@type": "SoftwareSourceCode", "@id": `${canonicalUrl}#source`, name: `${record.title} source code`, codeRepository: record.codeUrl, url: record.codeUrl, isPartOf: { "@id": `${canonicalUrl}#research` } },
    ...artifactNodes,
    ...demoNodes,
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Elixpo", item: "https://elixpo.com" }, { "@type": "ListItem", position: 2, name: "Research", item: "https://elixpo.com/research" }, { "@type": "ListItem", position: 3, name: entry.name, item: canonicalUrl }] },
  ] };

  return <main className="page-shell dossier-page research-record-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <Link className="back-link" href="/research"><ArrowLeft size={15}/> Back to research</Link>
    <article>
      <header className="dossier-hero">
        <div><ProjectMark seed={entry.slug} icon={entry.icon} size="large"/><p className="eyebrow">{entry.name} · {record.reviewStatus.replaceAll("-", " ")}</p><h1 className="citation_title">{record.title}</h1>{record.authors.length > 0 && <p className="citation_author">By {record.authors.map((author) => author.name).join(", ")}</p>}<p className="lede">{record.abstract}</p></div>
        <dl className="dossier-facts"><div><dt>Research status</dt><dd>{record.researchStatus.replaceAll("-", " ")}</dd></div><div><dt>Lifecycle</dt><dd><span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span></dd></div><div><dt>Reproducibility</dt><dd>{record.reproducibility.status.replaceAll("-", " ")}</dd></div>{record.releasedAt && <div><dt>Released</dt><dd>{record.releasedAt}</dd></div>}</dl>
      </header>
      <section className="dossier-body">
        <div><p className="eyebrow">Research context</p><h2>Scope and public claim</h2><p className="body-copy">{entry.description}</p>{record.authors.length > 0 && <div className="research-authors"><p className="eyebrow">Authors and affiliations</p>{record.authors.map((author) => <p key={author.name}><strong>{author.name}</strong>{author.affiliation ? ` · ${author.affiliation}` : ""}</p>)}</div>}</div>
        <aside><p className="eyebrow">Primary record</p><div className="dossier-actions"><a href={record.codeUrl} target="_blank" rel="noreferrer"><Github size={16}/> Source repository</a>{record.paperUrl && <a href={record.paperUrl} target="_blank" rel="noreferrer">Paper or report <ArrowUpRight size={15}/></a>}</div>{record.artifacts.length > 0 && <div className="evidence-links"><p className="eyebrow">Artifacts</p>{record.artifacts.map((artifact) => <a key={artifact.url} href={artifact.url} target="_blank" rel="noreferrer">{artifact.label} <ArrowUpRight size={13}/></a>)}</div>}</aside>
      </section>
      <section className="research-record-grid">
        <article><p className="eyebrow">Reproducibility</p><h2>{record.reproducibility.status.replaceAll("-", " ")}</h2><p>{record.reproducibility.summary}</p></article>
        <article><p className="eyebrow">Review statement</p><h2>{record.reviewStatus.replaceAll("-", " ")}</h2><p>Elixpo reports the review state explicitly and does not imply external peer review where none is recorded.</p></article>
      </section>
      {record.liveDemos.length > 0 && <section className="method-panel"><p className="eyebrow">Runnable demonstrations</p><h2>Inspect the work interactively.</h2><div className="inline-links">{record.liveDemos.map((demo) => <a className="text-link" key={demo.url} href={demo.url} target="_blank" rel="noreferrer">{demo.name} <ArrowUpRight size={14}/></a>)}</div></section>}
      {(record.licenses.length > 0 || record.citation) && <section className="research-publication-record"><div><p className="eyebrow">Licensing</p>{record.licenses.length ? record.licenses.map((license) => <p key={license.artifact}><strong>{license.artifact}</strong><br/><a href={license.url} target="_blank" rel="noreferrer">{license.license} <ArrowUpRight size={12}/></a></p>) : <p>No artifact-specific license is recorded.</p>}</div><div><p className="eyebrow">Citation</p><p>{record.citation?.text ?? "No formal citation record is published."}</p><div className="inline-links">{record.citation && <a className="text-link" href={`/research/${record.slug}/citation.bib`} download><Download size={13}/> Download BibTeX</a>}{record.citation?.cffUrl && <a className="text-link" href={record.citation.cffUrl} target="_blank" rel="noreferrer">Open CITATION.cff <ArrowUpRight size={13}/></a>}</div></div></section>}
    </article>
  </main>;
}
