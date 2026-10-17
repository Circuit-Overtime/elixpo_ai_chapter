import { getPersonContent } from "@/lib/content";
import { buildMemberProfileJsonLd } from "@/lib/seo";
import ContactBanner from "@/components/ContactBanner";
import { SpotlightScroller } from "@/components/Animations";
import Masthead from "@/components/Masthead";
import DragScrollContainer from "@/components/DragScrollContainer";
import ComingSoon from "@/components/ComingSoon";

function safeGet(person, file) {
  try {
    return getPersonContent(person, file);
  } catch {
    return null;
  }
}

export default async function HomePage({ params }) {
  const { person } = await params;
  const home = safeGet(person, "home");
  const profile = safeGet(person, "profile");
  const spotlight = safeGet(person, "spotlight") || [];
  const recommendations = safeGet(person, "recommendations") || [];
  const profileJsonLd = buildMemberProfileJsonLd(person);

  if (!home) {
    return (
      <>
        <ComingSoon title="Coming Soon" />
        <ContactBanner person={person} />
      </>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* Identity-first masthead (members with a hero block) */}
      {home.hero && <Masthead hero={home.hero} person={person} memberName={profile?.name || profile?.siteName} />}

      {/* Spotlight Section */}
      <SpotlightScroller>
        {spotlight.map((news, index) => {
          const midIndex = Math.floor(spotlight.length / 2);
          return (
            <span key={index} className="contents">
              {index === midIndex && (
                <div id="spotlightCenter" className="featuredTileSpecial relative h-[280px] sm:h-[350px] w-[280px] sm:w-[450px] flex-shrink-0 flex flex-col items-center justify-center gap-3 sm:gap-0 mt-[10px] border-r-2 border-l-2 border-[#888] px-3 sm:px-5">
                  <span className="spotlightSwipeCue sm:hidden" aria-hidden="true">←</span>
                  <p className="featuredTileSpecialText text-2xl sm:text-[4em] font-extrabold tracking-wide relative">SPOTLIGHT!</p>
                  <span className="spotlightSwipeCue sm:hidden" aria-hidden="true">→</span>
                  <p className="featuredTileSpecialDesc hidden sm:block text-sm sm:text-[1.8em] font-thin relative text-center">These are the latest catches in my career</p>
                </div>
              )}
              {news.url ? (
                <a href={news.url} target="_blank" rel="noopener noreferrer" className="featuredTile relative h-[280px] sm:h-[350px] w-[250px] sm:w-[400px] flex-shrink-0 flex flex-col mt-[10px] px-[10px] sm:px-[20px] overflow-hidden group">
                  <div
                    className="featuredImage hoverScale group-hover:scale-[1.03] h-[120px] sm:h-[150px] w-full bg-cover bg-center rounded-[12px] transition-transform duration-300"
                    style={{ backgroundImage: `url(${news.image})` }}
                  />
                  <p className="featureName font-[Canopee,serif] text-base sm:text-[1.6em] tracking-wide mt-2 sm:mt-3 leading-tight truncate group-hover:text-[#B63B12] transition-colors">
                    {news.title}
                  </p>
                  <p className="featuredDescription text-xs sm:text-[1.1em] text-[#555] mt-1 leading-snug line-clamp-3 overflow-hidden">
                    {news.description.slice(0, 120)}...
                  </p>
                </a>
              ) : (
                <div className="featuredTile relative h-[280px] sm:h-[350px] w-[250px] sm:w-[400px] flex-shrink-0 flex flex-col mt-[10px] px-[10px] sm:px-[20px] overflow-hidden">
                  <div
                    className="featuredImage hoverScale h-[120px] sm:h-[150px] w-full bg-cover bg-center rounded-[12px]"
                    style={{ backgroundImage: `url(${news.image})` }}
                  />
                  <p className="featureName font-[Canopee,serif] text-base sm:text-[1.6em] tracking-wide mt-2 sm:mt-3 leading-tight truncate">
                    {news.title}
                  </p>
                  <p className="featuredDescription text-xs sm:text-[1.1em] text-[#555] mt-1 leading-snug line-clamp-3 overflow-hidden">
                    {news.description.slice(0, 120)}...
                  </p>
                </div>
              )}
            </span>
          );
        })}
      </SpotlightScroller>

      {/* Intro Section - only for members without a masthead hero block */}
      {!home.hero && (
      <section className="introSection relative mt-[10px] w-full flex flex-col border-b-2 border-[#111] p-2 sm:p-5">
        <div className="nameContainer text-base sm:text-6xl md:text-8xl lg:text-[12em] xl:text-[20em] w-full py-2 sm:py-0 sm:h-[250px] md:h-[300px] lg:h-[350px] flex justify-center items-center bg-[#1B1B19] text-center opacity-90 select-none rounded-[10px] sm:rounded-[15px] tracking-[2px] sm:tracking-[3px] md:tracking-[5px]">
          <p className="text-[#E2D9C8]">{home.intro.heroName}</p>
        </div>

        <div id="punchlineSection" className="punchlineSection w-full flex flex-col lg:flex-row p-4 sm:p-6 md:p-10 gap-5 lg:gap-10 mt-5">
          <div className="column1 flex flex-col w-full lg:w-1/2 h-full p-4 sm:p-6 md:p-10 lg:border-r-2 border-[#888]">
            <div className="text1">
              <p className="text-[#1B1B19] text-2xl sm:text-3xl md:text-4xl lg:text-6xl xl:text-[8em] font-extrabold">
                {home.intro.tagline}
              </p>
              <p className="text-[#1B1B19] text-2xl sm:text-3xl md:text-4xl lg:text-6xl xl:text-[8em]">
                {home.intro.taglineSuffix}
              </p>
            </div>
            <div
              className="image1 bg-cover bg-center h-[300px] sm:h-[400px] md:h-[500px] lg:h-[700px] w-full rounded-[15px] mt-5"
              style={{ backgroundImage: `url(${home.intro.images.portrait})` }}
            />
            <div className="description1">
              <p className="relative mt-10 text-sm sm:text-base md:text-lg lg:text-xl xl:text-[2em] tracking-[1px]">
                {home.intro.description}
              </p>
            </div>
          </div>
          <div className="column1 flex flex-col w-full lg:w-1/2 h-full">
            <div
              className="image2 bg-cover bg-center h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px] xl:h-[750px] w-full rounded-[15px] mt-5"
              style={{ backgroundImage: `url(${home.intro.images.landscape})` }}
            />
            {home.intro.highlights.map((hl, i) => (
              <div
                key={i}
                className="col2text relative mt-5 sm:mt-10 text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-[4em] font-semibold"
              >
                {hl}
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Behind Elixpo Section */}
      <section id="websiteSection" className="websiteSection relative mt-[10px] w-full flex flex-col border-b-2 border-[#111] p-2 sm:p-4 md:p-5">
        {/* Heading + seal */}
        <div className="behindHeader flex flex-row items-stretch w-full mt-10 gap-4 sm:gap-6">
          <div className="relative flex-1 flex items-center bg-[#1B1B19] opacity-90 select-none rounded-[10px] sm:rounded-[15px] px-5 sm:px-10 py-5 sm:py-8">
            <p className="text-[#E2D9C8] font-[Canopee,serif] tracking-[2px] text-3xl sm:text-5xl md:text-6xl lg:text-[5.5em] leading-none">
              BEHIND ELIXPO - HOW'S THE MENTALITY?
            </p>
          </div>
          <div
            className="stampImage bg-cover bg-center rounded-[10px] sm:rounded-[15px] border-2 border-[#222] h-auto w-22.5 sm:w-37.5 lg:w-50 shrink-0"
            style={{ backgroundImage: `url(${home.websiteSection.images.seal})` }}
          />
        </div>

        {/* Three story blocks */}
        <div className="behindGrid grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mt-8 sm:mt-12">
          {[
            { no: "01", label: "The Build", body: home.websiteSection.codeStory },
            { no: "02", label: "The Roadmap", body: home.websiteSection.futurePlans },
            { no: "03", label: "Credits", body: home.websiteSection.designedBy },
          ].map((block, i) => (
            <div key={i} className="behindBlock flex flex-col gap-3 lg:border-r-2 last:border-r-0 border-[#888]/40 lg:pr-6">
              <div className="flex items-baseline gap-3">
                <span className="fontNav text-[#888] text-2xl sm:text-3xl leading-none">{block.no}</span>
                <h3 className="text-[#1B1B19] font-extrabold uppercase tracking-[2px] text-base sm:text-lg md:text-xl">
                  {block.label}
                </h3>
              </div>
              <div className="h-0.5 bg-[#222] w-full" />
              <p className="behindBody text-[#333] text-sm sm:text-base md:text-[1.15em] leading-relaxed tracking-[0.3px] h-50 sm:h-60 overflow-y-auto pr-2">
                {block.body}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="behindCta flex justify-center mt-8 sm:mt-12">
          <a
            href={`/${person}/projects`}
            id="projectsRedirect"
            className="fontNav border-2 border-[#222] rounded-full px-8 sm:px-12 py-3 sm:py-4 text-base sm:text-lg md:text-[1.5em] tracking-[1px] text-[#1B1B19] flex justify-center items-center cursor-pointer transition-all duration-300 hover:bg-[#1B1B19] hover:text-[#E2D9C8] hover:scale-105"
          >
            Explore Projects
          </a>
        </div>
      </section>

      {/* Recommendations Section */}
      <DragScrollContainer className={`recommendationSection ${recommendations.length > 0 ? 'flex' : 'hidden'} relative h-auto min-h-[300px] sm:min-h-[400px] md:min-h-[450px] mb-[20px] px-3 sm:px-6 md:px-[40px] box-border py-[20px] sm:py-[40px] gap-[15px] sm:gap-[20px] overflow-x-auto overflow-y-hidden flex-nowrap flex-row mt-10 sm:mt-20`}>
        {recommendations.map((rec, index) => (
          <div
            key={index}
            className="recommendationCard shrink-0 relative h-[280px] sm:h-[350px] md:h-[400px] w-[300px] sm:w-[500px] md:w-[650px] border-4 border-[#222] rounded-[20px] sm:rounded-[25px] bg-[#E2D9C8] p-3 sm:p-5 justify-center items-center mr-3 sm:mr-5 cursor-pointer hover:brightness-[85%] transition-all duration-300 ease-in-out"
          >
            <div className="dottedContainer relative h-full w-full border-2 border-dashed border-[#222] rounded-[20px] sm:rounded-[30px] flex flex-col gap-3 sm:gap-5 p-4 sm:p-6 md:p-10 justify-between">
              <p className="quote text-[#333] text-xs sm:text-base md:text-[1.55em] whitespace-normal break-words underline decoration-1 decoration-[0.05rem] decoration-[#888] underline-offset-[4px] sm:underline-offset-[6px]">
                &ldquo;{rec.content.slice(0, 200)}...&rdquo;
              </p>
              <div className="attribution flex flex-row items-center gap-3 sm:gap-5">
                <div
                  className="userLogo relative bg-cover bg-center h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] md:h-[80px] md:w-[80px] border-2 border-[#222] rounded-[50%] grayscale sepia-[50%] shrink-0"
                  style={{ backgroundImage: `url(${rec.image})` }}
                />
                <div className="userInfo flex flex-col gap-0 sm:gap-1 leading-[20px] sm:leading-[30px]">
                  <div className="userName font-extrabold text-sm sm:text-base md:text-[1.4em] relative tracking-wide">{rec.name}</div>
                  <div className="userDesig font-thin text-xs sm:text-sm md:text-[1.1em] relative">{rec.designation}</div>
                </div>
              </div>
              <div
                className="stamp absolute bottom-[10px] right-[10px] sm:bottom-[20px] sm:right-[20px] h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] md:h-[80px] md:w-[80px] bg-cover bg-center"
                style={{ backgroundImage: `url(/assets/${person}/projects/stamp-2.webp)` }}
              />
            </div>
          </div>
        ))}
      </DragScrollContainer>

      {/* Tech Section */}
      <section className="techTracks overflow-hidden w-full flex flex-col mt-10 pt-5 pb-5 justify-center select-none overflow-y-hidden">
        <div className="row1 relative w-full flex flex-col lg:flex-row gap-5">
          <div className="row1col1 relative w-full flex flex-col sm:flex-row gap-4 sm:gap-10 items-start h-auto sm:h-[300px] md:h-[400px] lg:h-[500px]">
            <div
              className="image1row1col1techTracks hidden sm:block w-[80px] md:w-[100px] h-[250px] md:h-full bg-cover bg-center rounded-[15px]"
              style={{ backgroundImage: `url(${home.techSection.images.wand})` }}
            />
            <p className="text1row1col1techTracks h-auto sm:h-full w-full sm:w-auto flex items-center justify-center sm:justify-start text-[#1B1B19] text-4xl sm:text-3xl md:text-4xl lg:text-6xl xl:text-[13em] font-extrabold leading-tight sm:leading-[80px] md:leading-[120px] lg:leading-[160px] text-center sm:text-left">
              <span className="sm:hidden">THE TECHY SYNAPSE</span><span className="hidden sm:inline">THE<br />TECHY<br />SYNAPSE</span>
            </p>
          </div>
          <div
            className="row1col2 relative w-full h-[250px] sm:h-[300px] md:h-[400px] lg:h-[500px] bg-cover bg-center rounded-[15px]"
            style={{ backgroundImage: `url(${home.techSection.images.landscape})` }}
          />
        </div>
        <div className="row2 flex flex-col w-full mt-10">
          <div className="row2row1 flex flex-col lg:flex-row w-full gap-5 lg:gap-10">
            <div
              className="row1col2 relative w-full lg:w-[850px] h-[300px] sm:h-[350px] lg:h-auto lg:self-stretch border-2 border-[#222] bg-cover bg-center mix-blend-multiply rounded-[25px]"
              style={{ backgroundImage: `url(${home.techSection.images.banner})` }}
            />
            {home.techSection.reading ? (
              <div className="readingList h-full flex flex-col justify-center w-full gap-1">
                <p className="readingLabel text-[#1B1B19] font-extrabold uppercase tracking-[3px] text-xs sm:text-sm mb-3 sm:mb-5">
                  Currently Reading
                </p>
                {home.techSection.reading.map((book, i) => (
                  <div
                    key={i}
                    className="readingItem group flex flex-row items-start gap-4 sm:gap-6 border-t-2 border-[#222] py-4 sm:py-5 last:border-b-2 transition-colors duration-300 hover:bg-[#1B1B19]/[0.04]"
                  >
                    <span className="readingNo fontNav text-[#888] text-2xl sm:text-4xl md:text-[2.2em] leading-none shrink-0 w-[36px] sm:w-[56px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="readingBody flex flex-col flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3">
                        <p className="readingTitle font-[Canopee,serif] text-[#1B1B19] text-xl sm:text-2xl md:text-[1.9em] leading-tight tracking-[0.5px]">
                          {book.title}
                        </p>
                        {book.status && (
                          <span className="readingStatus shrink-0 self-start border-2 border-[#222] rounded-full bg-[#E2D9C8] text-[#1B1B19] uppercase tracking-[1px] text-[0.6rem] sm:text-xs font-extrabold px-3 py-1">
                            {book.status}
                          </span>
                        )}
                      </div>
                      {book.author && (
                        <p className="readingAuthor text-[#555] text-sm sm:text-base md:text-[1.1em] italic mt-0.5">
                          {book.author}
                        </p>
                      )}
                      {book.note && (
                        <p className="readingNote text-[#666] text-xs sm:text-sm md:text-[1em] tracking-[0.3px] mt-1">
                          {book.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : home.techSection.skillGroups ? (
              <div className="skillGroups h-full flex flex-col justify-center w-full gap-5 sm:gap-6">
                {home.techSection.skillGroups.map((group, i) => (
                  <div
                    key={i}
                    className="skillGroup flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-5 border-b border-[#888]/40 pb-4 last:border-b-0"
                  >
                    <p className="skillGroupLabel text-[#1B1B19] font-extrabold uppercase tracking-[2px] text-xs sm:text-sm md:text-[1em] w-full sm:w-40 md:w-50 shrink-0">
                      {group.category}
                    </p>
                    <div className="skillGroupItems flex flex-row flex-wrap gap-2 sm:gap-3">
                      {group.items.map((item, j) => (
                        <span
                          key={j}
                          className="skillTag border-2 border-[#222] rounded-full bg-[#E2D9C8] text-[#1B1B19] font-semibold text-xs sm:text-sm md:text-[1em] tracking-[0.5px] px-3 sm:px-4 py-1 sm:py-1.5"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text1row1col1techTracks h-full flex flex-row flex-wrap items-left text-[#1B1B19] leading-[40px] sm:leading-[60px] md:leading-[75px] font-extrabold text-left w-full gap-4 sm:gap-6 md:gap-10">
                {home.techSection.skills.map((skill, i) =>
                  skill.type === "icon" ? (
                    <img
                      key={i}
                      width={40}
                      height={40}
                      className="sm:w-[50px] sm:h-[50px] md:w-[60px] md:h-[60px]"
                      src={skill.src}
                      alt={skill.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <p key={i} className="font-extrabold text-sm sm:text-base md:text-lg lg:text-xl xl:text-[2em]">
                      {skill.label}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
          {home.hero && !home.techSection.reading && (
            <div className="readingList flex flex-col w-full gap-1 mt-12">
              <p className="readingLabel text-[#1B1B19] font-extrabold uppercase tracking-[3px] text-xs sm:text-sm mb-3 sm:mb-5">
                Currently Reading
              </p>
              <div className="readingItem flex flex-col items-center justify-center border-t-2 border-b-2 border-[#222] py-10 sm:py-14 gap-2">
                <span className="fontNav text-[#1B1B19] text-3xl sm:text-5xl md:text-[3.4em] leading-none tracking-[1px] opacity-20 select-none">
                  Coming Soon
                </span>
                <p className="text-[#888] text-xs sm:text-sm tracking-[3px] uppercase">
                  This section is being worked on
                </p>
              </div>
            </div>
          )}
          {home.techSection.explore ? (
            <div className="exploreSection w-full flex flex-col gap-6 mt-12">
              <div className="exploreGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {home.techSection.explore.map((card, i) => (
                  <a
                    key={i}
                    href={`/${person}/${card.href}`}
                    className="exploreCard group relative flex flex-col justify-between gap-6 sm:gap-8 border-2 border-[#222] rounded-[16px] sm:rounded-[20px] bg-[#E2D9C8] h-32 sm:h-36 md:h-40 p-5 sm:p-6 cursor-pointer overflow-hidden transition-all duration-300 hover:bg-[#1B1B19] hover:scale-[1.015]"
                  >
                    <span className="exploreCaption text-[#555] group-hover:text-[#bdb39c] uppercase tracking-[3px] text-xs sm:text-sm font-extrabold transition-colors duration-300">
                      {card.caption}
                    </span>
                    <div className="flex items-end justify-between gap-2">
                      <span className="exploreLabel fontNav text-[#1B1B19] group-hover:text-[#E2D9C8] text-4xl sm:text-5xl md:text-[3.4em] leading-none tracking-[1px] transition-colors duration-300 truncate min-w-0">
                        {card.label}
                      </span>
                      <ion-icon
                        name="arrow-forward-outline"
                        className="shrink-0 text-[#1B1B19] group-hover:text-[#E2D9C8] text-3xl sm:text-5xl transition-all duration-300 group-hover:translate-x-2"
                      />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="row2row2 flex flex-col lg:flex-row w-full gap-5 lg:gap-10 mt-10">
              <div className="relative websiteTextContainer text-3xl sm:text-6xl md:text-8xl lg:text-[15em] xl:text-[25em] w-full lg:w-[70%] flex justify-center items-center h-[100px] sm:h-[350px] md:h-[450px] bg-[#1B1B19] text-center opacity-90 select-none rounded-[10px] sm:rounded-[15px]">
                <p className="text-[#E2D9C8] tracking-wide font-extrabold">{home.techSection.subheading}</p>
              </div>
              <div className="descriptionRow2 w-full lg:w-[30%] h-[250px] sm:h-[350px] md:h-[450px] overflow-y-auto">
                <p className="text-xs sm:text-sm md:text-base lg:text-lg xl:text-[1.4em] opacity-90 text-[#333]">
                  {home.techSection.description}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contact Banner */}
      <ContactBanner person={person} />
    </>
  );
}
