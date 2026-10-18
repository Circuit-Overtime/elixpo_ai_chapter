"use client";

import { motion } from "motion/react";
import { PingPongVideo } from "./PingPongVideo";

interface LegalHeroProps {
  title: string;
  subtitle: string;
  video: string;
  updated: string;
  /** Tailwind height classes for the video section. */
  heightClass?: string;
}

export function LegalHero({
  title,
  subtitle,
  video,
  updated,
  heightClass = "h-[44vh] min-h-[320px]",
}: LegalHeroProps) {
  return (
    <section className={`relative ${heightClass} w-full overflow-hidden flex items-end select-none`}>
      <PingPongVideo
        src={video}
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black pointer-events-none" />
      <div className="absolute inset-0 noise-overlay opacity-30 pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto w-full px-6 pb-12">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="block text-[10px] uppercase tracking-widest font-mono text-primary/80 mb-3"
        >
          Last updated · {updated}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl md:text-6xl font-serif italic text-white mb-3 leading-tight"
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="text-sm sm:text-base text-[#DEDBC8]/70 font-mono max-w-xl leading-relaxed"
        >
          {subtitle}
        </motion.p>
      </div>
    </section>
  );
}
