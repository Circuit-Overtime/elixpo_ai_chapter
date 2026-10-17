"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { SmartVideo } from "./SmartVideo";
import { VIDEOS } from "@/lib/media";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingHero() {
  return (
    <section className="relative min-h-[100svh] bg-black p-2.5 sm:p-4 md:p-6 select-none">
      <div className="relative min-h-[calc(100svh-1.25rem)] md:min-h-[720px] md:h-[calc(100svh-3rem)] overflow-hidden rounded-[1.25rem] md:rounded-[2rem] border border-white/10 bg-[#0b0b0b] shadow-2xl">
        <div className="absolute inset-0 bg-[url('/og-image.webp')] bg-cover bg-center opacity-35 md:opacity-45" />
        <SmartVideo
          src={VIDEOS.hero}
          desktopOnly
          priority
          poster="/og-image.webp"
          className="absolute inset-0 size-full object-cover opacity-65"
        />

        <div className="absolute inset-0 bg-black/35 md:bg-black/25" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/20 to-black/95" />
        <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-black/35 via-transparent to-black/20" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/45 to-transparent" />

        <div className="relative z-10 flex min-h-[calc(100svh-1.25rem)] md:min-h-[720px] md:h-full flex-col p-5 pt-20 sm:p-8 sm:pt-24 md:p-12 lg:p-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="flex items-center justify-between gap-4"
          >
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.2em] text-white/60">
              Open-source computer science ecosystem
            </p>
            <p className="hidden sm:block text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">
              Built in the open · Since 2023
            </p>
          </motion.div>

          <div className="flex flex-1 items-center justify-center py-10 sm:py-14 md:py-16">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.08, ease }}
              className="flex w-full max-w-5xl flex-col items-center text-center"
            >
              <p className="mb-4 text-[10px] font-mono uppercase tracking-[0.24em] text-[#E1E0CC]/65 sm:mb-5">
                Create · Research · Build
              </p>
              <h1 className="font-serif italic text-[#E1E0CC] text-[clamp(4.75rem,22vw,7rem)] md:text-[clamp(8rem,13vw,12rem)] leading-[0.72] tracking-[-0.055em] drop-shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
                Elixpo
              </h1>
              <p className="mt-7 max-w-xl text-sm leading-relaxed text-[#E1E0CC]/78 sm:text-base md:mt-9 md:max-w-2xl md:text-lg">
                <span className="md:hidden">Open-source tools for publishing, visual collaboration, research, identity, and developer workflows.</span>
                <span className="hidden md:inline">A community-built ecosystem connecting creative platforms, research experiments, shared infrastructure, and developer tooling.</span>
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:mt-8">
                <Link
                  href="/projects"
                  className="group inline-flex h-11 items-center gap-4 rounded-full bg-[#DEDBC8] pl-5 pr-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Explore
                  <span className="grid size-8 place-items-center rounded-full bg-black text-white">
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
                <a
                  href={ELIXPO_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-5 text-xs font-mono uppercase tracking-wider text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  GitHub <ArrowUpRight size={13} />
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
