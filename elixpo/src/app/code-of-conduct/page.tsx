import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function CodeOfConductPage() {
  const markdown = readFileSync(join(process.cwd(), "CODE_OF_CONDUCT.md"), "utf8");
  return <main className="page-shell legal-page"><header className="page-intro"><p className="eyebrow">Community standard</p><h1>Code of conduct</h1><p className="lede">The conduct standard applies wherever people participate in Elixpo work, review, discussion, events, and community spaces.</p></header><article className="prose prose-lg max-w-3xl prose-headings:tracking-tight prose-a:text-[#0b623c] prose-a:no-underline hover:prose-a:underline"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article></main>;
}
