import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";

const safeGet = (person, file, fallback = null) => { try { return getPersonContent(person, file); } catch { return fallback; } };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "about" }); }

export default async function AboutPage({ params }) {
  const { person } = await params;
  const about = safeGet(person, "about");
  const work = safeGet(person, "work", []);
  const profile = safeGet(person, "profile", {});
  if (!about?.intro) return <><ComingSoon title="About Coming Soon" /><ContactBanner person={person} /></>;
  return <>
    <MemberSectionJsonLd person={person} section="about" />
    <PageHero person={person} memberName={profile.name || profile.siteName} image={person === "bhumika" ? "/assets/bhumika/bhumika-avatar.jpg" : `/assets/${person}/about/sq-11.webp`} eyebrow="Background / current direction" title="A practice shaped by" italic="systems and communities." description={about.intro.description} facts={[{ value: work.length, label: "recorded roles" }, { value: "2023", label: "building with Elixpo since" }]} />
    <section className="portfolio-section about-introduction">
      <figure><div className="about-image-field" /><img src={about.intro.portraitImage} alt={`Portrait of ${profile.name || profile.siteName}`} /></figure>
      <div><p className="portfolio-eyebrow">The practical direction</p><h2>{about.fancySection?.banner || "Build. Document. Share."}</h2><p>{about.fancySection?.content}</p><p>{about.fancySection?.contactNote}</p><a className="portfolio-button portfolio-button-dark" href={`/${person}/connect`}>Start a conversation ↗</a></div>
    </section>
    {work.length > 0 && <section className="portfolio-section experience-section">
      <div className="portfolio-section-heading"><div><p className="portfolio-eyebrow">Experience and responsibility</p><h2>Roles placed in <em>their actual context.</em></h2></div><p>Current and past work is recorded through the responsibility held and the system or community served.</p></div>
      <div className="experience-list">{work.map((experience, index) => <article key={`${experience.jobTitle}-${experience.timeline}`}><span>{String(index + 1).padStart(2, "0")}</span><div><p className="portfolio-eyebrow">{experience.timeline}</p><h3>{experience.jobTitle}</h3><p>{experience.description}</p></div></article>)}</div>
    </section>}
    {about.images?.gallery?.length > 0 && <section className="portfolio-section about-gallery">{about.images.gallery.map((image, index) => <figure key={image}><img src={image} alt={`${profile.siteName} public work and community record ${index + 1}`} loading="lazy" /></figure>)}</section>}
    <ContactBanner person={person} />
  </>;
}
