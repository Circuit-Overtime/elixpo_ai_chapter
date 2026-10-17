import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import contributors from "../../content/contributors.json";
import history from "../../content/history.json";
import people from "../../content/people.json";
import { DIRECTORY_ENTRIES, familyPath, getDirectoryEntries } from "@/lib/directory";
import { ELIXPO_PACKAGES } from "@/lib/packages";
import { ProjectMark } from "@/components/ProjectMark";

const featured = ["blogs", "lixsketch", "oreo", "oreolook", "kareixo", "lixrl"]
  .map((slug) => DIRECTORY_ENTRIES.find((entry) => entry.slug === slug))
  .filter((entry): entry is (typeof DIRECTORY_ENTRIES)[number] => Boolean(entry));
const leadDevelopers = people.currentTeam;
const leadHandles = new Set(leadDevelopers.map((person) => person.handle.toLowerCase()));
const featuredContributors = [...contributors.featured]
  .filter((person) => !leadHandles.has(person.handle.toLowerCase()))
  .sort((a, b) => b.observedContributions - a.observedContributions)
  .slice(0, 10);
const counts = {
  project: getDirectoryEntries("project").length,
  research: getDirectoryEntries("research").length,
  service: getDirectoryEntries("service").length,
};
const yearsSinceFounded = new Date().getUTCFullYear() - 2023;

export function StoryHome() {
  return (
    <main className="story-home">
      <section className="story-hero">
        <div className="hero-field" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className="hero-copy">
          <div className="hero-copy-main">
            <p className="eyebrow">Elixpo · open-source project foundry</p>
            <h1>Open work should reach a <em>clear public release.</em></h1>
            <p className="hero-lede">Elixpo brings maintainers and contributors together around active software, research, and public services. We prepare contribution paths, document decisions, publish releases, and preserve who did the work.</p>
            <div className="hero-actions">
              <Link className="button primary" href="/projects">Browse the projects <ArrowRight size={16} /></Link>
              <Link className="button secondary" href="/about">How Elixpo works</Link>
            </div>
            <div className="hero-data" aria-label="Elixpo public directory summary">
              <dl>
                <div><dd>{counts.project}</dd><dt>Project records</dt></div>
                <div><dd>{counts.research}</dd><dt>Research records</dt></div>
                <div><dd>{counts.service}</dd><dt>Public services</dt></div>
              </dl>
              <p><span>EST.</span> Building in public since 2023</p>
            </div>
          </div>
        </div>
        <aside className="hero-tenure" aria-label={`${yearsSinceFounded} years of Elixpo since 2023`}>
          <span>OPEN SINCE</span>
          <strong>{yearsSinceFounded}<sup>+</sup></strong>
          <p>years of projects, research, releases, and public engineering since 2023</p>
        </aside>
      </section>

      <section className="story-statement section-wrap">
        <p className="eyebrow">Why Elixpo exists</p>
        <h2>Elixpo helps open-source work become easier to understand, contribute to, and release.</h2>
        <div className="statement-layout">
          <figure className="statement-visual">
            <Image src="/brand/illustrations/open-source-release-path.webp" alt="Elixpo mascot connecting source code, contributors, review, packaging, and a public release" width={1670} height={940} sizes="(max-width: 900px) 100vw, 68vw" />
          </figure>
          <div className="statement-grid">
            <p><strong>A repository is the beginning.</strong> Publishing code does not automatically provide clear documentation, prepared contribution paths, accountable review, or a release that people can use and cite. Elixpo coordinates that work with project maintainers.</p>
            <p><strong>A Chapter gives the work a boundary.</strong> Each Elixpo Chapter has a specific goal, named responsibilities, an expected release, and a permanent contribution record.</p>
          </div>
        </div>
        <div className="lead-developers">
          <div className="lead-developers-heading"><p className="eyebrow">Lead developers</p><h3>The people responsible for Elixpo’s current technical direction.</h3><p>Lead status is shown separately from contributor recognition. These profiles describe ongoing responsibility rather than ranking leads against community contributors.</p></div>
          <div className="lead-developer-grid">
            {leadDevelopers.map((person, index) => <a href={`https://github.com/${person.handle}`} target="_blank" rel="noreferrer" key={person.handle} className={`lead-developer lead-developer-${index + 1}`}>
              <div className="lead-developer-art" aria-hidden="true"><span>{String(index + 1).padStart(2,"0")}</span><i/><i/><Image src={`https://github.com/${person.handle}.png`} alt="" width={128} height={128} unoptimized /></div>
              <div className="lead-developer-copy"><p className="eyebrow">{person.role}</p><h4>{person.name}</h4><p>{person.summary}</p><b>@{person.handle} <ArrowUpRight size={14}/></b></div>
            </a>)}
          </div>
          <Link className="text-link" href="/people">See roles, evidence, and record boundaries <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="chapter-flow section-wrap">
        <div className="section-heading">
          <p className="eyebrow">The Chapter process</p>
          <h2>Each Chapter follows a documented four-stage process.</h2>
        </div>
        <ol>
          <li><span>01</span><h3>Set the scope</h3><p>The maintainers define a release-sized goal, the evidence it needs, and the tasks that are ready for contributors.</p></li>
          <li><span>02</span><h3>Develop in public</h3><p>Maintainers and contributors discuss decisions, review changes, and track progress in the open.</p></li>
          <li><span>03</span><h3>Publish the release</h3><p>The project publishes its software, research, hardware, or infrastructure with the documentation required to use it.</p></li>
          <li><span>04</span><h3>Preserve the record</h3><p>Elixpo records the release, its status, important decisions, and the people who contributed to it.</p></li>
        </ol>
        <Link className="text-link" href="/chapter">Learn how the Chapter works <ArrowRight size={15} /></Link>
      </section>

      <section className="chapter-feature">
        <div className="chapter-feature-field" aria-hidden="true"><span /><span /><span /></div>
        <div className="chapter-feature-copy">
          <p className="eyebrow">The Elixpo Chapter</p>
          <h2>The Elixpo Chapter coordinates <em>shared releases.</em></h2>
          <p>The Chapter repository contains the shared process, active release work, contribution paths, public decisions, and attribution records used across Elixpo. It is maintained separately from the project directory because it supports every category of work.</p>
          <Link className="button chapter-button" href="/chapter">Read about the Chapter <ArrowRight size={16} /></Link>
        </div>
        <div className="chapter-feature-index" aria-label="Chapter stages">
          <span><b>01</b> Frame</span><span><b>02</b> Build</span><span><b>03</b> Release</span><span><b>04</b> Record</span>
        </div>
      </section>

      <section className="families section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">The public directory</p><h2>Browse Elixpo’s work by category.</h2></div>
          <p>Projects, research, and operated services have different responsibilities. Every directory entry therefore identifies its lifecycle, stewardship relationship, source repository, and available evidence.</p>
        </div>
        <div className="family-grid">
          <Link href="/projects"><span>01 / {counts.project} records</span><h3>Projects</h3><p>Software, libraries, hardware, packages, and creative tools people can inspect and extend.</p><b>Open directory <ArrowRight size={16} /></b></Link>
          <Link href="/research"><span>02 / {counts.research} records</span><h3>Research</h3><p>Papers, experiments, models, and reproducibility artifacts with explicit research status.</p><b>Open directory <ArrowRight size={16} /></b></Link>
          <Link href="/services"><span>03 / {counts.service} records</span><h3>Services</h3><p>Hosted public systems Elixpo actively operates, with a distinct operational responsibility.</p><b>Open directory <ArrowRight size={16} /></b></Link>
        </div>
      </section>

      <section className="featured-work section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">Featured work</p><h2>Explore current work from across Elixpo.</h2></div>
          <Link className="text-link" href="/projects">View the complete directory <ArrowRight size={15} /></Link>
        </div>
        <div className="featured-grid">
          {featured.map((entry) => (
            <Link key={`${entry.family}-${entry.slug}`} href={`${familyPath(entry.family)}/${entry.slug}`} className="featured-card">
              <div><ProjectMark seed={entry.slug} icon={entry.icon} /><span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span></div>
              <p className="eyebrow">{entry.family} · {entry.relationship}</p>
              <h3>{entry.name}</h3>
              <p>{entry.summary}</p>
              <b>View project details <ArrowRight size={15} /></b>
            </Link>
          ))}
        </div>
      </section>

      <section className="release-surfaces section-wrap">
        <div className="section-heading split"><div><p className="eyebrow">Research and distribution</p><h2>Research and package releases have dedicated indexes.</h2></div><p>The main portal provides an overview of the organization. The research and package sections provide the citations, reproducibility records, installation instructions, and distribution details required for those outputs.</p></div>
        <div className="surface-grid">
          <Link href="/research"><span>Research index</span><h3>Review papers, experiments, and supporting evidence.</h3><p>The research directory connects each project to its repository, released artifacts, lifecycle, and available reproducibility evidence.</p><b>Browse the research index <ArrowRight size={15}/></b></Link>
          <Link href="/packages"><span>Linux distribution</span><h3>Install packages released by Elixpo projects.</h3><p>The package directory explains the maintained applications, signed APT source, supported systems, releases, and installation options.</p><b>Explore Elixpo Packages <ArrowRight size={15}/></b></Link>
        </div>
        <div className="npm-preview">
          {ELIXPO_PACKAGES.slice(0,3).map(item=><a key={item.name} href={item.href} target="_blank" rel="noreferrer"><span className="npm-mark">npm</span><div><strong>{item.name}</strong><small>{item.type}</small></div><ArrowUpRight size={14}/></a>)}
        </div>
        <Link className="text-link" href="/packages#developer-package-index">Browse the npm package index <ArrowRight size={15}/></Link>
      </section>

      <section className="people-preview section-wrap">
        <div className="section-heading split">
          <div><p className="eyebrow">Contributor recognition</p><h2>Contributor records explain who worked on each release.</h2></div>
          <p>Recognition is based on repository evidence, excludes declared project leads and automation, and describes the period and type of work rather than presenting a contribution count without context.</p>
        </div>
        <div className="people-rail" role="list" aria-label="Ten featured non-lead Elixpo contributors" tabIndex={0}>
          {featuredContributors.map((person, index) => (
            <article key={person.handle} role="listitem">
              <span className="contributor-position">{String(index + 1).padStart(2,"0")}</span>
              <a href={person.github} target="_blank" rel="noreferrer"><Image src={`https://github.com/${person.handle}.png`} alt={`${person.name} on GitHub`} width={72} height={72} unoptimized /></a>
              <p className="eyebrow">{person.activeWindow}</p>
              <h3>{person.name}</h3>
              <p>{person.story}</p>
              <div>{person.portfolio && <a href={person.portfolio} target="_blank" rel="noreferrer">Portfolio <ArrowUpRight size={13} /></a>}<a href={person.github} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a></div>
            </article>
          ))}
        </div>
        <Link className="text-link" href="/contributors">See the evidence and method <ArrowRight size={15} /></Link>
      </section>

      <section className="history-preview section-wrap">
        <div className="section-heading"><p className="eyebrow">Organization history</p><h2>Elixpo documents how the organization and its projects have changed.</h2></div>
        <div className="timeline-strip">
          {history.entries.slice(0, 4).map((item) => <article key={item.period}><span>{item.period}</span><h3>{item.title}</h3><p>{item.description}</p></article>)}
        </div>
        <Link className="text-link" href="/history">Read the full history <ArrowRight size={15} /></Link>
      </section>

      <section className="closing-panel section-wrap">
        <div><p className="eyebrow">Propose a project</p><h2>Start an Elixpo Chapter for active open-source work.</h2></div>
        <div><p>Read the public standards and open a discussion with the maintainers. A repository can remain under its current owner; transfer to the Elixpo organization is only one available stewardship arrangement.</p><Link className="button primary" href="/contributing">Read the contribution process <ArrowRight size={16} /></Link></div>
      </section>
    </main>
  );
}
