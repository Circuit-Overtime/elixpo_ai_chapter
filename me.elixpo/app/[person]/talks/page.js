import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";

function safeGet(person, file) {
  try {
    return getPersonContent(person, file);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { person } = await params;
  return buildMemberMetadata({ person, section: "talks" });
}

function TalkCard({ talk }) {
  const upcoming = talk.status === "upcoming";
  const Title = (
    <h3 className="talkTitle font-extrabold text-[#1B1B19] text-base sm:text-lg md:text-xl leading-snug tracking-[0.5px]">
      <span className={talk.link ? "underline decoration-[#888] decoration-1 underline-offset-4 group-hover:decoration-[#B63B12]" : ""}>
        {talk.title}
      </span>
      {talk.venue && (
        <span className="talkVenue font-semibold text-[#B63B12] text-sm sm:text-base"> | {talk.venue}</span>
      )}
    </h3>
  );

  const inner = (
    <>
      <span
        className={
          "talkPill fontNav self-start uppercase tracking-[1px] text-[0.6rem] sm:text-xs px-3 py-1 rounded-full " +
          (upcoming ? "bg-[#B63B12] text-[#ffe]" : "bg-[#1B1B19] text-[#E2D9C8]")
        }
      >
        {upcoming ? "Upcoming" : "Past"}
      </span>
      {Title}
      <div className="talkMeta flex flex-col gap-1 mt-1">
        <span className="flex items-center gap-2 text-[#444] text-sm sm:text-base">
          <ion-icon name="calendar-outline" />
          {talk.date}
        </span>
        {talk.location && (
          <span className="flex items-center gap-2 text-[#444] text-sm sm:text-base">
            <ion-icon name="location-outline" />
            {talk.location}
          </span>
        )}
      </div>
    </>
  );

  const cardClass =
    "talkCard group flex flex-col gap-3 border-2 rounded-[16px] p-5 sm:p-6 transition-all duration-300 " +
    (upcoming
      ? "border-[#B63B12]/40 bg-[#B63B12]/[0.06] hover:bg-[#B63B12]/[0.12]"
      : "border-[#222]/20 bg-[#E2D9C8]/40 hover:bg-[#E2D9C8]/70");

  return talk.link ? (
    <a href={talk.link} target="_blank" rel="noopener noreferrer" className={cardClass + " cursor-pointer hover:scale-[1.01]"}>
      {inner}
    </a>
  ) : (
    <div className={cardClass}>{inner}</div>
  );
}

function TalkGroup({ label, accent, talks }) {
  if (talks.length === 0) return null;
  return (
    <section className="talkGroup mt-8 sm:mt-12 px-3 sm:px-6 md:px-10">
      <div className="flex items-center gap-3 mb-5 sm:mb-6">
        <span className={"h-3 w-3 rounded-full " + (accent ? "bg-[#B63B12]" : "bg-[#888]")} />
        <h2 className="font-[Canopee,serif] text-[#1B1B19] text-2xl sm:text-3xl md:text-[2.4em] tracking-[1px]">
          {label}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {talks.map((talk, i) => (
          <TalkCard key={i} talk={talk} />
        ))}
      </div>
    </section>
  );
}

export default async function TalksPage({ params }) {
  const { person } = await params;
  const talks = safeGet(person, "talks");

  if (!talks || !talks.sessions?.length) {
    return (
      <>
        <ComingSoon title="Talks Coming Soon" />
        <ContactBanner person={person} />
      </>
    );
  }

  const upcoming = talks.sessions.filter((s) => s.status === "upcoming");
  const past = talks.sessions.filter((s) => s.status !== "upcoming");

  return (
    <>
      {/* Header */}
      <section className="talksHeader mt-8 sm:mt-12 px-3 sm:px-6 md:px-10 flex flex-col w-full">
        <h1 className="font-[Canopee,serif] text-[#1B1B19] text-4xl sm:text-6xl md:text-[5em] leading-none tracking-[1px]">
          {talks.heading}
        </h1>
        <p className="mt-4 sm:mt-5 text-[#444] italic text-base sm:text-xl md:text-[1.6em] max-w-[800px] leading-snug">
          {talks.description}
        </p>
        <div className="mt-5 sm:mt-6 flex items-center gap-3">
          <span className="fontNav text-[#888] text-sm sm:text-base tracking-[1px]">
            {talks.sessions.length} sessions
          </span>
          <span className="flex-1 h-0.5 bg-[#888]/30" />
        </div>
      </section>

      <TalkGroup label="Upcoming" accent talks={upcoming} />
      <TalkGroup label="Past" talks={past} />

      {/* Contact Banner */}
      <ContactBanner person={person} />
    </>
  );
}
