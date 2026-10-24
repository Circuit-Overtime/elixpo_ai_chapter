import { getPersonContent, getValidPersons } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import MemberHeader from "@/components/MemberHeader";
import Footer from "@/components/Footer";

export async function generateStaticParams() {
  return getValidPersons().map((person) => ({ person }));
}

export async function generateMetadata({ params }) {
  const { person } = await params;
  return buildMemberMetadata({ person });
}

export default async function PersonLayout({ children, params }) {
  const { person } = await params;
  const profile = getPersonContent(person, "profile");

  return (
    <div className="portfolio-site">
      <MemberHeader person={person} profile={profile} />
      <main className="portfolio-main">{children}</main>
      <Footer profile={profile} person={person} />
    </div>
  );
}

