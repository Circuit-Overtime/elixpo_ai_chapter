import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Scale,
} from "lucide-react";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "About Elixpo — an open-source project foundry",
  description:
    "Learn why Elixpo exists, how public Chapters help active open-source work reach a release, what maintainers and contributors receive, and how custody, credit, licensing, and continuity work.",
  path: "/about",
});

const chapterStages = [
  ["01", "Frame", "Agree on one release-sized objective, its boundaries, evidence, and accountable maintainers."],
  ["02", "Prepare", "Document the project, open useful contribution paths, and name who can review the work."],
  ["03", "Build", "Develop in public, record decisions, review contributions, and keep the outcome in view."],
  ["04", "Release", "Publish the software, research, hardware, or infrastructure with usable documentation."],
  ["05", "Record", "Preserve status, attribution, artifacts, decisions, and custody as a durable public record."],
] as const;

const relationships = [
  {
    label: "Elixpo-originated",
    title: "Core projects",
    text: "Software and services created or operated as part of Elixpo. Each repository still publishes its own lifecycle, maintainers, license, and support boundary.",
  },
  {
    label: "Time-bounded",
    title: "Chapter participants",
    text: "Projects working toward a defined public outcome. Participation does not require repository transfer and ends with a release or documented result.",
  },
  {
    label: "Independently led",
    title: "Member Projects",
    text: "Projects with an ongoing relationship to Elixpo whose original maintainers keep visible authority. Membership is earned through real collaboration, not a listing fee.",
  },
  {
    label: "Evidence-led",
    title: "Research projects",
    text: "Experiments, papers, models, datasets, and hardware records published with honest maturity, review, license, and reproducibility information.",
  },
] as const;

const questions = [
  {
    question: "Why would a maintainer build with Elixpo?",
    answer:
      "To turn a concrete roadmap into prepared public work with clearer contribution paths, accountable review, coordinated discovery, a release narrative, and a durable record of the people and decisions behind it.",
  },
  {
    question: "Does Elixpo require a repository transfer?",
    answer:
      "No. A project can participate in a Chapter while remaining under its existing owner. If a repository is transferred, the custody record changes, but authorship, copyright, licensing, and maintainer authority do not silently change with it.",
  },
  {
    question: "Does Elixpo provide hosting, funding, or permanent maintenance?",
    answer:
      "Not as an organization-wide promise. Individual public services may be operated by Elixpo, but the foundry itself provides coordination, standards, publication, discovery, attribution, and continuity records—not guaranteed compute, funding, uptime, or indefinite maintenance.",
  },
  {
    question: "Is Elixpo a home for abandoned repositories?",
    answer:
      "No. Chapters begin with active ownership and a meaningful next outcome. Paused, completed, and archived work remains visible because honest history is useful, but it is never presented as currently supported work.",
  },
] as const;

export default function AboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": "https://elixpo.com/about#page",
        name: "About Elixpo",
        url: "https://elixpo.com/about",
        description: metadata.description,
        about: { "@id": "https://elixpo.com/#organization" },
      },
      {
        "@type": "Organization",
        "@id": "https://elixpo.com/#organization",
        name: "Elixpo",
        url: "https://elixpo.com",
        description:
          "An open-source project foundry for active software, open research, public services, and attributable releases.",
        foundingDate: "2023",
        sameAs: ["https://github.com/elixpo"],
      },
      {
        "@type": "FAQPage",
        mainEntity: questions.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <main className="about-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <header className="about-hero">
        <div className="about-hero-geometry" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="about-hero-copy">
          <p className="eyebrow">About Elixpo / established 2023</p>
          <h1>
            Open work needs more than <em>a repository.</em>
          </h1>
          <p className="lede">
            Elixpo is an open-source project foundry. We bring maintainers and
            contributors together around active software, open research, and
            public services, then help that work reach a clear, attributable
            release.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/projects">
              Explore the work <ArrowRight size={16} />
            </Link>
            <Link className="button secondary" href="/contributing">
              Build with Elixpo
            </Link>
          </div>
        </div>
        <aside className="about-definition">
          <span>ELIXPO / DEFINITION</span>
          <strong>Open-source<br />project foundry</strong>
          <p>
            A public system for framing work, preparing contributions,
            reviewing responsibly, releasing clearly, and preserving who made
            the outcome possible.
          </p>
        </aside>
      </header>

      <section className="about-premise section-wrap">
        <div className="about-premise-heading">
          <p className="eyebrow">Why Elixpo exists</p>
          <h2>Publishing code is the beginning, not the finish.</h2>
        </div>
        <div className="about-premise-body">
          <figure className="about-premise-artifact">
            <Image src="/brand/diagrams/elixpo-ecosystem.svg" alt="Diagram showing open projects moving through an Elixpo Chapter into a public release and durable record" width={1200} height={560} sizes="(max-width: 900px) 100vw, 62vw" />
            <figcaption><span>PUBLIC SYSTEM / VERIFIED ARTIFACT</span><Link href="/architecture">Explore the architecture <ArrowRight size={14}/></Link></figcaption>
          </figure>
          <div className="about-premise-copy">
            <p>
              Useful open-source work often stalls between “the code exists” and
              “people can understand, trust, contribute to, and cite it.” A public
              repository provides storage and collaboration tools, but it does not
              automatically provide a shared objective, prepared work, responsive
              review, accurate status, or a coherent release.
            </p>
            <p>
              Elixpo works on that missing distance. It creates a bounded frame
              around the next meaningful outcome and connects the repository to
              its documentation, research, packages, contributors, decisions, and
              history. The result is easier to discover because it is easier to
              understand.
            </p>
          </div>
        </div>
      </section>

      <section className="about-value section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">The practical value</p><h2>What people receive.</h2></div>
          <p>Elixpo does not replace the people who understand a project. It makes their work easier to enter, finish, explain, and carry forward.</p>
        </div>
        <div className="about-grid">
          <article><span>FOR MAINTAINERS</span><h3>A finishable public objective</h3><p>A release-sized scope, prepared contribution paths, named review responsibility, lifecycle clarity, and a public story that connects every artifact.</p></article>
          <article><span>FOR CONTRIBUTORS</span><h3>Work that leads somewhere</h3><p>A clear outcome, an accountable reviewer, visible decisions, and durable credit connected to the released work—not an isolated commit count.</p></article>
          <article><span>FOR THE PUBLIC</span><h3>A record that can be trusted</h3><p>One place to inspect what is active, paused, completed, or archived and follow the code, research, packages, services, people, and evidence.</p></article>
        </div>
      </section>

      <section className="about-chapter">
        <div className="section-wrap">
          <div className="section-heading split">
            <div><p className="eyebrow">The operating unit</p><h2>An Elixpo Chapter has an end condition.</h2></div>
            <p>A Chapter is a time-bounded period of public work. It is neither a permanent ownership claim nor a vague promise to maintain a project forever.</p>
          </div>
          <ol className="about-chapter-stages">
            {chapterStages.map(([number, title, text]) => (
              <li key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></li>
            ))}
          </ol>
          <Link className="text-link about-chapter-link" href="/chapter">Read the Chapter model <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="about-relationships section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">How work relates to Elixpo</p><h2>One commons. Different responsibilities.</h2></div>
          <p>Relationship, lifecycle, custody, and license are recorded as separate facts. Being visible through Elixpo never silently changes who authored, owns, maintains, or may reuse a project.</p>
        </div>
        <div className="about-relationship-grid">
          {relationships.map((relationship, index) => (
            <article key={relationship.title}>
              <span>{String(index + 1).padStart(2, "0")} / {relationship.label}</span>
              <h3>{relationship.title}</h3>
              <p>{relationship.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-custody section-wrap">
        <div className="about-custody-symbol" aria-hidden="true"><Scale size={42} /></div>
        <div><p className="eyebrow">Custody without erasure</p><h2>A transfer changes administration, not authorship.</h2></div>
        <div>
          <p>Repository transfer is optional. A project may remain with its current owner while participating in a Chapter. When a maintainer chooses organization custody, the original author can retain documented project authority and normal administrative access.</p>
          <p>Existing copyright and licenses remain in force. Elixpo does not silently relicense contributor work, absorb a project’s identity, or turn organization membership into ownership. The public registry records the actual relationship and names the evidence behind it.</p>
          <Link className="text-link" href="/architecture">See the responsibility model <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="about-continuity section-wrap">
        <div className="about-continuity-card">
          <p className="eyebrow">The durable layer</p>
          <h2>Continuity is a system, not a slogan.</h2>
          <p>Elixpo cannot guarantee that every maintainer, service, or project will continue forever. It can make change legible. The canonical registry, repository standard, project dossiers, custody records, licensing evidence, contributor records, release narratives, and lifecycle history remain useful when people or priorities change.</p>
          <div className="about-continuity-links"><Link href="/history">History</Link><Link href="/contributors">Contributor records</Link><Link href="/research">Research</Link><Link href="/packages">Packages</Link></div>
        </div>
        <div className="about-boundaries">
          <p className="eyebrow">What Elixpo is not</p>
          <ul>
            <li><span>01</span>A SaaS portfolio assembled around growth claims.</li>
            <li><span>02</span>A directory that accepts projects only to display them.</li>
            <li><span>03</span>A graveyard that presents abandoned work as active.</li>
            <li><span>04</span>A certification authority for projects or contributors.</li>
            <li><span>05</span>A guarantee of hosting, funding, uptime, or permanent maintenance.</li>
          </ul>
        </div>
      </section>

      <section className="about-faq section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">Direct answers</p><h2>The questions that matter.</h2></div>
          <p>The model should be understandable before anyone contributes code, moves a repository, or attaches their name to the work.</p>
        </div>
        <div className="about-faq-list">
          {questions.map(({ question, answer }, index) => (
            <article key={question}><span>{String(index + 1).padStart(2, "0")}</span><h3>{question}</h3><p>{answer}</p></article>
          ))}
        </div>
      </section>

      <section className="about-closing section-wrap">
        <p className="eyebrow">Start with the work</p>
        <h2>Bring a real artifact, an accountable maintainer, and a meaningful next release.</h2>
        <p>Begin in the public discussion forum. Describe what exists, what the next outcome should be, who can review contributions, and what evidence will show that the Chapter is complete. A discussion is a starting point, not automatic acceptance or a request to transfer a repository.</p>
        <div className="hero-actions">
          <a className="button primary" href="https://github.com/orgs/elixpo/discussions" target="_blank" rel="noreferrer">Open a discussion <ArrowUpRight size={16} /></a>
          <Link className="button secondary" href="/contributing">Read the contribution routes</Link>
        </div>
      </section>
    </main>
  );
}
