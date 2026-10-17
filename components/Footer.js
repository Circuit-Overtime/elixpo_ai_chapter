"use client";

export default function Footer({ profile, person }) {
  const year = new Date().getFullYear();

  return (
    <footer className="w-screen left-1/2 -translate-x-1/2 relative border-t-2 border-[#222] mt-16 bg-[#1B1B19] text-[#E2D9C8]">
      {/* Top: name + tagline / email CTA */}
      <div className="footerTop flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 px-6 sm:px-10 md:px-16 pt-10 sm:pt-14 pb-8">
        <div className="footerIdentity flex flex-col gap-2">
          <p className="footerName select-none font-[Canopee,serif] tracking-[2px] text-4xl sm:text-5xl md:text-[5em] leading-none">
            {profile.siteName.toUpperCase()}
          </p>
          {profile.siteDescription && (
            <p className="footerTagline text-[#bdb39c] text-sm sm:text-base md:text-[1.3em] tracking-[1px]">
              {profile.siteDescription}
            </p>
          )}
        </div>

        {profile.email && (
          <div className="footerContact flex flex-col gap-2 lg:items-end">
            <span className="text-[#8c856f] text-xs sm:text-sm uppercase tracking-[3px] font-extrabold">
              Get in touch
            </span>
            <a
              href={`mailto:${profile.email}`}
              className="footerEmail group inline-flex items-center gap-3 border-2 border-[#E2D9C8] rounded-full px-6 sm:px-8 py-2.5 sm:py-3 text-base sm:text-lg md:text-[1.4em] font-extrabold tracking-[1px] cursor-pointer transition-all duration-300 hover:bg-[#E2D9C8] hover:text-[#1B1B19] hover:scale-105"
            >
              <ion-icon name="mail-outline" style={{ fontSize: "1.1em" }} />
              {profile.email}
            </a>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-6 sm:mx-10 md:mx-16 h-0.5 bg-[#3a382f]" />

      {/* Bottom: socials + meta */}
      <div className="footerBottom flex flex-col sm:flex-row justify-between items-center gap-5 px-6 sm:px-10 md:px-16 py-6">
        <div className="socials flex flex-row items-center gap-5 sm:gap-6">
          {profile.socials.map((social) => (
            <ion-icon
              key={social.platform}
              name={social.icon}
              className="socialIcon text-xl sm:text-2xl md:text-[1.8em] cursor-pointer hover:text-white hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => window.open(social.url, "_blank")}
              style={{ cursor: "pointer" }}
            />
          ))}
        </div>

        <div className="footerMeta flex flex-col sm:flex-row items-center gap-1 sm:gap-4 text-[#8c856f] text-xs sm:text-sm tracking-[1px]">
          {profile.location && <span>{profile.location}</span>}
          <span className="hidden sm:inline">·</span>
          <span>© {year} {profile.siteName}</span>
          <span className="hidden sm:inline">·</span>
          <span>
            Part of the{" "}
            <a
              href="https://elixpo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[#8c856f] underline-offset-2 hover:text-[#E2D9C8]"
            >
              Elixpo
            </a>{" "}
            series
          </span>
        </div>
      </div>
    </footer>
  );
}
