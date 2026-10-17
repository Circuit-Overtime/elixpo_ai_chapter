import { getPersonContent } from "@/lib/content";
import { buildMemberMetadata } from "@/lib/seo";
import CopyEmail from "@/components/CopyEmail";
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
  return buildMemberMetadata({ person, section: "connect" });
}

export default async function ConnectPage({ params }) {
  const { person } = await params;
  const connectData = safeGet(person, "connect");

  if (!connectData || (!connectData.emails?.length && !connectData.socialLinks?.length)) {
    return <ComingSoon title="Connect Coming Soon" />;
  }

  return (
    <>
      <section className="mx-auto mt-4 w-full max-w-[1180px] px-1 sm:mt-8 sm:px-3">
        <div className="headingText flex min-h-[88px] w-full items-center justify-center rounded-[10px] bg-[#1B1B19] px-4 text-center opacity-95 sm:min-h-[130px] sm:rounded-[15px] md:min-h-[160px]">
          <h1 className="text-[clamp(2.8rem,11vw,8.5rem)] font-extrabold leading-[0.75] tracking-[3px] text-[#E2D9C8] sm:tracking-[5px]">
            {connectData.heading}
          </h1>
        </div>
        <p className="descriptionText mx-auto mt-4 max-w-[900px] text-center text-base leading-relaxed text-[#1B1B19] sm:mt-6 sm:text-xl md:text-[1.65rem]">
          {connectData.description}
        </p>
      </section>

      <section className={`mx-auto my-8 grid w-full max-w-[1180px] items-stretch gap-6 px-1 sm:my-12 sm:gap-8 sm:px-3 ${connectData.contactImage ? "lg:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.72fr)]" : ""}`}>
        <div className="order-2 flex min-w-0 flex-col justify-center rounded-[14px] border-2 border-[#222]/80 bg-[#e7ddc5]/70 p-4 sm:p-7 lg:order-1 lg:p-9">
          <div>
            <span className="fontNav text-xs uppercase tracking-[0.28em] text-[#725d49]">Direct correspondence</span>
            <h2 className="emailProvoke mt-2 text-2xl font-extrabold tracking-wide text-[#1B1B19] sm:text-[2rem] md:text-[2.5rem]">
              Mail me directly
            </h2>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:gap-4">
            {connectData.emails.map((email) => (
              <CopyEmail key={email} email={email} />
            ))}
          </div>

          <div className="mt-7 border-t border-[#222]/30 pt-6 sm:mt-9">
            <p className="descriptionText text-sm uppercase tracking-[0.16em] text-[#655240] sm:text-base">Elsewhere on the web</p>
            <div className="mt-4 flex flex-wrap gap-3 sm:gap-4">
              {connectData.socialLinks.map((social) => (
                <a
                  key={social.platform}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-[8rem] flex-1 items-center gap-3 rounded-full border border-[#222]/65 bg-[#d8cdb4] px-3 py-2.5 text-[#1B1B19] transition-colors duration-200 hover:bg-[#1B1B19] hover:text-[#E2D9C8] sm:px-4"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1B1B19] text-[#E2D9C8] group-hover:bg-[#E2D9C8] group-hover:text-[#1B1B19]">
                    <ion-icon name={social.icon} style={{ fontSize: "1.25rem" }} />
                  </span>
                  <span className="descriptionText text-base font-bold tracking-wide">{social.platform}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {connectData.contactImage && (
          <figure className="order-1 relative min-h-[220px] overflow-hidden rounded-[14px] border-2 border-[#222] bg-[#1B1B19] shadow-[8px_8px_0_rgba(34,34,34,0.2)] sm:min-h-[300px] lg:order-2 lg:min-h-[520px]">
            <img
              src={connectData.contactImage}
              alt={`${connectData.heading} contact portrait`}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center opacity-80 mix-blend-luminosity transition-transform duration-700 hover:scale-[1.025]"
            />
            <div className="pointer-events-none absolute inset-3 rounded-[8px] border border-[#E2D9C8]/55 sm:inset-4" />
            <figcaption className="descriptionText absolute inset-x-4 bottom-4 flex items-center justify-between gap-4 border-t border-[#E2D9C8]/45 pt-3 text-sm uppercase tracking-[0.14em] text-[#E2D9C8] sm:inset-x-6 sm:bottom-6">
              <span>Open to conversations</span>
              <span aria-hidden="true">↗</span>
            </figcaption>
          </figure>
        )}
      </section>

      <div className="mx-auto mt-5 w-full max-w-[1180px] border-t-2 border-[#222] sm:mt-10" />
    </>
  );
}
