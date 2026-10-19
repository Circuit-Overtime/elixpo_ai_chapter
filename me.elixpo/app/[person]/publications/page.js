import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import PortfolioDataGraphic from "@/components/PortfolioDataGraphic";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";

const safeGet = (person, file) => { try { return getPersonContent(person, file); } catch { return null; } };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "publications" }); }

export default async function PublicationsPage({ params }) {
  const { person } = await params;
  const data = safeGet(person, "publications");
  if (!data?.papers?.length) return <><ComingSoon title="Research Coming Soon" /><ContactBanner person={person} /></>;
  const yearMetrics = Object.entries(data.papers.reduce((counts, paper) => {
    const year = String(paper.year || "Undated");
    counts[year] = (counts[year] || 0) + 1;
    return counts;
  }, {})).sort(([a], [b]) => b.localeCompare(a)).map(([label, value]) => ({ label, value }));
  return <>
    <MemberSectionJsonLd person={person} section="publications" />
    <PageHero person={person} image={data.images?.[1] || `/assets/${person}/publication/sq-2.webp`} imageAlt={`Research archive artwork for ${person}`} eyebrow="Research / reproducible public work" title="Questions tested through" italic="artifacts and evidence." description={data.description} facts={[{ value: data.papers.length, label: "research records" }, { value: new Set(data.papers.map((paper) => paper.year)).size, label: "recorded years" }]} />
    <PortfolioDataGraphic eyebrow="Research timeline" title="Evidence accumulated over time." description="Publication activity grouped by recorded year, without treating preprints as peer-reviewed work." items={yearMetrics} />
    <section className="portfolio-section research-directory">
      <div className="portfolio-section-heading"><div><p className="portfolio-eyebrow">Published record</p><h2>Research stays connected to <em>what can be reproduced.</em></h2></div><p>Each entry preserves its authors, maturity, date, and available public surfaces. A preprint is not presented as peer review.</p></div>
      <div className="research-records">{data.papers.map((paper, index) => <article key={paper.title}>
        <div className={`research-record-art research-record-art-${index % 3}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i /><i /></div>
        <div className="research-record-copy"><p className="portfolio-eyebrow">{paper.year} / {paper.status || "Research record"}</p><h2>{paper.title}</h2>{paper.authors && <p>{paper.authors}</p>}<div className="research-record-links">{paper.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</div></div>
      </article>)}</div>
    </section>
    <ContactBanner person={person} />
  </>;
}
