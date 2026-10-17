import history from "../../../content/history.json";
import { ArrowUpRight } from "lucide-react";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Verified history of Elixpo",
  description: "Follow Elixpo's evidence-backed history from its earliest surviving 2023 project through open research, Hacktoberfest, community work, and public releases.",
  path: "/history",
});

const precisionLabel: Record<string, string> = {
  "verified-day": "Exact day verified",
  "verified-month": "Month verified",
  "verified-year": "Year verified",
  "verified-range": "Range verified",
  approximate: "Approximate date",
};

export default function HistoryPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "History of Elixpo",
    description: metadata.description,
    about: { "@type": "Organization", name: "Elixpo", foundingDate: "2023" },
    mainEntity: { "@type": "ItemList", itemListElement: history.entries.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.title, description: item.description, url: item.evidence[0].url })) },
  };

  return <main className="page-shell history-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="page-intro"><p className="eyebrow">History / evidence before mythology</p><h1>The record is part<br />of the release.</h1><p className="lede">Elixpo&apos;s history begins with surviving college-era project evidence, not a retrospective founding story. The timeline includes research, Hacktoberfest stewardship, contributor growth, infrastructure relationships, and community support—with date precision and public evidence attached to every milestone.</p></header>
    <section className="history-ledger">{history.entries.map((item, index) => <article key={`${item.period}-${item.title}`}><span>{item.period}<small>{precisionLabel[item.datePrecision]}</small></span><i>{String(index + 1).padStart(2,"0")}</i><div><p className="eyebrow">{item.kind}</p><h2>{item.title}</h2><p>{item.description}</p><div className="history-evidence">{item.evidence.map((evidence) => <a key={evidence.url} href={evidence.url} target="_blank" rel="noreferrer">{evidence.label}<ArrowUpRight size={12} /></a>)}</div></div></article>)}</section>
    <section className="method-panel"><p className="eyebrow">Method and limits</p><h2>“Complete” must mean verifiable.</h2><p>{history.methodology}</p><p>Closures, pauses, and archival decisions remain in the lifecycle registry even when an exact historical transition date is unavailable. Future milestones should be added only with primary evidence and appropriately narrow wording.</p></section>
  </main>;
}
