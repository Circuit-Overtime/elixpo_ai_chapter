import { ArrowUpRight } from "lucide-react";
import { PageStructuredData } from "@/components/PageStructuredData";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Contribute to Elixpo",
  description: "Choose an active Elixpo project, understand its contribution path, propose a Chapter, or discuss a Member Project with clear maintainer and release expectations.",
  path: "/contributing",
});

const routes = [
  { title: "Contribute to current work", text: "Choose an active dossier, follow its repository guide, and start with an issue or discussion tied to a concrete release outcome.", action: "Browse active projects", href: "/projects" },
  { title: "Propose a Chapter", text: "Bring active work and a release-sized goal. Be ready to maintain the work, prepare contribution paths, accept public review, and preserve attribution.", action: "Open a proposal discussion", href: "https://github.com/orgs/elixpo/discussions/new?category=show-and-tell" },
  { title: "Discuss a Member Project", text: "For independently led work seeking a durable relationship, begin with stewardship, custody, licensing, roadmap, and what Elixpo participation would change.", action: "Start the conversation", href: "https://github.com/orgs/elixpo/discussions" },
];

export default function ContributingPage() {
  return <main className="page-shell">
    <PageStructuredData name="Contribute to Elixpo" description="Contribution routes for active Elixpo projects, public Chapters, and independently maintained Member Projects." path="/contributing" />
    <header className="page-intro"><p className="eyebrow">Build with Elixpo</p><h1>Enter through the work,<br />not through a form.</h1><p className="lede">A good contribution path says what outcome matters, who reviews it, what evidence is needed, and how credit will survive the release. Choose the route that matches the work.</p></header>
    <section className="about-grid">{routes.map((route,index)=><article key={route.title}><span>{String(index+1).padStart(2,"0")}</span><h2>{route.title}</h2><p>{route.text}</p><a className="text-link" href={route.href} target={route.href.startsWith("http")?"_blank":undefined} rel={route.href.startsWith("http")?"noreferrer":undefined}>{route.action}<ArrowUpRight size={14}/></a></article>)}</section>
    <section className="partnership-rules"><div><p className="eyebrow">Minimum submission standard</p><h2>Active ownership before organizational custody.</h2></div><ul><li>A responsible maintainer and a public way to contact them</li><li>A concrete next release or research outcome</li><li>An explicit license and no unresolved ownership ambiguity</li><li>A runnable, reviewable, or reproducible baseline</li><li>Issues or tasks prepared for outside contributors</li><li>A truthful lifecycle and clear transfer or custody terms</li></ul></section>
  </main>;
}
