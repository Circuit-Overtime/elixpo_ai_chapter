import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import brand from "../../../content/brand.json";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const BRAND_DESCRIPTION = "Use Elixpo's Open Field colours, typography guidance, canonical marks, project icons, social artwork, diagrams, and protected sticker previews.";

const assetsMetadata = createPageMetadata({
  title: "Elixpo brand kit, usage guidance, and sticker previews",
  description: BRAND_DESCRIPTION,
  path: "/assets",
});
export const metadata = {
  ...assetsMetadata,
  alternates: { canonical: "/branding" },
  robots: { index: false, follow: true },
};

const marks = [
  { name: "Elixpo lock-up with Oreo", file: "/brand/source/marks/elixpo_lock_up_text_mascot.png" },
  { name: "Elixpo word mark", file: "/brand/source/marks/elixpo_word_mask_text.png" },
  { name: "Oreo mascot", file: "/brand/source/marks/mascot_elixpo_oreo.png" },
];

const socialAssets = [
  { name: "Elixpo social banner", file: "/brand/source/social/elixpo-banner.png" },
  { name: "Social banner background", file: "/brand/source/social/elixpo-banner.bg.png" },
  { name: "Dotted social background", file: "/brand/source/social/elixpo-dotted-background.png", previewClass: "asset-preview-dotted" },
];

const diagrams = [
  { name: "Elixpo ecosystem infographic", file: "/brand/diagrams/elixpo-ecosystem.svg" },
  { name: "Verified Elixpo history strip", file: "/brand/diagrams/elixpo-history-strip.svg" },
  { name: "Elixpo evidence chain", file: "/brand/diagrams/elixpo-evidence-chain.svg" },
];

const stickers = [
  { name: "Ship it", file: "/brand/stickers/previews/ship-it-preview.webp" },
  { name: "Commit", file: "/brand/stickers/previews/commit-preview.webp" },
  { name: "LGTM", file: "/brand/stickers/previews/lgtm-preview.webp" },
];

const icons = ["accounts.elixpo", "admin.elixpo", "agent.elixpo", "art.elixpo", "blogs.elixpo", "chat.elixpo", "crumb.elixpo", "elixpo.com", "mail.elixpo", "me.elixpo", "oreo.elixpo", "payouts.elixpo", "search.elixpo", "sketch.elixpo", "url.elixpo"];
const formatMegabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

function DownloadGrid({ items }: { items: Array<{ name: string; file: string; previewClass?: string }> }) {
  return <div className="mark-grid">{items.map((item) => <article key={item.file}>
    <div className={item.previewClass}><Image src={item.file} alt={item.name} width={560} height={320} /></div>
    <h3>{item.name}</h3>
    <a href={item.file} download>Download source <Download size={14} /></a>
  </article>)}</div>;
}

export function BrandingContent({ canonicalPath = "/branding" }: { canonicalPath?: "/branding" | "/assets" }) {
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Elixpo brand assets", description: BRAND_DESCRIPTION, url: `https://elixpo.com${canonicalPath}` };
  return <main className="page-shell brand-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="page-intro"><p className="eyebrow">Brand / Open Field</p><h1>A consistent identity for Elixpo&apos;s public work.</h1><p className="lede">The Elixpo identity combines clear institutional typography, warm paper, foundry green, and the Oreo mascot. This library provides the public colour system, typography guidance, reviewed organization marks, project assets, and the access rules for protected event material.</p></header>
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
    <section className="asset-section"><div className="section-heading"><p className="eyebrow">README, evidence, and history diagrams</p><h2>Evidence-led diagrams for the primary public READMEs.</h2></div><DownloadGrid items={diagrams} /></section>
    <section className="asset-section sticker-preview-section" aria-labelledby="sticker-previews-title">
      <div className="section-heading split">
        <div><p className="eyebrow">Protected event material</p><h2 id="sticker-previews-title">Official stickers are available by approved request.</h2></div>
        <p>The images below are watermarked, screen-resolution previews. They are not print sources and do not grant permission to reproduce, distribute, modify, or sell the artwork.</p>
      </div>
      <div className="sticker-preview-grid">{stickers.map((sticker) => <article key={sticker.file}>
        <div><Image src={sticker.file} alt={`Watermarked preview of the ${sticker.name} Elixpo sticker`} width={480} height={480} /></div>
        <span><ShieldCheck size={15} /> Watermarked preview</span>
        <h3>{sticker.name}</h3>
      </article>)}</div>
      <div className="sticker-access-note">
        <div><p className="eyebrow">Request access</p><h3>Planning a community event?</h3><p>Approved partners may receive physical sticker packs or print-ready artwork for the agreed event. Elixpo records the scope and permitted use in writing before release.</p></div>
        <Link className="button" href="/partnerships">Review the partnership process <ArrowRight size={16} /></Link>
      </div>
    </section>
    <section className="brand-audit" aria-labelledby="brand-audit-title"><div><p className="eyebrow">Source audit</p><h2 id="brand-audit-title">A curated public library, not a raw repository dump.</h2><p>The private production workspace contains generation tools, prompts, restricted masters, outputs, and historical material. Only reviewed public assets become canonical here.</p></div><dl><div><dt>Production source</dt><dd>{brand.audit.standaloneTrackedFiles}</dd><small>tracked files · {formatMegabytes(brand.audit.standaloneDiskSizeBytes)}</small></div><div><dt>Portal library</dt><dd>{brand.audit.portalBrandFiles}</dd><small>reviewed files · {formatMegabytes(brand.audit.portalBrandDiskSizeBytes)}</small></div><div><dt>Exact masters</dt><dd>{brand.audit.exactMasterDuplicates}</dd><small>verified byte-for-byte</small></div></dl></section>
    <section className="method-panel"><p className="eyebrow">Migration status</p><h2>The reviewed public library has moved; restricted production material has not.</h2><p>{brand.note}</p><p>Colour tokens, typography guidance, and general usage guidance remain public. Copyright licenses and trademark permissions are separate, and download availability does not grant permission to imply endorsement, impersonate Elixpo, or present a modified mark as official.</p></section>
  </main>;
}

export default function AssetsPage() {
  return <BrandingContent canonicalPath="/assets" />;
}
