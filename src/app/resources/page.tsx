import { ArrowUpRight } from "lucide-react";
import { PageStructuredData } from "@/components/PageStructuredData";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Open-source resources and policies", description: "Find Elixpo's canonical repository, discussions, contribution route, licensing policy, event partnership policy, code of conduct, and brand assets.", path: "/resources" });

const resources = [
  {title:"Organization on GitHub",href:"https://github.com/elixpo",text:"Repositories, issues, releases, and source history."},
  {title:"Elixpo Chapter",href:"https://github.com/elixpo/elixpo_chapter",text:"The master public build and release collection."},
  {title:"GitHub Discussions",href:"https://github.com/orgs/elixpo/discussions",text:"Proposals, decisions, questions, and community conversation."},
  {title:"Registry relationships",href:"https://github.com/elixpo/elixpo/blob/main/docs/policies/registry-relationships.md",text:"What Core, Chapter, Member, and Connected mean—and what they do not imply."},
  {title:"Licensing policy",href:"/licensing",text:"Artifact-specific defaults and the no-silent-relicensing rule."},
  {title:"Trademark and brand use",href:"https://github.com/elixpo/elixpo/blob/main/docs/policies/trademark-and-brand-use.md",text:"Accurate referential use, protected official identity, and permission boundaries."},
  {title:"People and profile consent",href:"https://github.com/elixpo/elixpo/blob/main/docs/policies/people-and-profile-consent.md",text:"Public-evidence profiles, explicit opt-in material, corrections, and removal."},
  {title:"Contributor record policy",href:"https://github.com/elixpo/elixpo/blob/main/docs/policies/contributor-records.md",text:"Stable record IDs, canonical verification, correction, dispute, altered-copy, and withdrawal rules."},
  {title:"Event partnerships",href:"/partnerships",text:"Request approved sticker material and review the visibility exchange, requirements, and independence rules."},
  {title:"Brand system",href:"/branding",text:"Public colours, typography guidance, canonical marks, project icons, and protected sticker previews."},
];

export default function ResourcesPage() {
  return <main className="page-shell">
    <PageStructuredData name="Elixpo resources and policies" description="Canonical repositories, contribution routes, licensing, brand, consent, partnership, conduct, and contributor-record policies." path="/resources" type="CollectionPage" />
    <header className="page-intro"><p className="eyebrow">Resources</p><h1>The public operating<br/>surface of Elixpo.</h1><p className="lede">The important links should explain who owns a decision, where the current policy lives, and which repository carries the work.</p></header>
    <section className="directory-grid">{resources.map((resource,index)=><article className="directory-card" key={resource.title}><div className="card-topline"><span>{String(index+1).padStart(2,"0")}</span></div><div><h3>{resource.title}</h3><p>{resource.text}</p></div><div className="card-actions"><a href={resource.href} target={resource.href.startsWith("http")?"_blank":undefined} rel={resource.href.startsWith("http")?"noreferrer":undefined}>Open resource <ArrowUpRight size={14}/></a></div></article>)}</section>
  </main>;
}
