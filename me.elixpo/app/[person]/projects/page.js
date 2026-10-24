import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import PortfolioDataGraphic from "@/components/PortfolioDataGraphic";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";

const safeGet = (person, file) => { try { return getPersonContent(person, file); } catch { return null; } };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "projects" }); }

export default async function ProjectsPage({ params }) {
  const { person } = await params;
  const data = safeGet(person, "projects");
  if (!data?.projects?.length) return <><ComingSoon title="Projects Coming Soon" /><ContactBanner person={person} /></>;
  const languages = new Set(data.projects.map((project) => project.language).filter(Boolean));
  const languageMetrics = Object.entries(data.projects.reduce((counts, project) => {
    const language = project.language || "Other";
    counts[language] = (counts[language] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  return <>
    <MemberSectionJsonLd person={person} section="projects" />
    <PageHero person={person} image={data.heroImage || `/assets/${person}/projects/stamp-2.webp`} imageAlt={`Project archive artwork for ${person}`} eyebrow="Selected engineering work" title="Systems built to be" italic="used and inspected." description={data.description} facts={[{ value: data.projects.length, label: "selected projects" }, { value: languages.size, label: "primary languages" }]} />
    <PortfolioDataGraphic eyebrow="Project composition" title="The tools behind the systems." description="A compact view of the primary implementation languages represented in this public project record." items={languageMetrics} />
    <section className="portfolio-section project-directory">
      <div className="portfolio-section-heading"><div><p className="portfolio-eyebrow">Public repositories and maintained systems</p><h2>Source, decisions, and <em>operational purpose.</em></h2></div></div>
      {data.layout === "bento" ? (
        <div className="portfolio-bento-grid">
          {data.projects.map((project, index) => (
            <a
              key={project.name}
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className={`portfolio-bento-card ${project.bentoSpan === 2 ? "bento-span-2" : ""}`}
            >
              <div className="portfolio-bento-top">
                <div className={`portfolio-project-mark portfolio-project-mark-${index % 4}`} aria-hidden="true">
                  <i /><i /><i />
                </div>
                <div className="portfolio-project-meta">
                  <span>{project.language || "Open source"}</span>
                  {Number.isInteger(project.stars) && <span>★ {project.stars.toLocaleString()}</span>}
                </div>
              </div>
              <div className="portfolio-bento-body">
                <h3>{project.displayName || project.name}</h3>
                <p>{project.description}</p>
              </div>
              <div className="portfolio-bento-footer">
                <div className="portfolio-tags">
                  {project.topics?.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
                <b>Open repository <span aria-hidden="true">↗</span></b>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="project-directory-list">
          {data.projects.map((project, index) => <article key={project.name}>
            <div className={`portfolio-project-mark portfolio-project-mark-${index % 4}`} aria-hidden="true"><i /><i /><i /></div>
            <div className="project-directory-index"><span>{String(index + 1).padStart(2, "0")}</span><small>{project.language || "Open source"}</small></div>
            <div className="project-directory-copy"><h2>{project.displayName || project.name}</h2><p>{project.description}</p><div className="portfolio-tags">{project.topics?.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
            <div className="project-directory-action">{Number.isInteger(project.stars) && <span>★ {project.stars.toLocaleString()}</span>}<a href={project.url} target="_blank" rel="noreferrer">Repository ↗</a></div>
          </article>)}
        </div>
      )}
    </section>
    <ContactBanner person={person} />
  </>;
}
