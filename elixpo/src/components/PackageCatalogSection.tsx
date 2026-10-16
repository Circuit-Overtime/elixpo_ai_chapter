import { ArrowUpRight, Package, Terminal } from "lucide-react";
import { ELIXPO_PACKAGES } from "@/lib/packages";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";

export function PackageCatalogSection() {
  return (
    <section id="packages" aria-labelledby="packages-heading" className="bg-black text-[#E1E0CC] pt-12 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute hidden md:block bottom-0 left-1/3 w-[420px] h-[320px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="max-w-7xl mx-auto relative">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-3xl">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/70 block mb-3">Developer releases</span>
            <h2 id="packages-heading" className="text-3xl sm:text-5xl font-serif italic text-white mb-5">Official Elixpo packages</h2>
            <p className="text-sm sm:text-base text-[#DEDBC8]/65 leading-relaxed">
              Maintained npm packages for canvases, rich editing, publishing automation, identity integration, and link workflows. ClaudeOps is intentionally excluded because Elixpo does not maintain it.
            </p>
          </div>
          <a href={ELIXPO_LINKS.packages} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#DEDBC8]/65 hover:text-white transition-colors shrink-0">
            Linux package hub <ArrowUpRight size={14} />
          </a>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ELIXPO_PACKAGES.map((item) => (
            <article key={item.name} className="rounded-2xl bg-[#111] border border-white/10 p-6 flex flex-col min-h-[300px] hover:border-primary/30 transition-colors group">
              <div className="flex items-center justify-between mb-10">
                <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-mono text-white/45"><Package size={13} /> {item.type}</span>
                <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} on npm`} className="inline-flex items-center gap-2 text-white/40 group-hover:text-primary transition-colors">
                  <span aria-hidden="true" className="inline-flex h-5 items-center rounded-sm bg-[#CB3837] px-2 font-sans text-[10px] font-black tracking-[-0.08em] text-white shadow-sm">
                    npm
                  </span>
                  <ArrowUpRight size={16} />
                </a>
              </div>
              <h3 className="text-xl font-mono text-white mb-4 break-all">{item.name}</h3>
              <p className="text-sm text-[#DEDBC8]/65 leading-relaxed mb-7 flex-1">{item.description}</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {item.capabilities.map((capability) => <span key={capability} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-mono text-white/50">{capability}</span>)}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 flex items-center gap-2 min-w-0">
                <Terminal size={13} className="text-primary/70 shrink-0" />
                <code className="text-[11px] font-mono text-white/70 truncate">{item.install}</code>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
