import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, MessageCircle } from "lucide-react";
import { DISCUSSIONS_CONFIG, getFeaturedDiscussions, getLatestDiscussions } from "@/lib/discussions";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo community and public discussions",
  description: "Follow current Elixpo discussions, meet evidence-recognized contributors, and find the public routes for project work, research, questions, and Chapter proposals.",
  path: "/community",
});

const formatDate = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

export default async function CommunityPage() {
  const [featured, latest] = await Promise.all([getFeaturedDiscussions(), getLatestDiscussions()]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Elixpo community",
    description: metadata.description,
    url: "https://elixpo.com/community",
    ...(latest.length ? { mainEntity: { "@type": "ItemList", itemListElement: latest.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.title, url: item.url })) } } : {}),
  };

  return <main className="community-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="community-hero">
      <div><p className="eyebrow">Community / public work</p><h1>The commons is made of <em>visible decisions.</em></h1><p>Elixpo community life happens around active work: discussions that frame it, reviews that strengthen it, releases that credit it, and records that keep it discoverable.</p></div>
      <aside><span>CANONICAL FORUM</span><strong>GitHub Discussions</strong><p>Conversation remains on GitHub. Elixpo.com presents a cached public index and never exposes an organization token to the browser.</p><a href={DISCUSSIONS_CONFIG.organizationUrl} target="_blank" rel="noreferrer">Open the forum <ArrowUpRight size={14}/></a></aside>
    </header>

    <section className="community-routes section-wrap">
      <div className="about-grid"><article><span>01</span><h2>People</h2><p>Meet non-lead contributors through evidence-backed activity windows and outcomes, with member portfolios linked where available.</p><Link className="text-link" href="/contributors">Contributor record <ArrowRight size={14}/></Link></article><article><span>02</span><h2>Discussions</h2><p>Propose work, ask questions, document decisions, and follow open conversations in the organization forum.</p><a className="text-link" href={DISCUSSIONS_CONFIG.organizationUrl} target="_blank" rel="noreferrer">Open discussions <ArrowUpRight size={14}/></a></article><article><span>03</span><h2>Contribution</h2><p>Find the route for a current project contribution, a time-bounded Chapter, or an independently stewarded Member Project.</p><Link className="text-link" href="/contributing">Choose a route <ArrowRight size={14}/></Link></article></div>
    </section>

    <section className="community-routes section-wrap" aria-labelledby="response-ownership">
      <div className="section-heading split"><div><p className="eyebrow">Response ownership</p><h2 id="response-ownership">A public question has a named route.</h2></div><p>Responses are best-effort rather than a support-level agreement. Unanswered discussions enter a public review queue after {DISCUSSIONS_CONFIG.responsePolicy.unansweredReviewDays} days; the record stays visible even when no immediate answer is available.</p></div>
      <div className="about-grid"><article><span>PROJECTS / SERVICES</span><p>{DISCUSSIONS_CONFIG.responsePolicy.serviceAndProjectOwner}</p></article><article><span>RESEARCH</span><p>{DISCUSSIONS_CONFIG.responsePolicy.researchOwner}</p></article><article><span>CHAPTERS</span><p>{DISCUSSIONS_CONFIG.responsePolicy.chapterOwner}</p><a className="text-link" href={DISCUSSIONS_CONFIG.responsePolicy.escalationUrl} target="_blank" rel="noreferrer">Escalate an unanswered question <ArrowUpRight size={14}/></a></article></div>
    </section>

    {featured.length > 0 && <section className="discussion-stream section-wrap" aria-labelledby="featured-discussions">
      <div className="section-heading split"><div><p className="eyebrow">Editorial selection</p><h2 id="featured-discussions">Featured discussions.</h2></div><p>These conversations are selected explicitly in Elixpo’s canonical moderation record. Placement is editorial and is not determined by reactions, comment volume, or recency.</p></div>
      <div className="discussion-list">{featured.map((item, index) => <article key={item.number}>
        <span className="discussion-index">{String(index + 1).padStart(2,"0")}</span>
        <div className="discussion-copy"><div><span>{item.category}</span>{item.answered && <b><CheckCircle2 size={13}/> Answered</b>}</div><h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3><p>Started by <a href={item.authorUrl} target="_blank" rel="noreferrer">@{item.author}</a> · updated {formatDate(item.updatedAt)}</p></div>
        <div className="discussion-meta"><span><MessageCircle size={14}/>{item.comments} {item.comments === 1 ? "reply" : "replies"}</span><a href={item.url} target="_blank" rel="noreferrer">Read on GitHub <ArrowUpRight size={14}/></a></div>
      </article>)}</div>
    </section>}

    <section className="discussion-stream section-wrap" aria-labelledby="latest-discussions">
      <div className="section-heading split"><div><p className="eyebrow">Latest discussions</p><h2 id="latest-discussions">Current public conversation.</h2></div><p>This feed is ordered by recent activity and refreshed every fifteen minutes. Recency does not imply Elixpo endorsement or featured status.</p></div>
      {latest.length ? <div className="discussion-list">{latest.map((item, index) => <article key={item.number}>
        <span className="discussion-index">{String(index + 1).padStart(2,"0")}</span>
        <div className="discussion-copy"><div><span>{item.category}</span>{item.answered && <b><CheckCircle2 size={13}/> Answered</b>}</div><h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3><p>Started by <a href={item.authorUrl} target="_blank" rel="noreferrer">@{item.author}</a> · updated {formatDate(item.updatedAt)}</p></div>
        <div className="discussion-meta"><span><MessageCircle size={14}/>{item.comments} {item.comments === 1 ? "reply" : "replies"}</span><a href={item.url} target="_blank" rel="noreferrer">Read on GitHub <ArrowUpRight size={14}/></a></div>
      </article>)}</div> : <div className="discussion-fallback"><MessageCircle size={28}/><h3>Open the canonical discussion record.</h3><p>{DISCUSSIONS_CONFIG.moderation.fallbackMessage}</p><a className="text-link" href={DISCUSSIONS_CONFIG.organizationUrl} target="_blank" rel="noreferrer">Browse GitHub Discussions <ArrowUpRight size={14}/></a></div>}
      <p className="registry-date">Discussion source verified {DISCUSSIONS_CONFIG.lastVerified}. Featured discussions remain unpublished until an explicit editorial selection is recorded.</p>
    </section>
  </main>;
}
