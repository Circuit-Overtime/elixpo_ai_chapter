import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageStructuredData } from "@/components/PageStructuredData";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "What Elixpo provides", description: "See the concrete coordination, release, discovery, attribution, lifecycle, and continuity systems Elixpo provides to active open-source work.", path: "/features" });

const practices = [
  {title:"Release framing",text:"A bounded public goal with an outcome that can be understood and evaluated."},
  {title:"Contribution design",text:"Prepared entry points, review ownership, and work connected to the release."},
  {title:"Project dossiers",text:"One durable route joining status, repository, service, research, and stewardship."},
  {title:"Evidence-led credit",text:"Contribution stories tied to public evidence and member portfolios where available."},
  {title:"Lifecycle honesty",text:"Active, maintained, paused, completed, and archived work are never blended together."},
  {title:"Continuity records",text:"Custody, decisions, licensing, history, and release artifacts remain legible over time."},
];

export default function FeaturesPage() {
  return <main className="page-shell">
    <PageStructuredData name="What Elixpo provides" description="The coordination, contribution, release, discovery, attribution, lifecycle, and continuity systems used by Elixpo." path="/features" />
    <header className="page-intro"><p className="eyebrow">What Elixpo provides</p><h1>Coordination is<br/>the infrastructure.</h1><p className="lede">Elixpo does not sell hosting or compute. Its value is the public system around the code: the release frame, contribution path, review, discovery, credit, and durable institutional record.</p></header>
    <section className="directory-grid">{practices.map((item,index)=><article className="directory-card" key={item.title}><div className="card-topline"><span>{String(index+1).padStart(2,"0")}</span></div><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</section>
    <Link className="text-link" href="/about">Why this model exists <ArrowRight size={15}/></Link>
  </main>;
}
