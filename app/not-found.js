import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-white flex flex-col justify-center items-center overflow-hidden">
      <div
        className="absolute top-0 left-0 w-screen h-screen opacity-55 bg-contain bg-repeat bg-center brightness-[55%] sepia-[65%]"
        style={{ backgroundImage: `url(/assets/ayushman/paperTexture.webp)` }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-10 p-6 sm:p-10 max-w-[700px] text-center">
        <div className="text-[6rem] sm:text-[12rem] md:text-[18rem] font-extrabold leading-none text-[#1B1B19] opacity-90 select-none" style={{ fontFamily: "Canopee, serif" }}>
          404
        </div>

        <p className="text-lg sm:text-2xl md:text-[2.5em] text-[#1B1B19] font-extrabold tracking-wide" style={{ fontFamily: "Canopee, serif" }}>
          This page doesn&apos;t exist.
        </p>

        <p className="text-sm sm:text-base md:text-[1.4em] text-[#555] leading-relaxed" style={{ fontFamily: "'Pathway Gothic One', sans-serif" }}>
          The member or page you&apos;re looking for isn&apos;t part of Elixpo - or at least not yet.
          If you think they should be, raise a query and let us know.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <a
            href="https://github.com/elixpo/elixpome/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="w-[220px] sm:w-[280px] h-[50px] sm:h-[70px] text-base sm:text-xl border-2 border-[#222] rounded-full flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105"
            style={{ fontFamily: "'Bitcount Grid Double', system-ui" }}
          >
            Raise a Query
          </a>
          <Link
            href="/"
            className="w-[220px] sm:w-[280px] h-[50px] sm:h-[70px] text-base sm:text-xl border-2 border-[#222] rounded-full flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105"
            style={{ fontFamily: "'Bitcount Grid Double', system-ui" }}
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
