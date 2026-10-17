import { ArrowUpRight } from "lucide-react";
import { createPageMetadata } from "@/lib/seo";
import { PageStructuredData } from "@/components/PageStructuredData";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";

export const metadata = createPageMetadata({
  title: "Elixpo organizational architecture",
  description: "Understand how the registry, Chapters, project repositories, research publishing, package distribution, operated services, and shared standards fit together.",
  path: "/architecture",
});

const layers = [
  { title: "Canonical registry", text: "Defines every repository’s public family, lifecycle, stewardship relationship, custody, and verification state." },
  { title: "Chapters", text: "Time-bounded public build and release programmes for active work with a concrete, documented outcome." },
  { title: "Member Projects", text: "Independently led projects with an ongoing relationship and explicit authority and stewardship boundaries." },
  { title: "Project repositories", text: "Own source code, experiments, evidence, releases, licenses, maintainers, and project-specific technical documentation." },
  { title: "Public dossiers", text: "Search-readable portal routes that connect work, status, repositories, evidence, people, packages, and research publications." },
  { title: "Shared standards", text: "Define repository structure, contribution paths, review workflows, licensing defaults, conduct, metadata, and brand rules." },
];

export default function ArchitecturePage() {
  return <main className="page-shell architecture-page">
    <PageStructuredData name="Elixpo organizational architecture" description="How Elixpo's registry, Chapters, repositories, publications, services, and shared standards divide responsibility." path="/architecture" />
    <header className="page-intro"><p className="eyebrow">Organizational architecture</p><h1>One registry.<br/>Several accountable surfaces.</h1><p className="lede">Elixpo is organized around evidence and responsibility, not a claim that every project shares one technical stack. The registry provides shared identity; each project and publication surface retains the architecture it actually needs.</p></header>
    <section className="architecture-diagram" aria-labelledby="architecture-diagram-title"><div className="section-heading split"><div><p className="eyebrow">System map</p><h2 id="architecture-diagram-title">How work moves through Elixpo.</h2></div><p>The diagram separates owning repositories, the Chapter coordination layer, specialized publishers, and the public record. Arrows describe information and release flow—not automatic ownership transfer.</p></div><ArchitectureDiagram /></section>
    <section className="architecture-stack">{layers.map((layer,index)=><article key={layer.title}><span>{String(index+1).padStart(2,"0")}</span><h2>{layer.title}</h2><p>{layer.text}</p></article>)}</section>
    <section className="architecture-contract">
      <div><p className="eyebrow">Specialized repositories</p><h2>Research publishing and package distribution are maintained separately.</h2><p>The main portal owns organization-level discovery and classification. The specialized repositories own their publication and distribution operations while consuming shared identifiers and metadata contracts.</p></div>
      <div className="architecture-surface-grid">
        <article><span>RESEARCH.ELIXPO</span><h3>Research publisher</h3><p>Papers, citations, datasets, models, demonstrations, and reproducibility presentation. Source experiments and evidence remain in their project repositories.</p><a href="https://research.elixpo.com">Planned research destination <ArrowUpRight size={14}/></a></article>
        <article><span>PACKAGES.ELIXPO</span><h3>Distribution authority</h3><p>Package builds, signed APT metadata, installers, checksums, release artifacts, and distribution documentation.</p><a href="https://packages.elixpo.com" target="_blank" rel="noreferrer">Open package distribution <ArrowUpRight size={14}/></a></article>
      </div>
    </section>
  </main>;
}
