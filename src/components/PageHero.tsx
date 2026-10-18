"use client";

import { motion } from "motion/react";
import { PingPongVideo } from "./PingPongVideo";

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  video: string;
  heightClass?: string;
}

/** Full-bleed video header for content routes (pulls under the floating navbar). */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  video,
  heightClass = "h-[58vh] min-h-[440px]",
}: PageHeroProps) {
  return (
    <section className={`relative ${heightClass} w-full overflow-hidden flex items-end select-none`}>
      <PingPongVideo
        src={video}
        className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/40 to-black pointer-events-none" />
      <div className="absolute inset-0 noise-overlay opacity-30 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 pb-12">
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="block text-[10px] uppercase tracking-widest font-mono text-primary/80 mb-3"
          >
            {eyebrow}
          </motion.span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl sm:text-6xl md:text-7xl font-serif italic text-white mb-4 leading-[0.95]"
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="text-base sm:text-lg text-[#DEDBC8]/75 max-w-2xl leading-relaxed"
        >
          {subtitle}
        </motion.p>
      </div>
    </section>
  );
}
