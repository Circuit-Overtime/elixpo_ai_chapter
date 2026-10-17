import Link from "next/link";

export default function PersonNotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-6 sm:gap-10 p-6 sm:p-10 min-h-[60vh] text-center">
      <div className="text-[5rem] sm:text-[10rem] md:text-[15rem] font-extrabold leading-none text-[#1B1B19] opacity-90 select-none" style={{ fontFamily: "Canopee, serif" }}>
        404
      </div>

      <p className="text-lg sm:text-2xl md:text-[2.5em] text-[#1B1B19] font-extrabold tracking-wide" style={{ fontFamily: "Canopee, serif" }}>
        Page not found.
      </p>

      <p className="text-sm sm:text-base md:text-[1.4em] text-[#555] leading-relaxed max-w-[500px]" style={{ fontFamily: "'Pathway Gothic One', sans-serif" }}>
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>

      <Link
        href="/"
        className="w-[220px] sm:w-[280px] h-[50px] sm:h-[70px] text-base sm:text-xl border-2 border-[#222] rounded-full flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105 mt-4"
        style={{ fontFamily: "'Bitcount Grid Double', system-ui" }}
      >
        Go Home
      </Link>
    </div>
  );
}
