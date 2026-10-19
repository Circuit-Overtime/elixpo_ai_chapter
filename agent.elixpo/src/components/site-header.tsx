import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Elixpoo home">
        <Image src="/logo.png" alt="" width={42} height={42} priority />
        <span><strong>Elixpoo</strong><small>Project management agent</small></span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/#protocol">Protocol</Link>
        <Link href="/#distribution">Distribution</Link>
        <Link href="/docs">Documentation</Link>
      </nav>
      <a className="source-link" href="https://github.com/elixpo/agent.elixpo" target="_blank" rel="noreferrer">
        <Github size={17} /> Source <ArrowUpRight size={14} />
      </a>
    </header>
  );
}
