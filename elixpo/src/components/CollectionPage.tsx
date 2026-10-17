import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { DirectoryEntry, PublicFamily } from "@/lib/directory";
import { familyPath } from "@/lib/directory";
import { serializeJsonLd } from "@/lib/seo";
import { ProjectMark } from "@/components/ProjectMark";

const FAMILY_LABEL: Record<PublicFamily, string> = {
  project: "Open projects",
  research: "Open research",
  service: "Operated services",
};

interface CollectionPageProps {
  family: PublicFamily;
  title: string;
  introduction: string;
  entries: DirectoryEntry[];
}

export function CollectionPage({ family, title, introduction, entries }: CollectionPageProps) {
  const current = entries.filter((entry) => entry.lifecycle !== "archived");
  const archive = entries.filter((entry) => entry.lifecycle === "archived");
  const path = familyPath(family);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: introduction,
    url: `https://elixpo.com${path}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: entry.name,
        url: `https://elixpo.com${path}/${entry.slug}`,
      })),
    },
  };

  return (
    <main className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <header className="page-intro">
        <p className="eyebrow">Elixpo directory / {FAMILY_LABEL[family]}</p>
        <h1>{title}</h1>
        <p className="lede">{introduction}</p>
        <div className="directory-key" aria-label="Directory status key">
          <span><i className="status-dot status-active" /> Current work</span>
          <span><i className="status-dot status-paused" /> Paused or maintained</span>
          <span><i className="status-dot status-archived" /> Historical record</span>
        </div>
      </header>

      <section className="directory-section" aria-labelledby={`${family}-current`}>
        <div className="section-heading">
          <p className="eyebrow">Current directory</p>
          <h2 id={`${family}-current`}>Work with a present-tense status.</h2>
          <p>{current.length} records drawn from the canonical organization registry.</p>
        </div>
        <div className="directory-grid">
          {current.map((entry, index) => (
            <article className="directory-card" key={entry.slug}>
              <div className="card-topline">
                <ProjectMark seed={entry.slug} icon={entry.icon} size="small" />
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span>
              </div>
              <div>
                <p className="eyebrow">{entry.relationship} · {entry.focus[0]}</p>
                <h3>{entry.name}</h3>
                <p>{entry.summary}</p>
              </div>
              <div className="card-actions">
                <Link href={`${path}/${entry.slug}`}>Read dossier <ArrowRight size={15} /></Link>
                {entry.website && <a href={entry.website} target="_blank" rel="noreferrer">Open site <ArrowUpRight size={14} /></a>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {archive.length > 0 && (
        <section className="archive-section" aria-labelledby={`${family}-archive`}>
          <div className="section-heading compact">
            <p className="eyebrow">Preserved, not promoted</p>
            <h2 id={`${family}-archive`}>The archive is part of the story.</h2>
            <p>Archived work stays discoverable without being mistaken for a maintained release.</p>
          </div>
          <div className="archive-list">
            {archive.map((entry) => (
              <Link key={entry.slug} href={`${path}/${entry.slug}`}>
                <span><strong>{entry.name}</strong><small>{entry.summary}</small></span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
