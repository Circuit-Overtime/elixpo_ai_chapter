import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import ContactBanner from "@/components/ContactBanner";
import ComingSoon from "@/components/ComingSoon";
import DragScrollContainer from "@/components/DragScrollContainer";

function safeGet(person, file) {
  try {
    return getPersonContent(person, file);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { person } = await params;
  return buildMemberMetadata({ person, section: "about" });
}

export default async function AboutPage({ params }) {
  const { person } = await params;
  const about = safeGet(person, "about");
  const work = safeGet(person, "work") || [];
  const spotlight = safeGet(person, "spotlight") || [];
  const profile = safeGet(person, "profile") || {};

  if (!about || !about.intro) {
    return (
      <>
        <ComingSoon title="About Coming Soon" />
        <ContactBanner person={person} />
      </>
    );
  }

  return (
    <>
      {/* Intro Section */}
      <section className="introSection flex flex-col lg:flex-row items-center gap-5 sm:gap-10 mt-5">
        <div className="col1 flex flex-col justify-left gap-2 w-full lg:w-1/2">
          <div className="flex flex-row sm:flex-col gap-2 w-full">
            <div className="headingText text-xl sm:text-5xl md:text-[7em] w-1/2 sm:w-full sm:max-w-[500px] p-2 sm:p-5 h-[50px] sm:h-[160px] md:h-[200px] flex justify-center items-center bg-[#1B1B19] text-center opacity-90 select-none rounded-[10px] sm:rounded-[15px] tracking-[3px] sm:tracking-[5px]">
              <p className="text-[#E2D9C8] transform scale-y-[1.4] font-extrabold">
                {about.intro.heading}
              </p>
            </div>
            <div className="headingText text-xl sm:text-5xl md:text-[7em] w-1/2 sm:w-full sm:max-w-[400px] p-2 sm:p-5 h-[50px] sm:h-[160px] md:h-[200px] flex justify-center items-center bg-[#1B1B19] text-center opacity-90 select-none rounded-[10px] sm:rounded-[15px] tracking-[4px] sm:tracking-[7px]">
              <p className="text-[#E2D9C8] transform scale-y-[1.4] font-extrabold">
                {about.intro.subheading}
              </p>
            </div>
          </div>
          <p className="descriptionText text-[#1B1B19] text-base sm:text-xl md:text-[2em]">{about.intro.description}</p>
        </div>
        <div
          className="col2 bg-cover bg-center h-[300px] sm:h-[500px] md:h-[750px] w-full lg:w-1/2 rounded-[10px] sepia-[65%] saturate-[200%] border-2 border-[#222]"
          style={{ backgroundImage: `url(${about.intro.portraitImage})` }}
        />
      </section>

      {/* Work Experience Section */}
      {work?.length > 0 ? (
        <DragScrollContainer className="workExperience relative h-auto min-h-[350px] sm:min-h-[500px] md:min-h-[600px] mb-[20px] px-3 sm:px-6 md:px-[40px] box-border py-[20px] sm:py-[40px] gap-[15px] sm:gap-[20px] overflow-x-auto overflow-y-hidden flex-nowrap flex flex-row mt-10 sm:mt-20 select-none">
          {work.map((exp, index) => (
            <div
              key={index}
              className="workExperienceCard shrink-0 relative h-[300px] sm:h-[450px] md:h-[550px] w-[300px] sm:w-[450px] md:w-[550px] border-4 border-[#222] rounded-[25px] bg-[#E2D9C8] p-3 sm:p-5 justify-center items-center mr-3 sm:mr-5 brightness-[65%] hover:brightness-[85%] transition-all duration-300 cursor-grabbing"
            >
              <div className="dottedContainer relative h-full w-full border-2 border-dashed border-[#222] rounded-[20px] sm:rounded-[30px] flex flex-col gap-3 sm:gap-5 p-4 sm:p-8 md:p-10">
                <div className="flex flex-row items-left gap-3 sm:gap-5 mt-3 sm:mt-5">
                  <div className="flex flex-col gap-1 leading-[20px] sm:leading-[30px]">
                    <div className="jobSpotlight font-extrabold text-xl sm:text-3xl md:text-[4em] tracking-wide leading-[25px] sm:leading-[40px] md:leading-[60px]">
                      {exp.jobTitle}
                    </div>
                    <div className="font-thin text-sm sm:text-xl md:text-[2em]">{exp.timeline}</div>
                  </div>
                </div>
                <p className="absolute bottom-[15px] sm:bottom-[20px] left-[15px] sm:left-[20px] right-[15px] sm:right-[20px] text-[#333] text-xs sm:text-base md:text-[1.3em] whitespace-normal break-words underline decoration-1 decoration-[0.05rem] decoration-[#888] underline-offset-[4px] sm:underline-offset-[6px]">
                  &ldquo;{exp.description}&rdquo;
                </p>
              </div>
            </div>
          ))}
        </DragScrollContainer>
      ) : (
        <ComingSoon title="Work Experience Coming Soon" />
      )}

      {/* Visit Publications */}
      <section className="visitPublication flex flex-col sm:flex-row gap-5 sm:gap-10 justify-between p-4 sm:p-10 md:p-20 mt-5 items-center">
        <p className="publicationText text-[#222] text-3xl sm:text-5xl md:text-[6em] transform scale-y-[1.2] font-extrabold">PUBLICATIONS</p>
        <a
          href={`/${person}/publications`}
          className="visitCircle w-full sm:w-[250px] md:w-[350px] h-[60px] sm:h-[80px] md:h-[100px] text-base sm:text-xl md:text-[3em] border-2 border-[#222] rounded-full mt-3 sm:mt-10 flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105"
        >
          Visit Now
        </a>
      </section>

      {/* Gallery Images */}
      {about.images?.gallery?.length > 0 ? (
        <section className="aboutSectionImages mt-5 p-3 sm:p-6 md:p-10 flex flex-col sm:flex-row gap-[5px]">
          {about.images.gallery.map((img, i) => (
            <div
              key={i}
              className="bg-cover bg-center h-[250px] sm:h-[400px] md:h-[750px] w-full sm:w-1/2 rounded-[10px] sepia-[65%] saturate-[200%] border-2 border-[#222]"
              style={{ backgroundImage: `url(${img})` }}
            />
          ))}
        </section>
      ) : (
        <ComingSoon title="Gallery Coming Soon" />
      )}

      {/* Fancy Section */}
      <section className="aboutSectionFancyText mt-10 flex flex-col gap-3 sm:gap-5 p-3 sm:p-6 md:p-10 w-full items-center justify-center">
        <div className="aboutSectionText relative text-2xl sm:text-7xl md:text-[14em] w-full flex justify-center items-center h-[70px] sm:h-[180px] md:h-[250px] bg-[#1B1B19] text-center opacity-90 select-none rounded-[10px] sm:rounded-[15px]">
          <p className="text-[#E2D9C8] tracking-wide">{about.fancySection.banner}</p>
        </div>
        <p className="w-full text-left font-thin text-sm sm:text-base md:text-[1.5em]">{about.fancySection.subtitle}</p>
        <p className="aboutFancyDescription text-base sm:text-xl md:text-[3em] leading-snug sm:leading-tight text-justify text-wrap">
          {about.fancySection.content.split(new RegExp(`(${about.fancySection.highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')).map((part, i) =>
            about.fancySection.highlights.some(h => h.toLowerCase() === part.toLowerCase()) ? (
              <span
                key={i}
                className="inline bg-[#1B1B19] text-[#E2D9C8] font-extrabold px-1.5 sm:px-4 py-0.5 sm:py-1 rounded-[5px] sm:rounded-[10px] tracking-wide opacity-90 mx-0.5 sm:mx-1 text-sm sm:text-base md:text-[0.7em] leading-relaxed"
              >
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
          <br /><br />
          {about.fancySection.contactNote}{" "}
          <span className="inline bg-[#1B1B19] text-[#E2D9C8] font-extrabold px-1.5 sm:px-4 py-0.5 sm:py-1 rounded-[5px] sm:rounded-[10px] tracking-wide opacity-90 mx-0.5 sm:mx-1 text-sm sm:text-base md:text-[0.7em] leading-relaxed">
            {profile.email}
          </span>
          <br /><br />
          {about.fancySection.shoutouts && (
            <>
              {about.fancySection.shoutouts.length >= 1 ? "Huge shout-out to " : ""}
            </>
          )}
          {about.fancySection.shoutouts?.map((name, i) => (
            <span
              key={i}
              className="inline bg-[#1B1B19] text-[#E2D9C8] font-extrabold px-1.5 sm:px-4 py-0.5 sm:py-1 rounded-[5px] sm:rounded-[10px] tracking-wide opacity-90 mx-0.5 sm:mx-1 text-sm sm:text-base md:text-[0.7em] leading-relaxed"
            >
              {name}
            </span>
          ))}
          {" "}{about.fancySection.shoutoutText}
        </p>
      </section>

      {/* Spotlight */}
      {spotlight?.length > 0 ? (
        <DragScrollContainer className="spotlight relative h-auto min-h-[280px] sm:min-h-[350px] mb-[20px] py-[20px] sm:py-[40px] gap-[15px] sm:gap-[20px] overflow-x-auto overflow-y-hidden flex-nowrap flex flex-row select-none">
          {spotlight.map((news, index) => (
            <div
              key={index}
              className="featuredTile relative h-[260px] sm:h-[350px] w-[280px] sm:w-[400px] flex-shrink-0 flex flex-col items-center mt-[10px]"
            >
              <div
                className="h-[120px] sm:h-[150px] w-[90%] bg-cover bg-center rounded-[12px]"
                style={{ backgroundImage: `url(${news.image})` }}
              />
              <span className="w-full flex flex-row px-[10px] sm:px-[20px] items-center justify-between">
                <p className="featureName text-left text-base sm:text-[1.5em]">{news.title}</p>
              </span>
              <p className="featuredDescription text-sm sm:text-[1.35em] text-left px-[10px] sm:px-[20px] whitespace-normal break-words w-full overflow-hidden line-clamp-3">
                {news.description.slice(0, 150)}...
              </p>
            </div>
          ))}
        </DragScrollContainer>
      ) : (
        <ComingSoon title="Spotlight Coming Soon" />
      )}

      {/* Contact Banner */}
      <ContactBanner person={person} />
    </>
  );
}
