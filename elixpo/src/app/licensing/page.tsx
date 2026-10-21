import Link from "next/link";
import { ArrowUpRight, FileCheck2, Scale, ShieldCheck } from "lucide-react";
import licensing from "../../../content/licensing.json";
import { PageStructuredData } from "@/components/PageStructuredData";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Licensing policy",
  description: "Understand how licenses apply across Elixpo source code, research, hardware, datasets, models, member projects, brand assets, and transferred repositories.",
  path: "/licensing",
});

const artifactNames: Record<string, string> = {
  "source-code": "Source code",
  "papers-and-documentation": "Papers and documentation",
  "hardware-source": "Hardware design sources",
  datasets: "Datasets",
  "models-and-weights": "Models and weights",
  "brand-assets-and-stickers": "Brand assets and stickers",
};

export default function LicensingPage() {
  return (
    <main className="page-shell policy-page">
      <PageStructuredData
        name="Elixpo licensing policy"
        description="Artifact-specific licensing rules, defaults for new Elixpo-owned work, member-project protections, and the separation between copyright and trademark permission."
        path="/licensing"
      />

      <header className="policy-hero">
        <div>
          <p className="eyebrow">Public policy / verified {licensing.lastVerified}</p>
          <h1>One organization.<br /><em>Different grants.</em></h1>
          <p className="lede">Elixpo publishes code, papers, hardware, datasets, models, services, and brand material. Each artifact keeps the license stated by its owning repository or release record.</p>
        </div>
        <aside>
          <Scale size={28} />
          <span>Controlling rule</span>
          <p>{licensing.currentRepositoryRule}</p>
        </aside>
      </header>

      <section className="policy-section">
        <div className="policy-section-heading"><p className="eyebrow">Defaults for new work</p><h2>A default is a starting point, not a retroactive grant.</h2><p>These choices guide new Elixpo-owned artifacts. Existing work changes only after authority, contributor, provenance, and compatibility review.</p></div>
        <div className="license-grid">
          {licensing.defaultsForNewWork.map((item, index) => (
            <article key={item.artifactClass}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small>{artifactNames[item.artifactClass] ?? item.artifactClass}</small>
              <h3>{item.default ?? "Review per artifact"}</h3>
              <p>{item.selectionRule}</p>
              {item.alternatives.length > 0 && <b>Alternative: {item.alternatives.join(", ")}</b>}
            </article>
          ))}
        </div>
      </section>

      <section className="policy-principles">
        <article><FileCheck2 size={24}/><p className="eyebrow">Member projects</p><h2>The existing license stays.</h2><p>{licensing.memberProjects.statement} Repository custody, maintainer authority, authorship, and copyright are recorded as separate facts.</p></article>
        <article><ShieldCheck size={24}/><p className="eyebrow">Unclear terms</p><h2>No permission is invented.</h2><p>{licensing.existingRepositories.statement} A missing or custom license is disclosed rather than presented as open source.</p></article>
      </section>

      <section className="policy-detail">
        <div><p className="eyebrow">Open-source claims</p><h2>Describe the artifact that is actually licensed.</h2></div>
        <div><p>{licensing.openSourceClaims.statement}</p><p>Official domains, package publisher identities, deployment credentials, signing keys, production data, and service operations are not transferred merely because related source code is public.</p></div>
      </section>

      <section className="policy-detail">
        <div><p className="eyebrow">Names and marks</p><h2>Copyright permission is not endorsement.</h2></div>
        <div><p>{licensing.trademarks.statement}</p><p>{licensing.trademarks.referentialUse}</p><p>{licensing.trademarks.permissionRequired}</p><Link className="text-link" href="/branding">Read the public brand guidance <ArrowUpRight size={14}/></Link></div>
      </section>

      <section className="policy-closing">
        <p className="eyebrow">Inspect the evidence</p>
        <h2>Use the license attached to the work—not an assumption about Elixpo.</h2>
        <p>The public registry preserves current repository-level evidence. The actual license file or artifact record remains controlling. This page explains Elixpo’s publishing practice and is not legal advice.</p>
        <div><a className="button primary" href="https://github.com/elixpo/elixpo/blob/main/content/repository-licenses.json" target="_blank" rel="noreferrer">Repository license evidence <ArrowUpRight size={15}/></a><Link className="button secondary" href="/terms">Terms of service</Link></div>
      </section>
    </main>
  );
}
