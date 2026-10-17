"use client";

import { Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { VIDEOS } from "@/lib/media";
import { SmartVideo } from "./SmartVideo";

export function NewsletterSection() {
  return (
    <section className="min-h-[70svh] md:min-h-screen bg-black overflow-hidden relative flex flex-col justify-between select-none">
      {/* Background Video Player */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-[url('/og-image.webp')] bg-cover bg-center opacity-20 md:hidden" />
        <SmartVideo
          src={VIDEOS.contact}
          desktopOnly
          className="w-full h-full object-cover translate-y-[17%] pointer-events-none scale-105"
        />
        {/* Dark film tint overlays of the video */}
        <div className="absolute inset-0 bg-black/65 z-10" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent z-10" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black to-transparent z-10" />
      </div>

      {/* Decorative Top Gap */}
      <div className="h-8 md:h-16 relative z-10" />

      {/* Main "Coming soon" widget */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-4xl mx-auto w-full">
        {/* Animated Heading using Instrument Serif */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-8 tracking-tight font-normal leading-none font-serif"
        >
          Built for the <span className="italic">curious</span>
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="max-w-xl w-full space-y-6 flex flex-col items-center"
        >
          {/* Coming soon badge */}
          <div className="liquid-glass rounded-full px-6 py-3 flex items-center gap-2.5 border border-white/10 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm text-[#DEDBC8] font-mono uppercase tracking-[0.2em]">
              Newsletter · Coming soon
            </span>
          </div>

          {/* Subtitle text description */}
          <p className="text-[#DEDBC8]/70 text-xs sm:text-sm leading-relaxed px-4 max-w-md font-mono">
            We&rsquo;re putting the finishing touches on our newsletter. Subscriptions open soon - check back to stay in the loop on releases and insights.
          </p>
        </motion.div>
      </div>

      {/* Empty decorative bottom spacing */}
      <div className="pb-8 md:pb-16" />
    </section>
  );
}
