import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import recognition from "../../../content/recognition.json";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo contribution appreciation records",
  description: "Verify appreciation records issued by Elixpo for attributable open-source software, research, documentation, infrastructure, and community contributions.",
  path: "/recognition",
});

export default function RecognitionIndexPage() {
  return <main className="page-shell recognition-index">
    <header className="page-intro"><p className="eyebrow">Recognition / public verification</p><h1>Appreciation backed by a public record.</h1><p className="lede">Elixpo issues appreciation records for attributable open-source work. They recognize contribution; they do not represent employment, an academic qualification, professional certification, or an internship unless a separate agreement explicitly says so.</p></header>
    <section className="recognition-list" aria-label="Issued appreciation records">{recognition.records.map((record) => <Link key={record.id} href={`/recognition/${record.id.toLowerCase()}`}><BadgeCheck size={22}/><div><span>{record.id} · @{record.handle}</span><h2>{record.name}</h2><p>{record.statement}.</p></div><ArrowRight size={18}/></Link>)}</section>
  </main>;
}
