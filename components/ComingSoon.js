export default function ComingSoon({ title = "Coming Soon" }) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-16 sm:py-24 gap-4">
      <div className="text-[#1B1B19] text-3xl sm:text-5xl md:text-[4em] font-extrabold tracking-wide opacity-20 select-none"
        style={{ fontFamily: "Canopee, serif" }}
      >
        {title}
      </div>
      <p className="text-[#888] text-sm sm:text-base tracking-[3px]"
        style={{ fontFamily: "'Pathway Gothic One', sans-serif" }}
      >
        This section is being worked on
      </p>
    </div>
  );
}
