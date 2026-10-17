import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageStructuredData } from "@/components/PageStructuredData";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo code of conduct",
  description: "Read Elixpo's participation, attribution, safety, reporting, enforcement, conflict-of-interest, anti-retaliation, and appeal standards for public work.",
  path: "/code-of-conduct",
});

export default function CodeOfConductPage() {
  const markdown = readFileSync(join(process.cwd(), "CODE_OF_CONDUCT.md"), "utf8").replace(/^# .+\n+/, "");
  return <main className="page-shell legal-page">
    <PageStructuredData name="Elixpo code of conduct" description="Participation, conduct, enforcement, and reporting expectations for Elixpo projects and community spaces." path="/code-of-conduct" />
    <header className="page-intro"><p className="eyebrow">Community standard / reviewed 17 October 2026</p><h1>Code of conduct</h1><p className="lede">This standard applies wherever people participate in Elixpo projects, Chapters, research, review, discussions, services, partnerships, and events.</p></header>
    <article className="prose prose-lg max-w-3xl prose-headings:tracking-tight prose-a:text-[#0b623c] prose-a:no-underline hover:prose-a:underline"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article>
  </main>;
}
