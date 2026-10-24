import { getPersonContent } from "@/lib/content";
import { buildMemberProfileJsonLd } from "@/lib/seo";

function safeGet(person, file, fallback = null) {
  try {
    const res = getPersonContent(person, file);
    return res != null ? res : fallback;
  } catch {
    return fallback;
  }
}

const Arrow = () => <span aria-hidden="true">↗</span>;

export default async function HomePage({ params }) {
  const { person } = await params;
  const profile = safeGet(person, "profile", {});
  const home = safeGet(person, "home", {});
  const projects = safeGet(person, "projects", { projects: [] }).projects || [];
  const publications = safeGet(person, "publications", { papers: [] }).papers || [];
  const talks = safeGet(person, "talks", { sessions: [] }).sessions || [];
  const work = safeGet(person, "work", []) || [];
  const profileJsonLd = buildMemberProfileJsonLd(person);
  const hero = home.hero || {};
  const portrait = hero.portrait || `/assets/${person}/about/landing-card.webp`;
  const chapterLabels = {
    About: ["Origin", "Background, experience, and the direction behind the work."],
    Projects: ["Build", "Systems, repositories, and projects that can be inspected."],
    Publications: ["Research", "Questions, papers, and evidence behind the practice."],
    Blogs: ["Write", "Notes that preserve decisions, lessons, and useful context."],
    Talks: ["Share", "Public sessions shaped by work already done."],
    Connect: ["Continue", "Verified channels for the next conversation."],
  };
  const chapters = (profile.menuItems || [])
    .filter((item) => chapterLabels[item])
    .map((item, chapterIndex) => {
      const [label, description] = chapterLabels[item];
      return { item, href: item.toLowerCase(), index: String(chapterIndex + 1).padStart(2, "0"), label, description };
    });
  const directions = home.directions || [
    {
      index: "01",
      label: "Build",
      title: "Projects and systems",
      description: home.intro?.description || profile.siteDescription,
      href: "projects",
    },
    {
      index: "02",
      label: "Study",
      title: "Research and writing",
      description: "Public work is connected to the evidence, decisions, and learning behind it.",
      href: publications.length ? "publications" : "about",
    },
    {
      index: "03",
      label: "Share",
      title: "Community and communication",
      description: "Technical work becomes more useful when other people can understand and continue it.",
      href: talks.length ? "talks" : "about",
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c") }} />

      <section className="member-home-hero">
        <div className="portfolio-geometry" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="member-home-copy">
          <p className="portfolio-eyebrow">{(hero.focusTags || []).join(" · ") || "Elixpo member portfolio"}</p>
          <h1>{profile.name || profile.siteName}</h1>
          <h2>{hero.headline || profile.siteDescription}</h2>
          <p>{hero.intro || home.intro?.description}</p>
          <div className="portfolio-actions">
            <a className="portfolio-button portfolio-button-dark" href={`/${person}/projects`}>Explore the work <Arrow /></a>
            <a className="portfolio-button portfolio-button-outline" href={`/${person}/about`}>Read the story</a>
          </div>
          <div className="member-credentials">
            {(hero.credentials || []).map((credential) => (
              <div key={`${credential.label}-${credential.org}`}>
                <strong>{credential.label}</strong>
                <span>{credential.org}</span>
              </div>
            ))}
          </div>
        </div>

        <figure className="member-home-portrait">
            <div className="member-home-portrait-field" />
            <img src={portrait} alt={`Portrait of ${profile.name || profile.siteName}`} fetchPriority="high" />
            <figcaption><span>Current direction</span><strong>{profile.siteDescription}</strong></figcaption>
        </figure>
      </section>

      {chapters.length > 0 && (
        <nav className="member-storyline" aria-label={`${profile.siteName} portfolio chapters`}>
          <div className="member-storyline-intro">
            <p className="portfolio-eyebrow">Portfolio storyline</p>
            <h2>Follow the work from <em>origin to impact.</em></h2>
          </div>
          <ol>
            {chapters.map(({ item, href, index, label, description }) => (
              <li key={item}>
                <a href={`/${person}/${href}`}>
                  <span>{index}</span>
                  <strong>{label}</strong>
                  <p>{description}</p>
                  <b aria-hidden="true">↗</b>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <section className="portfolio-section direction-section">
        <div className="portfolio-section-heading">
          <div>
            <p className="portfolio-eyebrow">One practice, three connected lanes</p>
            <h2>The work is organized by <em>what it proves.</em></h2>
          </div>
          <p>{home.techSection?.description || "Projects, research, and public communication are kept connected to their source and evidence."}</p>
        </div>
        <div className="direction-grid">
          {directions.map((direction, index) => (
            <a href={`/${person}/${direction.href}`} key={direction.title}>
              <span>{direction.index || String(index + 1).padStart(2, "0")} / {direction.label}</span>
              <h3>{direction.title}</h3>
              <p>{direction.description}</p>
              <b>Explore this lane <Arrow /></b>
            </a>
          ))}
        </div>
      </section>

      {projects.length > 0 && (
        <section className="portfolio-section portfolio-work-section">
          <div className="portfolio-section-heading portfolio-section-heading-row">
            <div><p className="portfolio-eyebrow">Selected technical work</p><h2>Systems with a <em>public record.</em></h2></div>
            <a className="portfolio-text-link" href={`/${person}/projects`}>View all projects <Arrow /></a>
          </div>
          <div className="portfolio-project-grid">
            {projects.slice(0, 10).map((project, index) => (
              <a href={project.url} target="_blank" rel="noreferrer" className={`portfolio-project-card ${project.bentoSpan === 2 ? "portfolio-project-card-wide" : ""}`} key={project.name}>
                <div className={`portfolio-project-mark portfolio-project-mark-${index % 4}`} aria-hidden="true"><i /><i /><i /></div>
                <div className="portfolio-project-meta"><span>{project.language || "Open source"}</span>{Number.isInteger(project.stars) && <span>★ {project.stars.toLocaleString()}</span>}</div>
                <h3>{project.displayName || project.name}</h3>
                <p>{project.description}</p>
                <div className="portfolio-tags">{project.topics?.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}</div>
                <b>Open repository <Arrow /></b>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="portfolio-section evidence-section">
        <div className="evidence-copy">
          <p className="portfolio-eyebrow">Evidence, not a claim wall</p>
          <h2>Every role should connect to <em>work someone can inspect.</em></h2>
          <p>Projects link to source. Research links to its record. Talks follow implemented lessons. Experience is described through responsibility rather than title alone.</p>
          <a className="portfolio-button portfolio-button-light" href={`/${person}/about`}>How the work developed <Arrow /></a>
        </div>
        <div className="evidence-ledger">
          <div><strong>{projects.length}</strong><span>selected projects</span></div>
          <div><strong>{publications.length}</strong><span>research records</span></div>
          <div><strong>{talks.length}</strong><span>public sessions</span></div>
          <div><strong>{work.length}</strong><span>recorded roles</span></div>
        </div>
      </section>

      {(publications.length > 0 || talks.length > 0) && (
        <section className="portfolio-section record-section">
          <div className="portfolio-section-heading"><div><p className="portfolio-eyebrow">Research and public explanation</p><h2>Build first. Then <em>publish the lesson.</em></h2></div></div>
          <div className="record-grid">
            {publications.slice(0, 2).map((publication) => (
              <a href={publication.links?.[0]?.url || `/${person}/publications`} key={publication.title} target={publication.links?.[0] ? "_blank" : undefined} rel="noreferrer">
                <span>Research / {publication.year}</span><h3>{publication.title}</h3><p>{publication.status || publication.authors}</p><b>Read the record <Arrow /></b>
              </a>
            ))}
            {talks.slice(0, 2).map((talk) => (
              <a href={talk.link || `/${person}/talks`} key={`${talk.title}-${talk.date}`} target={talk.link ? "_blank" : undefined} rel="noreferrer">
                <span>Talk / {talk.date}</span><h3>{talk.title}</h3><p>{talk.venue || talk.location}</p><b>View the session <Arrow /></b>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="portfolio-closing">
        <div className="portfolio-geometry" aria-hidden="true"><i /><i /><i /><i /></div>
        <p className="portfolio-eyebrow">Work together</p>
        <h2>For platform work, open-source collaboration, or a technical conversation.</h2>
        <a className="portfolio-button portfolio-button-dark" href={`/${person}/connect`}>Connect with {profile.siteName} <Arrow /></a>
      </section>
    </>
  );
}
