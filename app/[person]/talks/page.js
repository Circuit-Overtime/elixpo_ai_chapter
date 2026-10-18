import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import PortfolioDataGraphic from "@/components/PortfolioDataGraphic";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";

const safeGet = (person, file) => { try { return getPersonContent(person, file); } catch { return null; } };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "talks" }); }

export default async function TalksPage({ params }) {
  const { person } = await params;
  const data = safeGet(person, "talks");
  if (!data?.sessions?.length) return <><ComingSoon title="Talks Coming Soon" /><ContactBanner person={person} /></>;
  const upcoming = data.sessions.filter((talk) => talk.status === "upcoming").length;
  const delivered = data.sessions.length - upcoming;
  return <>
    <MemberSectionJsonLd person={person} section="talks" />
    <PageHero person={person} image={`/assets/${person}/punchlineSection/hz-pic1.webp`} imageAlt={`Public speaking archive for ${person}`} eyebrow="Technical communication" title="Lessons shared after" italic="the work exists." description={data.description} facts={[{ value: data.sessions.length, label: "recorded sessions" }, { value: upcoming, label: "upcoming" }]} />
    <PortfolioDataGraphic eyebrow="Session record" title="From prepared ideas to delivered sessions." description="A direct split between completed public sessions and the talks still ahead." items={[{ label: "Delivered", value: delivered }, { label: "Upcoming", value: upcoming }]} />
    <section className="portfolio-section talk-directory">
      <div className="talk-list">{data.sessions.map((talk, index) => {
        const body = <><span>{String(index + 1).padStart(2, "0")}</span><div><p className="portfolio-eyebrow">{talk.status === "upcoming" ? "Upcoming" : "Delivered"} / {talk.date}</p><h2>{talk.title}</h2><p>{[talk.venue, talk.location].filter(Boolean).join(" · ")}</p></div><b>{talk.link ? "View session ↗" : "Public record"}</b></>;
        return talk.link ? <a key={`${talk.title}-${talk.date}`} href={talk.link} target="_blank" rel="noreferrer">{body}</a> : <article key={`${talk.title}-${talk.date}`}>{body}</article>;
      })}</div>
    </section>
    <ContactBanner person={person} />
  </>;
}
