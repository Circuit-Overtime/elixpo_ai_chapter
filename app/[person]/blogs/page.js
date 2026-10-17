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
  return buildMemberMetadata({ person, section: "blogs" });
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function BlogsPage({ params }) {
  const { person } = await params;
  const blogs = safeGet(person, "blogs");

  if (!blogs || !blogs.posts?.length) {
    return (
      <>
        <ComingSoon title="Writing Coming Soon" />
        <ContactBanner person={person} />
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <section className="blogsHeader mt-8 sm:mt-12 px-3 sm:px-6 md:px-10 flex flex-col w-full">
        <h1 className="font-[Canopee,serif] text-[#1B1B19] text-4xl sm:text-6xl md:text-[5em] leading-none tracking-[1px]">
          {blogs.heading}
        </h1>
        <p className="mt-4 sm:mt-5 text-[#444] italic text-base sm:text-xl md:text-[1.6em] max-w-[800px] leading-snug">
          {blogs.description}
        </p>
        <div className="mt-5 sm:mt-6 flex items-center gap-3">
          <span className="fontNav text-[#888] text-sm sm:text-base tracking-[1px]">
            {blogs.posts.length} posts
          </span>
          <span className="flex-1 h-0.5 bg-[#888]/30" />
          {blogs.home && (
            <a
              href={blogs.home}
              target="_blank"
              rel="noopener noreferrer"
              className="fontNav text-[#B63B12] text-sm sm:text-base tracking-[1px] hover:underline whitespace-nowrap"
            >
              blogs.elixpo.com →
            </a>
          )}
        </div>
      </section>

      {/* Post list */}
      <section className="blogsList mt-6 sm:mt-10 px-3 sm:px-6 md:px-10 flex flex-col w-full">
        {blogs.posts.map((post, i) => (
          <a
            key={i}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="blogRow group flex flex-col gap-2 border-t-2 border-[#222] py-5 sm:py-7 last:border-b-2 transition-colors duration-300 hover:bg-[#1B1B19]/[0.04]"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
              <h2 className="blogTitle font-[Canopee,serif] text-[#1B1B19] text-2xl sm:text-3xl md:text-[2.2em] leading-tight tracking-[0.5px] group-hover:text-[#B63B12] transition-colors duration-300">
                {post.title}
                {post.source && (
                  <span className="fontNav align-middle ml-2 text-[#888] text-xs sm:text-sm tracking-[1px] whitespace-nowrap">
                    &#8599; {post.source}
                  </span>
                )}
              </h2>
              <span className="blogDate fontNav shrink-0 text-[#888] text-sm sm:text-base tracking-[1px]">
                {formatDate(post.date)}
              </span>
            </div>
            {post.excerpt && (
              <p className="blogExcerpt text-[#555] text-sm sm:text-base md:text-[1.15em] leading-relaxed max-w-[850px]">
                {post.excerpt}
              </p>
            )}
            <div className="flex items-center justify-between mt-1">
              <div className="flex flex-wrap gap-2">
                {post.tags?.map((tag, j) => (
                  <span
                    key={j}
                    className="blogTag border border-[#222]/40 rounded-full text-[#555] text-xs tracking-[0.5px] px-3 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <span className="blogArrow text-[#B63B12] text-lg sm:text-xl group-hover:translate-x-1 transition-transform duration-300">
                {post.source ? `Read on ${post.source} ↗` : "Read on LixBlogs →"}
              </span>
            </div>
          </a>
        ))}
      </section>

      {/* Contact Banner */}
      <ContactBanner person={person} />
    </>
  );
}
