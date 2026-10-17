"use client";

import { motion } from "motion/react";
import { ArrowRight, Rocket, MessagesSquare } from "lucide-react";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";

export function FeatureProjectCTA() {
  return (
    <section
      id="submit"
      className="bg-black text-[#E1E0CC] py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55vw] h-[55vw] bg-primary/[0.05] rounded-full blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-4xl mx-auto text-center bg-[#141414] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-10 sm:p-14 md:p-16 shadow-2xl noise-overlay"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] mb-6">
          <Rocket size={13} className="text-primary" />
          <span className="text-[10px] uppercase tracking-widest font-mono text-[#DEDBC8]/80">
            Build with us
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight text-white mb-4 leading-tight">
          Submit your project to be featured in the{" "}
          <span className="italic font-serif text-primary">Elixpo</span> ecosystem
        </h2>

        <p className="text-sm sm:text-base text-[#DEDBC8]/75 max-w-xl mx-auto mb-10 leading-relaxed">
          Building something open source? Share it with the chapter and it could be
          featured across our ecosystem - packages, tools, and community projects all welcome.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <motion.a
            href={ELIXPO_LINKS.submitProject}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 bg-[#DEDBC8] hover:bg-[#E1E0CC] text-black text-sm font-semibold rounded-full px-7 py-3.5 transition-all shadow-lg hover:shadow-[0_0_24px_rgba(222,219,200,0.18)]"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <span>Submit your project</span>
            <ArrowRight size={15} className="transform -rotate-45 group-hover:rotate-0 transition-transform duration-200" />
          </motion.a>

          <a
            href={ELIXPO_LINKS.discussions}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm font-medium text-[#DEDBC8]/80 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-6 py-3.5 transition-all"
          >
            <MessagesSquare size={15} className="text-primary/80" />
            <span>Join the GitHub Discussions</span>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
