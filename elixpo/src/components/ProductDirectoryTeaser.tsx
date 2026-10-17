import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ECOSYSTEM_PRODUCTS } from "@/lib/catalog";

export function ProductDirectoryTeaser() {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {ECOSYSTEM_PRODUCTS.map((product, index) => (
          <article key={product.slug} className="rounded-2xl bg-[#111] border border-white/10 p-6 min-h-[270px] flex flex-col hover:border-primary/30 transition-colors group">
            <div className="flex justify-between items-start gap-4 mb-8">
              <span
                aria-hidden="true"
                className="size-12 rounded-xl border border-white/10 bg-white/[0.04] bg-center bg-cover shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
                style={{ backgroundImage: `url("${product.icon}")` }}
              />
              <span className="text-[10px] font-mono text-white/30">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-primary/70 mb-3">{product.eyebrow}</span>
            <h3 className="text-2xl font-serif italic text-white mb-3">{product.name}</h3>
            <p className="text-sm text-[#DEDBC8]/65 leading-relaxed flex-1 mb-7">{product.shortDescription}</p>
            <div className="flex items-center gap-4">
              <Link href={`/projects/${product.slug}`} className="inline-flex items-center gap-1.5 text-xs text-white hover:text-primary transition-colors">
                Learn more <ArrowRight size={12} />
              </Link>
              <a href={product.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${product.name}`} className="text-white/35 hover:text-white transition-colors">
                <ArrowUpRight size={14} />
              </a>
            </div>
          </article>
        ))}
      </div>
      <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-[#DEDBC8]/65 hover:text-white transition-colors">
        Explore the full ecosystem <ArrowRight size={14} />
      </Link>
    </div>
  );
}
