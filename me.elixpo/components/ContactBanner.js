"use client";

export default function ContactBanner({ person }) {
  return (
    <section className="contactMeWrapper overflow-hidden w-full border-y-2 border-[#111] mt-10 pt-5 pb-5 justify-center select-none overflow-y-hidden cursor-pointer">
      <div
        className="contactMe animate-scroll whitespace-nowrap flex flex-row items-center justify-center gap-[10px] w-max"
        onClick={() => (window.location.href = `/${person}/connect`)}
      >
        <p className="contactMeText font-bold text-left text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[5em] text-[#1B1B19]">
          Let&apos;s Collaborate Together!
        </p>
        <div className="contactMeBox text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[5em] flex items-center justify-center p-2 bg-[#1B1B19] text-center opacity-90 select-none rounded-[8px] cursor-pointer">
          <p className="text-[#E2D9C8] tracking-wide leading-[50px] sm:leading-[70px] md:leading-[100px] font-bold whitespace-nowrap">
            CONNECT WITH ME
          </p>
        </div>
        <p className="contactMeText font-bold text-left text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[5em] text-[#1B1B19]">
          Let&apos;s Collaborate Together!
        </p>
        <div className="contactMeBox text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[5em] flex items-center justify-center p-2 bg-[#1B1B19] text-center opacity-90 select-none rounded-[8px] cursor-pointer">
          <p className="text-[#E2D9C8] tracking-wide leading-[50px] sm:leading-[70px] md:leading-[100px] font-bold whitespace-nowrap">
            CONNECT WITH ME
          </p>
        </div>
        <p className="contactMeText font-bold text-left text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[5em] text-[#1B1B19]">
          Let&apos;s Collaborate Together!
        </p>
      </div>
    </section>
  );
}
