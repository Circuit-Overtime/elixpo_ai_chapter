import Link from "next/link";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import { CHAPTER_ENTRY } from "@/lib/directory";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

const pageMetadata = createPageMetadata({
  title: "The Elixpo Chapter — the public build floor",
  description: "Learn how the Elixpo Chapter turns active open-source work into bounded public releases through framing, contribution design, accountable review, attribution, and a durable record.",
  path: "/chapter",
});
export const metadata = {
  ...pageMetadata,
  alternates: {
    ...pageMetadata.alternates,
    types: { "application/atom+xml": "/chapter/feed.xml" },
  },
};

const stages = [
  ["01", "Frame", "A maintainer and steward define a release-sized outcome, its evidence, boundaries, and the contribution paths that are genuinely ready."],
  ["02", "Build", "Contributors work in public with named reviewers, visible decisions, and scope that can reach a useful finish."],
  ["03", "Release", "The work ships as software, research, hardware, or infrastructure with documentation and an intelligible public story."],
  ["04", "Record", "The release preserves attribution, decisions, status, artifacts, and custody so its history remains usable."],
] as const;

export default function ChapterPage() {
  const repositoryUrl = CHAPTER_ENTRY?.repositoryUrl ?? "https://github.com/elixpo/elixpo_chapter";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Project",
    name: "The Elixpo Chapter",
    description: metadata.description,
    url: "https://elixpo.com/chapter",
    codeRepository: repositoryUrl,
    parentOrganization: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" },
  };

  return <main className="chapter-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="chapter-page-hero">
      <div className="chapter-page-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div>
        <p className="eyebrow">Elixpo’s operating layer</p>
        <h1>The public<br /><em>build floor.</em></h1>
        <p className="lede">The Elixpo Chapter is not one more product in the directory. It is the shared repository and working model that turns an active goal into a legible, attributable release.</p>
        <div className="hero-actions">
          <a className="button primary" href={repositoryUrl} target="_blank" rel="noreferrer"><Github size={16} /> Open the Chapter</a>
          <Link className="button secondary" href="/contributing">Read the standards <ArrowRight size={16} /></Link>
        </div>
      </div>
      <aside><span>One shared path</span><strong>Frame → Build → Release → Record</strong><p>Repository custody is optional. Clear responsibility, prepared work, public review, and attribution are not.</p></aside>
    </header>

    <section className="chapter-page-body section-wrap">
      <div className="section-heading split"><div><p className="eyebrow">A bounded public outcome</p><h2>What happens inside a Chapter.</h2></div><p>A Chapter has an end condition. It does not promise endless maintenance; it makes the next meaningful release possible and preserves exactly what happened.</p></div>
      <ol>{stages.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
    </section>

    <section className="chapter-contract section-wrap">
      <div><p className="eyebrow">The contract</p><h2>Why build here?</h2></div>
      <div><p>Because open source needs more than storage. The Chapter concentrates attention around prepared work, connects contribution to a visible release, and gives maintainers and contributors a durable public record they can point to.</p><p>Elixpo contributes coordination, standards, discovery, review structure, and attribution. It does not claim ownership of a maintainer’s authorship or disguise paused work as active.</p><div className="inline-links"><a className="text-link" href={repositoryUrl} target="_blank" rel="noreferrer">Inspect the working repository <ArrowUpRight size={15} /></a><a className="text-link" href="/chapter/feed.xml">Subscribe to Chapter proposals <ArrowUpRight size={15} /></a></div></div>
    </section>
  </main>;
}
