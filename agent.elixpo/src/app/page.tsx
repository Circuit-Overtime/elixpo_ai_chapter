import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  CircleDot,
  GitMerge,
  GitPullRequest,
  Github,
  MessageSquareText,
  PanelsTopLeft,
  ShieldCheck,
  Tags,
  Workflow,
  X,
} from "lucide-react";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/site-metadata";

export const metadata = pageMetadata("GitHub Project Management Agent", SITE_DESCRIPTION, "/");

const capabilities = [
  { icon: Tags, title: "Triage", copy: "Classifies issues and pull requests, applies only centrally allowed labels, and synchronizes one Project V2 item." },
  { icon: MessageSquareText, title: "Exact mentions", copy: "Responds to explicit @elixpoo requests after actor permissions and the requested action pass deterministic checks." },
  { icon: GitPullRequest, title: "Review", copy: "Reads API-grounded pull-request evidence and publishes deduplicated, comment-only technical reviews." },
  { icon: GitMerge, title: "Merge memory", copy: "Records one compact, revision-checked Gist entry after a pull request merges." },
] as const;

const protocol = [
  ["01", "Event", "A repository emits an issue, pull request, review, merge, or exact mention event."],
  ["02", "Evidence", "The central runtime loads bounded GitHub API evidence and treats repository text as untrusted data."],
  ["03", "Decision", "A model may propose a typed result; deterministic policy validates permission, scope, and idempotency."],
  ["04", "Action", "Only an allowlisted project-management mutation or disclosed public comment may be published."],
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="kicker"><CircleDot size={13} /> ELIXPOO V2 · OPEN SOURCE</span>
          <h1>One agent for the<br /><em>project around the code.</em></h1>
          <p>{SITE_DESCRIPTION}</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/docs">Read the directive <ArrowRight size={16} /></Link>
            <a className="button button-secondary" href="https://github.com/elixpo/agent.elixpo" target="_blank" rel="noreferrer"><Github size={16} /> View source <ArrowUpRight size={14} /></a>
          </div>
          <div className="hero-proof"><span><Check size={13} /> Versioned reusable workflows</span><span><Check size={13} /> Deterministic authorization</span><span><Check size={13} /> No product-code mutation</span></div>
        </div>
        <div className="protocol-graphic" aria-label="Repository events routed through the central Elixpoo policy boundary">
          <div className="graphic-grid" />
          <span className="graphic-label graphic-label-in">REPOSITORY EVENTS</span>
          <span className="graphic-label graphic-label-out">BOUNDED ACTIONS</span>
          <div className="graphic-node node-event"><Github size={21} /><small>event</small></div>
          <div className="graphic-line line-one"><i /></div>
          <div className="graphic-core">
            <span className="graphic-logo-shell">
              <Image className="graphic-logo" src="/logo.png" width={104} height={104} alt="Elixpoo panda agent" priority />
              <i className="graphic-orbit graphic-orbit-one" />
              <i className="graphic-orbit graphic-orbit-two" />
            </span>
            <strong>ELIXPOO</strong><small>v2 central policy runtime</small>
          </div>
          <div className="graphic-line line-two"><i /></div>
          <div className="graphic-node node-action"><ShieldCheck size={21} /><small>action</small></div>
          <div className="graphic-boundary">typed schema · allowlist · idempotency · safety</div>
        </div>
      </section>

      <section className="definition-band">
        <div className="shell definition-grid">
          <div><small>THE DIRECTIVE</small><h2>Manage the record.<br />Never become the coder.</h2></div>
          <p>Elixpoo exists to keep issues, pull requests, Projects, Discussions, and merged-change memory consistent across Elixpo repositories. The boundary is intentional: it cannot edit product source, create solution branches, or submit implementation pull requests.</p>
        </div>
      </section>

      <section className="section shell" id="capabilities">
        <div className="section-heading"><span>01 / CAPABILITIES</span><h2>Small surface.<br />Clear authority.</h2><p>Four distributed callers share one reviewed runtime and one policy contract.</p></div>
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}><span className="card-index">0{index + 1}</span><Icon size={25} /><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="protocol">
        <div className="shell">
          <div className="section-heading section-heading-light"><span>02 / PROTOCOL</span><h2>Evidence enters.<br />Policy owns the exit.</h2><p>Model output is never authority. Every mutation crosses a deterministic boundary.</p></div>
          <div className="protocol-list">
            {protocol.map(([number, title, copy]) => <article key={number}><b>{number}</b><span><h3>{title}</h3><p>{copy}</p></span><ArrowRight size={20} /></article>)}
          </div>
          <div className="trust-strip"><ShieldCheck size={21} /><strong>Repository content is evidence, not instruction.</strong><span>Secret-shaped text is redacted. Public model-authored text passes the safety route and carries an operation marker.</span></div>
        </div>
      </section>

      <section className="section shell" id="distribution">
        <div className="distribution-grid">
          <div className="section-heading"><span>03 / DISTRIBUTION</span><h2>Thin in every repo.<br />Central by design.</h2><p>Participating repositories contain only event callers. Implementation, policy, model routing, and upgrades stay in this control repository under the rolling <code>v2</code> reference.</p><Link className="text-link" href="/docs#deployment">Deployment contract <ArrowRight size={15} /></Link></div>
          <div className="distribution-map">
            <div className="satellite"><PanelsTopLeft /><span><strong>Repository A</strong><small>four caller workflows</small></span></div>
            <div className="satellite"><PanelsTopLeft /><span><strong>Repository B</strong><small>four caller workflows</small></span></div>
            <div className="satellite"><PanelsTopLeft /><span><strong>Repository N</strong><small>four caller workflows</small></span></div>
            <div className="map-spine"><i /><i /><i /></div>
            <div className="runtime-box"><Workflow /><span><small>PINNED RUNTIME</small><strong>elixpo/agent.elixpo@v2</strong></span></div>
          </div>
        </div>
      </section>

      <section className="section shell boundary-section">
        <div className="boundary-card boundary-yes"><Check /><span><small>SUPPORTED</small><h3>Project-management work</h3><p>Labels, Project fields, exact mention answers, comment-only reviews, Discussions, and merge memory.</p></span></div>
        <div className="boundary-card boundary-no"><X /><span><small>OUT OF SCOPE</small><h3>Product-code work</h3><p>No repository checkout, source edit, solution commit, implementation branch, or autonomous code-solving pull request.</p></span></div>
      </section>

      <section className="cta shell">
        <div><span><Braces size={18} /> PUBLIC CONTRACT</span><h2>Inspect the boundary.<br />Adopt the callers.</h2></div>
        <div><Link className="button button-primary" href="/docs"><BookOpen size={16} /> Open documentation</Link><a className="button button-secondary" href="https://github.com/elixpo/agent.elixpo/tree/v2/distribution/workflows" target="_blank" rel="noreferrer">Browse workflows <ArrowUpRight size={14} /></a></div>
      </section>

      <footer className="site-footer shell"><span>Elixpoo v2 · Elixpo</span><span>Open source under MIT · <a href="https://github.com/elixpo/agent.elixpo">GitHub</a></span></footer>
    </main>
  );
}
