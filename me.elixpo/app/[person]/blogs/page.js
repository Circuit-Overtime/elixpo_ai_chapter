import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import PortfolioDataGraphic from "@/components/PortfolioDataGraphic";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";

const safeGet = (person, file) => { try { return getPersonContent(person, file); } catch { return null; } };
const formatDate = (iso) => { const date = new Date(iso); return Number.isNaN(date.valueOf()) ? iso : date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }); };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "blogs" }); }

export default async function BlogsPage({ params }) {
  const { person } = await params;
  const data = safeGet(person, "blogs");
  if (!data?.posts?.length) return <><ComingSoon title="Writing Coming Soon" /><ContactBanner person={person} /></>;
  const topicMetrics = Object.entries(data.posts.reduce((counts, post) => {
    (post.tags || ["General"]).forEach((tag) => { counts[tag] = (counts[tag] || 0) + 1; });
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  return <>
    <MemberSectionJsonLd person={person} section="blogs" />
    <PageHero person={person} image={`/assets/${person}/websiteSection/human-think1.webp`} imageAlt={`Writing archive artwork for ${person}`} eyebrow="Writing / technical notes" title="Documentation that preserves" italic="the useful part." description={data.description} facts={[{ value: data.posts.length, label: "published posts" }]}>
      {data.home && <a className="portfolio-button portfolio-button-dark" href={data.home} target="_blank" rel="noreferrer">Visit LixBlogs ↗</a>}
    </PageHero>
    <PortfolioDataGraphic eyebrow="Writing themes" title="Topics that recur in the record." description="The most frequent subjects across published technical notes and essays." items={topicMetrics} />
    <section className="portfolio-section writing-directory"><div className="writing-list">{data.posts.map((post, index) => <a href={post.url} target="_blank" rel="noreferrer" key={post.url}>
      <span>{String(index + 1).padStart(2, "0")}</span><div><p className="portfolio-eyebrow">{formatDate(post.date)}{post.source ? ` / ${post.source}` : ""}</p><h2>{post.title}</h2>{post.excerpt && <p>{post.excerpt}</p>}<div className="portfolio-tags">{post.tags?.map((tag) => <span key={tag}>{tag}</span>)}</div></div><b>Read ↗</b>
    </a>)}</div></section>
    <ContactBanner person={person} />
  </>;
}
