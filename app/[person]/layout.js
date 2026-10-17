import { getPersonContent, getValidPersons } from "@/lib/content";
import MenuOverlay from "@/components/MenuOverlay";
import Footer from "@/components/Footer";
import { FadeInReveal, InertiaScroll } from "@/components/Animations";
import { buildMemberMetadata } from "@/lib/seo";

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
    <div className="relative min-h-screen bg-white flex flex-col justify-center overflow-x-hidden max-w-[100vw]">
      <MenuOverlay person={person} menuItems={profile.menuItems} currentPath="" />

      {/* Paper texture overlay */}
      <div
        className="absolute top-0 left-0 w-full h-full opacity-55 bg-contain bg-repeat bg-center brightness-[55%] sepia-[65%]"
        style={{ backgroundImage: `url(/assets/${person}/paperTexture.webp)` }}
      />

      {/* Navbar */}
      <div className="navBar static h-[35px] sm:h-[80px] flex items-center justify-between border-b-2 border-[#888] px-4 sm:px-8 md:px-[50px] box-border mb-[5px]">
        <p className="location text-sm sm:text-lg md:text-[1.5em] z-10">{profile.location}</p>
        <a href={`/${person}`} className="name uppercase text-xl sm:text-2xl md:text-[3em] cursor-pointer z-10">
          {profile.siteName}
        </a>
        <ion-icon
          name="list"
          className="cursor-pointer text-lg sm:text-xl md:text-2xl z-10"
          id="scrollInMenu"
          style={{ cursor: "pointer" }}
        />
      </div>

      {/* Main content */}
      <div
        id="appContainer"
        className="appContainer relative top-0 mx-auto w-full max-w-full h-[calc(100vh-100px)] max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-10"
      >
        {children}
        <Footer profile={profile} person={person} />
      </div>

      <FadeInReveal />
      <InertiaScroll />
    </div>
  );
}
