import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import CopyEmail from "@/components/CopyEmail";
import ComingSoon from "@/components/ComingSoon";
import MemberSectionJsonLd from "@/components/MemberSectionJsonLd";
import SocialIcon from "@/components/SocialIcon";

const safeGet = (person, file) => { try { return getPersonContent(person, file); } catch { return null; } };
export async function generateMetadata({ params }) { const { person } = await params; return buildMemberMetadata({ person, section: "connect" }); }

export default async function ConnectPage({ params }) {
  const { person } = await params;
  const data = safeGet(person, "connect");
  if (!data || (!data.emails?.length && !data.socialLinks?.length)) return <ComingSoon title="Connect Coming Soon" />;
  return <>
    <MemberSectionJsonLd person={person} section="connect" />
    <PageHero person={person} image={data.heroImage || `/assets/${person}/websiteSection/sq-seal1.webp`} imageAlt={`Personal mark for ${person}`} eyebrow="Contact / verified public channels" title="Start with the" italic="right conversation." description={data.description} facts={[{ value: data.emails?.length || 0, label: "direct addresses" }, { value: data.socialLinks?.length || 0, label: "verified profiles" }]} />
    <section className="portfolio-section contact-directory">
      <div className="contact-panel contact-email-panel"><div><p className="portfolio-eyebrow">Direct correspondence</p><h2>Email</h2></div><div className="contact-email-list">{data.emails?.map((email) => <CopyEmail key={email} email={email} />)}</div></div>
      <div className="contact-panel contact-social-panel"><p className="portfolio-eyebrow">Elsewhere on the web</p><h2>Public profiles</h2><div>{data.socialLinks?.map((social) => <a key={social.platform} href={social.url} target="_blank" rel="noreferrer" style={{ "--social-color": social.hoverColor }}><SocialIcon platform={social.platform} /><span>{social.platform}</span><b>↗</b></a>)}</div></div>
      {data.contactImage && <figure className="contact-portrait"><div className="about-image-field" /><img src={data.contactImage} alt="Contact portrait" /></figure>}
    </section>
  </>;
}
