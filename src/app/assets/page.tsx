import Image from "next/image";
import { Download } from "lucide-react";
import brand from "../../../content/brand.json";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo brand, logos, project icons, and social assets",
  description: "Download canonical Elixpo marks, the Oreo mascot, project icons, social artwork, and sticker samples, with provenance and migration status for the Open Field identity.",
  path: "/assets",
});

const marks = [
  { name: "Elixpo lock-up with Oreo", file: "/brand/source/marks/elixpo_lock_up_text_mascot.png" },
  { name: "Elixpo word mark", file: "/brand/source/marks/elixpo_word_mask_text.png" },
  { name: "Oreo mascot", file: "/brand/source/marks/mascot_elixpo_oreo.png" },
];

const socialAssets = [
  { name: "Elixpo social banner", file: "/brand/source/social/elixpo-banner.png" },
  { name: "Social banner background", file: "/brand/source/social/elixpo-banner.bg.png" },
  { name: "Dotted social background", file: "/brand/source/social/elixpo-dotted-background.png" },
];

const stickers = [
  { name: "Ship it", file: "/brand/stickers/ship-it.webp" },
  { name: "Commit", file: "/brand/stickers/commit.webp" },
  { name: "LGTM", file: "/brand/stickers/lgtm.webp" },
];

const icons = ["accounts.elixpo", "admin.elixpo", "agent.elixpo", "art.elixpo", "blogs.elixpo", "chat.elixpo", "crumb.elixpo", "elixpo.com", "mail.elixpo", "me.elixpo", "oreo.elixpo", "payouts.elixpo", "search.elixpo", "sketch.elixpo", "url.elixpo"];
const formatMegabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

function DownloadGrid({ items }: { items: Array<{ name: string; file: string }> }) {
  return <div className="mark-grid">{items.map((item) => <article key={item.file}>
    <div><Image src={item.file} alt={item.name} width={560} height={320} /></div>
    <h3>{item.name}</h3>
    <a href={item.file} download>Download source <Download size={14} /></a>
  </article>)}</div>;
}

export default function AssetsPage() {
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Elixpo brand assets", description: metadata.description, url: "https://elixpo.com/assets" };
  return <main className="page-shell brand-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="page-intro"><p className="eyebrow">Brand / Open Field</p><h1>A recognizable commons,<br />without the corporate costume.</h1><p className="lede">The Elixpo identity combines quiet institutional typography, warm paper, foundry green, and the Oreo mascot. This library is the canonical public source for organization and project assets.</p></header>
    <section className="brand-direction"><div><p className="eyebrow">Visual principle</p><h2>{brand.visualDirection.name}</h2><p>{brand.visualDirection.principle}</p></div><div className="swatches">{brand.visualDirection.palette.map((color) => <div key={color.hex}><i style={{ background: color.hex }} /><span>{color.name}<small>{color.hex}</small></span></div>)}</div></section>
    <section className="asset-section brand-proof-section" aria-labelledby="brand-proofs-title">
      <div className="section-heading split"><div><p className="eyebrow">System proofs</p><h2 id="brand-proofs-title">One grammar across six kinds of public record.</h2></div><p>These components test Open Field against the surfaces Elixpo actually maintains. They share structure without erasing the identity or evidence of each record.</p></div>
      <div className="brand-proofs">
        <article className="proof-readme"><span>README / ORGANIZATION</span><strong>Open work should reach<br/><em>a clear public release.</em></strong><p>Software · Research · Services · Chapters</p><i/><i/></article>
        <article className="proof-ecosystem"><span>ECOSYSTEM</span><div><b>Projects</b><b>Research</b><b>Services</b><b>People</b><i>Elixpo</i></div></article>
        <article className="proof-record proof-research"><span>RESEARCH / ACTIVE</span><b>OctaBit</b><p>Paper · source · reproducibility</p><small>2026 / VERIFIED RECORD</small></article>
        <article className="proof-record proof-package"><span>PACKAGE / RELEASED</span><b>@elixpo/lixsketch</b><p>npm · source · install · license</p><small>VERSION 5.6.5</small></article>
        <article className="proof-record proof-chapter"><span>CHAPTER / PROPOSAL</span><b>A bounded public outcome.</b><p>Goal · roles · review · release</p><small>DECISION RECORDED</small></article>
        <article className="proof-timeline"><span>HISTORY / 2023</span><i/><div><b>Elixpo begins.</b><p>A college project origin, preserved as history rather than the present identity.</p></div></article>
      </div>
    </section>
    <section className="asset-section"><div className="section-heading"><p className="eyebrow">Primary marks</p><h2>Use the mark with room to breathe.</h2></div><DownloadGrid items={marks} /></section>
    <section className="asset-section"><div className="section-heading"><p className="eyebrow">Project icon family</p><h2>One family, distinct tools.</h2></div><div className="icon-grid">{icons.map((name) => <a key={name} href={`/brand/source/icons/${name}.png`} download><Image src={`/brand/source/icons/${name}.png`} alt={`${name} project icon`} width={96} height={96} /><span>{name}</span><Download size={13} /></a>)}</div></section>
    <section className="asset-section"><div className="section-heading"><p className="eyebrow">Social templates</p><h2>Stable artwork for public announcements.</h2></div><DownloadGrid items={socialAssets} /></section>
    <section className="asset-section"><div className="section-heading"><p className="eyebrow">Sticker samples</p><h2>Artwork made for the community.</h2></div><DownloadGrid items={stickers} /></section>
    <section className="brand-audit" aria-labelledby="brand-audit-title"><div><p className="eyebrow">Source audit</p><h2 id="brand-audit-title">A curated public library, not a raw repository dump.</h2><p>The standalone archive contains generation tools, prompts, outputs, and historical material. Only reviewed assets become canonical here.</p></div><dl><div><dt>Standalone source</dt><dd>{brand.audit.standaloneTrackedFiles}</dd><small>tracked files · {formatMegabytes(brand.audit.standaloneDiskSizeBytes)}</small></div><div><dt>Portal library</dt><dd>{brand.audit.portalBrandFiles}</dd><small>reviewed files · {formatMegabytes(brand.audit.portalBrandDiskSizeBytes)}</small></div><div><dt>Exact masters</dt><dd>{brand.audit.exactMasterDuplicates}</dd><small>verified byte-for-byte</small></div></dl></section>
    <section className="method-panel"><p className="eyebrow">Migration status</p><h2>The public canon has moved; the production archive has not.</h2><p>{brand.note}</p><p>Copyright licenses and trademark permissions are separate. Download availability does not grant permission to imply endorsement, impersonate Elixpo, or present a modified mark as official.</p></section>
  </main>;
}
