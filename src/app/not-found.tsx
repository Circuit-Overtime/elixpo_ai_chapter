import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

export default function NotFound() {
  return <main className="not-found-page">
    <div className="not-found-geometry" aria-hidden="true"><span/><span/><span/><span/></div>
    <div className="not-found-code" aria-hidden="true">404</div>
    <div className="not-found-copy">
      <p className="eyebrow">Record not found</p>
      <h1>This route is outside the <em>public record.</em></h1>
      <p>The page may have moved, the address may be incomplete, or the record may never have existed. The project and research indexes remain the canonical starting points.</p>
      <div className="hero-actions"><Link className="button primary" href="/">Return home <ArrowRight size={16}/></Link><Link className="button secondary" href="/projects"><Search size={15}/> Browse projects</Link></div>
    </div>
  </main>;
}
