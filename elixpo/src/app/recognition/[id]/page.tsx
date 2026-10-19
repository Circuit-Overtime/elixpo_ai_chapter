import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Download } from "lucide-react";
import recognition from "../../../../content/recognition.json";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

type PageProps = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return recognition.records.map((record) => ({ id: record.id.toLowerCase() }));
}

function getRecord(id: string) {
  return recognition.records.find((record) => record.id.toLowerCase() === id.toLowerCase());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const record = getRecord(id);
  if (!record) return {};
  return createPageMetadata({
    title: `${record.name} — Certificate of Contribution`,
    description: `Verify ${record.name}'s Elixpo Certificate of Contribution record ${record.id}, issued in appreciation of attributable open-source work.`,
    path: `/recognition/${record.id.toLowerCase()}`,
    socialImage: `/social/recognition/${record.id.toLowerCase()}`,
  });
}

export default async function RecognitionPage({ params }: PageProps) {
  const { id } = await params;
  const record = getRecord(id);
  if (!record) notFound();
  const canonicalUrl = `https://elixpo.com/recognition/${record.id.toLowerCase()}`;
  const evidenceExternal = record.recordUrl.startsWith("http");
  const issued = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${record.issuedAt}T00:00:00Z`));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `Certificate of Contribution — ${record.name}`,
    identifier: record.id,
    datePublished: record.issuedAt,
    url: canonicalUrl,
    author: { "@type": "Organization", name: recognition.issuer, url: "https://elixpo.com" },
    about: { "@type": "Person", name: record.name, sameAs: `https://github.com/${record.handle}` },
    citation: record.recordUrl.startsWith("http") ? record.recordUrl : `https://elixpo.com${record.recordUrl}`,
  };

  return <main className="recognition-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <div className="recognition-toolbar"><Link href="/recognition"><ArrowLeft size={14}/> All recognition records</Link><a className="recognition-print" href={`/recognition/${record.id.toLowerCase()}/certificate.png`} download={`elixpo-${record.id.toLowerCase()}.png`}><Download size={15}/> Download certificate PNG</a></div>
    <article className="recognition-certificate" aria-labelledby="certificate-recipient">
      <div className="recognition-geometry" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
      <header><div className="recognition-brand"><Image src="/logos/logo.webp" width={42} height={42} alt=""/><div><strong>Elixpo</strong><span>OPEN-SOURCE PROJECT FOUNDRY</span></div></div><div className="recognition-series"><span>PUBLIC APPRECIATION RECORD</span><b>2026 / {record.id.slice(-3)}</b></div></header>
      <section className="recognition-copy"><p>PUBLIC RECOGNITION OF OPEN-SOURCE WORK</p><h1>Certificate of<br/><em>Contribution.</em></h1><div className="recognition-address"><small>Presented with appreciation</small><h2 id="certificate-recipient">Dear {record.name},</h2></div><p className="recognition-statement">Elixpo proudly recognizes you {record.statement}. Your care, skill, and willingness to build in public helped turn shared ideas into documented, usable outcomes. This contribution is preserved in Elixpo&apos;s inspectable public record so the work—and the person behind it—remains visible.</p></section>
      <aside className="recognition-seal"><BadgeCheck size={29}/><strong>PUBLIC<br/>RECORD</strong><span>ELIXPO · 2026</span></aside>
      <footer><dl><div><dt>Contribution period</dt><dd>{record.period}</dd></div><div><dt>GitHub identity</dt><dd>@{record.handle}</dd></div><div><dt>Issued</dt><dd>{issued}</dd></div><div><dt>Certificate ID</dt><dd>{record.id}</dd></div></dl><div className="recognition-signature"><i aria-hidden="true"/><span>Ayushman Bhattacharya</span><b>Founder and Project Lead · Authorized signatory</b></div><div className="recognition-verify"><span>VERIFY THE RECORD</span><b>elixpo.com/recognition/{record.id.toLowerCase()}</b></div></footer>
    </article>
    <section className="recognition-evidence"><div><p className="eyebrow">Verification boundary</p><h2>This is appreciation, not accreditation.</h2></div><div><p>The record recognizes attributable public contribution. It does not assert employment, internship completion, academic credit, professional certification, or current organization membership.</p><a href={record.recordUrl} target={evidenceExternal ? "_blank" : undefined} rel={evidenceExternal ? "noreferrer" : undefined}>Inspect the contribution record <ArrowUpRight size={14}/></a><a href={`https://github.com/${record.handle}`} target="_blank" rel="noreferrer">Open the public GitHub identity <ArrowUpRight size={14}/></a></div></section>
  </main>;
}
