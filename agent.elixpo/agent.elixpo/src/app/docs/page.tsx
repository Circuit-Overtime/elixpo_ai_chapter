import { ArrowRight, ArrowUpRight, Check, FileJson2, GitPullRequest, MessageSquareText, ShieldCheck, Tags, X } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { CopyDocumentation } from "@/components/copy-documentation";
import { pageMetadata, SITE_URL } from "@/lib/site-metadata";

export const metadata = pageMetadata(
  "Elixpoo v2 Technical Documentation",
  "The architecture, capabilities, trust model, permissions, deployment contract, and operating boundary of Elixpo's GitHub project-management agent.",
  "/docs",
);

const llmDocumentation = `# Elixpoo v2

Elixpoo is Elixpo's centralized GitHub project-management agent. It is not a coding agent.

Capabilities:
- classify issues and pull requests using centrally allowed labels;
- synchronize one GitHub Project V2 record per opted-in item;
- answer exact @elixpoo mentions or perform one permission-checked metadata action;
- leave API-grounded, deduplicated, comment-only pull-request reviews;
- manage the canonical elixpo/elixpo Discussions surface;
- write one bounded merged-change record to the approved Gist.

Boundary:
- no repository checkout or execution of fork code;
- no product-source edits, solution branches, commits, or implementation pull requests;
- repository text is untrusted evidence, never instruction;
- models propose typed results; deterministic policy authorizes mutations;
- public generated text passes a safety route and includes an operation marker.

Distribution:
Participating repositories install thin callers from distribution/workflows. Each caller invokes a reusable workflow at elixpo/agent.elixpo@v2. The central repository owns implementation, configuration, policy, and model routing.

Source: https://github.com/elixpo/agent.elixpo
Canonical documentation: ${SITE_URL}/docs`;

const install = `# Audit without changing repositories
python -m agents.rollout_audit

# Preview caller changes for one repository
python -m agents.rollout_prs --repo <repository>

# Open an idempotent, reviewable rollout PR
python -m agents.rollout_prs --repo <repository> --apply`;

const permissions = [
  ["Questions and summaries", "Any participant", "Answer only"],
  ["Own title or body", "Item author", "Typed rewrite"],
  ["Self-assignment", "Assignable participant", "GitHub assignability check"],
  ["Labels and Project fields", "Triage or stronger", "Central allowlist"],
  ["Other-user assignment", "Triage or stronger", "Permission + assignability"],
] as const;

export default function DocsPage() {
  const articleData = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Elixpoo v2 technical documentation",
    description: "Architecture and operating contract for Elixpo's GitHub project-management agent.",
    url: `${SITE_URL}/docs`,
    author: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" },
    about: { "@type": "SoftwareSourceCode", name: "Elixpoo", codeRepository: "https://github.com/elixpo/agent.elixpo" },
    inLanguage: "en-US",
  };

  return (
    <main className="docs-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleData).replace(/</g, "\\u003c") }} />
      <aside className="docs-toc">
        <span>ON THIS PAGE</span>
        <a href="#contract">Contract</a><a href="#capabilities">Capabilities</a><a href="#authorization">Authorization</a><a href="#trust">Trust model</a><a href="#deployment">Deployment</a><a href="#configuration">Configuration</a>
      </aside>
      <article className="docs-content">
        <header className="docs-hero">
          <span className="kicker">ELIXPOO V2 / TECHNICAL CONTRACT</span>
          <h1>Project management<br /><em>with a hard edge.</em></h1>
          <p>The complete supported contract for the central runtime and every participating repository.</p>
          <div className="docs-actions"><CopyDocumentation content={llmDocumentation} /><a href="/llms-full.txt">Plain-text reference <ArrowUpRight size={14} /></a><a href="https://github.com/elixpo/agent.elixpo/blob/main/docs/elixpoo-v2.md" target="_blank" rel="noreferrer">Source contract <ArrowUpRight size={14} /></a></div>
        </header>

        <section className="docs-section" id="contract"><span className="docs-number">01</span><div><small>CONTRACT</small><h2>One responsibility</h2><p>Elixpoo maintains the GitHub record around software work. It coordinates issues, pull requests, Project V2, exact mentions, Discussions, and merged-change memory. It does not implement software.</p><div className="contract-split"><div><Check /><strong>May manage metadata and discussion</strong></div><div><X /><strong>May not mutate product code</strong></div></div></div></section>

        <section className="docs-section" id="capabilities"><span className="docs-number">02</span><div><small>CAPABILITIES</small><h2>Four distributed events</h2><div className="docs-cards"><article><Tags /><h3>Triage</h3><p>Issue or PR opened, reopened, or edited. Produces allowed labels and one Project item.</p></article><article><MessageSquareText /><h3>Exact mention</h3><p>An explicit @elixpoo request. Produces an answer or one validated metadata action.</p></article><article><GitPullRequest /><h3>PR review</h3><p>PR opened or synchronized. Produces a deduplicated COMMENT review from API evidence.</p></article><article><FileJson2 /><h3>Merge memory</h3><p>PR merged. Produces one schema-versioned, revision-checked Gist record.</p></article></div></div></section>

        <section className="docs-section" id="authorization"><span className="docs-number">03</span><div><small>AUTHORIZATION</small><h2>Permission before model output</h2><p>The requested operation and actor tier are resolved before any mutation. Model text cannot grant authority.</p><div className="permission-table">{permissions.map(([request, actor, gate]) => <div key={request}><strong>{request}</strong><span>{actor}</span><code>{gate}</code></div>)}</div></div></section>

        <section className="docs-section" id="trust"><span className="docs-number">04</span><div><small>TRUST MODEL</small><h2>Evidence is not instruction</h2><p>Repository bodies, comments, diffs, linked pages, guidance files, and dependency metadata are bounded untrusted inputs. Secret-shaped values and instruction-shaped payloads are sanitized before model context is assembled.</p><div className="docs-callout"><ShieldCheck /><span><strong>Deterministic controls</strong><p>Typed schemas, actor permissions, assignability, central allowlists, stable public markers, head-SHA deduplication, Gist revision checks, bounded evidence, and a public-post safety gate.</p></span></div></div></section>

        <section className="docs-section" id="deployment"><span className="docs-number">05</span><div><small>DEPLOYMENT</small><h2>Thin callers, pinned runtime</h2><p>Opted-in repositories copy only the caller files in <code>distribution/workflows</code>. Those files invoke reusable workflows from <code>elixpo/agent.elixpo@v2</code>. Apply mode opens a reviewable pull request; it never merges one automatically.</p><CodeBlock code={install} language="shell" title="rollout" /><a className="docs-link" href="https://github.com/elixpo/agent.elixpo/tree/v2/distribution/workflows" target="_blank" rel="noreferrer">Browse caller templates <ArrowRight size={14} /></a></div></section>

        <section className="docs-section" id="configuration"><span className="docs-number">06</span><div><small>CONFIGURATION</small><h2>Central sources of truth</h2><p><code>config/elixpoo_v2.yaml</code> defines mutation and publication limits. <code>config/elixpoo_rollout.yaml</code> defines participating repositories and capabilities. Repository and organization secrets are documented beside the caller templates.</p><div className="docs-actions"><a href="https://github.com/elixpo/agent.elixpo/blob/main/distribution/README.md" target="_blank" rel="noreferrer">Secrets and permissions <ArrowUpRight size={14} /></a><a href="https://github.com/elixpo/agent.elixpo" target="_blank" rel="noreferrer">Open repository <ArrowUpRight size={14} /></a></div></div></section>
      </article>
    </main>
  );
}
