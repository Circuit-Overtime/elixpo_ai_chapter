export default function Masthead({ hero, person, memberName }) {
  return (
    <section className="masthead relative w-full flex flex-col border-b-2 border-[#111] px-2 sm:px-5 pt-4 sm:pt-8 pb-6 sm:pb-10">
      {/* Focus-tag dateline */}
      <div className="mastheadDateline flex flex-wrap items-center gap-2 sm:gap-3 text-[#1B1B19] text-xs sm:text-sm md:text-[1.1em] font-extrabold tracking-[2px] uppercase mb-3 sm:mb-5">
        {hero.focusTags.map((tag, i) => (
          <span key={i} className="contents">
            {i > 0 && <span className="opacity-50">·</span>}
            <span>{tag}</span>
          </span>
        ))}
        <span className="hidden sm:block flex-1 h-[2px] bg-[#888] ml-2" />
      </div>

      {/* Charcoal headline block - the role statement */}
      <div className="mastheadHeadlineBlock w-full flex items-center bg-[#1B1B19] opacity-90 select-none rounded-[10px] sm:rounded-[15px] px-5 sm:px-10 py-6 sm:py-10 md:py-12">
        <h1 className="text-[#E2D9C8] font-[Canopee,serif] tracking-[1px] sm:tracking-[2px] text-3xl sm:text-5xl md:text-6xl lg:text-[5em] leading-[1.05]">
          {memberName && <span className="sr-only">{memberName} — </span>}
          {hero.headline}
        </h1>
      </div>

      {/* Subhead */}
      <p className="mastheadSubhead text-[#444] mt-3 sm:mt-5 text-base sm:text-xl md:text-2xl lg:text-[1.8em] tracking-[1px]">
        {hero.subhead}
      </p>

      {/* Body: intro + credentials + CTAs (left) · portrait (right) */}
      <div className="mastheadBody flex flex-col-reverse lg:flex-row gap-6 sm:gap-10 mt-6 sm:mt-10">
        <div className="mastheadInfo flex flex-col justify-between flex-1 gap-6 sm:gap-8">
          <p className="mastheadIntro whitespace-pre-line text-[#222] text-lg sm:text-2xl md:text-3xl lg:text-[2.2em] leading-snug tracking-[0.5px] max-w-[850px]">
            {hero.intro}
          </p>

          <div className="mastheadFooterRow flex flex-col gap-6 sm:gap-8">
            {hero.credentials?.length > 0 && (
              <div className="mastheadCredentials flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
                {hero.credentials.map((c, i) => (
                  <div
                    key={i}
                    className="credentialCard border-2 border-[#222] rounded-[12px] bg-[#E2D9C8] px-5 py-3 flex flex-col min-w-[210px] shadow-[5px_5px_0_0_#222] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_7px_0_0_#222]"
                  >
                    <span className="text-[#1B1B19] font-extrabold text-sm sm:text-base md:text-[1.2em] leading-tight">
                      {c.label}
                    </span>
                    <span className="text-[#555] text-xs sm:text-sm md:text-[1em] tracking-[0.5px] mt-1">
                      {c.org}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {hero.ctas?.length > 0 && (
              <div className="mastheadCtas flex flex-wrap gap-4 sm:gap-5">
                {hero.ctas.map((cta, i) => (
                  <a
                    key={i}
                    href={`/${person}/${cta.href}`}
                    className="ctaButton fontNav border-2 border-[#222] rounded-full px-7 sm:px-9 py-2.5 sm:py-3 text-base sm:text-lg md:text-[1.3em] tracking-[1px] text-[#1B1B19] flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105"
                  >
                    {cta.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {hero.portrait && (
          <div
            className="mastheadPortrait bg-cover bg-center rounded-[12px] sm:rounded-[15px] border-2 border-[#222] sepia-[35%] h-[320px] sm:h-[420px] md:h-[480px] lg:h-auto lg:min-h-[460px] w-full lg:w-[360px] xl:w-[420px] flex-shrink-0"
            style={{ backgroundImage: `url(${hero.portrait})` }}
          />
        )}
      </div>
    </section>
  );
}
