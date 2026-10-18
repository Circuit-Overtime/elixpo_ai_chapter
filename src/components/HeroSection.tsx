"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { WordsPullUp } from "./WordsPullUp";
import { VIDEOS } from "@/lib/media";
import { PingPongVideo } from "./PingPongVideo";

export function HeroSection() {
  const containerEase = [0.16, 1, 0.3, 1] as const;

  return (
    <section className="h-screen w-full relative bg-black p-4 md:p-6 select-none">
      <div className="relative w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden bg-[#0a0a0a] border border-white/5 shadow-2xl">

        {/* Background video with photographic textured base backdrop */}
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-60"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=1024')" }}
          />
          <div className="absolute inset-0 bg-neutral-950/20 mix-blend-multiply" />
          <PingPongVideo
            src={VIDEOS.hero}
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none opacity-70"
          />
        </div>

        {/* Noise overlay and gradients */}
        <div className="absolute inset-0 noise-overlay opacity-[0.55] mix-blend-overlay pointer-events-none z-10" />
        {/* Overall dim + stronger top and bottom falloff for legibility */}
        <div className="absolute inset-0 bg-black/25 pointer-events-none z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/20 to-black/90 pointer-events-none z-10" />
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />

        {/* Ambient color pulse orbs for atmosphere */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] rounded-full bg-[#DEDBC8]/10 blur-[120px] pointer-events-none mix-blend-screen animate-pulse" />
        <div className="absolute bottom-1/4 right-[10%] w-[35vw] h-[35vw] rounded-full bg-[#44386e]/20 blur-[140px] pointer-events-none mix-blend-screen" />

        {/* Bottom Hero Content */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6 md:p-12 lg:p-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-end">

            {/* Left 8 columns - Heading */}
            <div className="md:col-span-8 flex flex-col justify-end">
              <div className="relative">
                <WordsPullUp
                  text="Elixpo"
                  logoSrc="/logos/logo.webp"
                  className="text-[14vw] sm:text-[22vw] md:text-[20vw] lg:text-[12vw] xl:text-[16vw] font-medium leading-[0.85] tracking-[-0.05em] text-[#E1E0CC] drop-shadow-[0_4px_30px_rgba(0,0,0,0.55)]"
                />
              </div>
            </div>

            {/* Right 4 columns - Paragraph + CTA button */}
            <div className="md:col-span-4 flex flex-col items-start gap-6 pb-2 sm:pb-4 md:pb-6">

              {/* Fade Up Paragraph */}
              <motion.div
                initial={{ y: 22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.9,
                  delay: 0.5,
                  ease: containerEase,
                }}
              >
                <p className="text-sm sm:text-base md:text-lg leading-relaxed text-[#E1E0CC]/80 max-w-[380px]">
                  An open source project series begun as a college initiative, growing into a collaborative computer science ecosystem of interconnected tools and platforms.
                </p>
              </motion.div>

              {/* Framer motion button */}
              <motion.div
                initial={{ y: 22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.9,
                  delay: 0.72,
                  ease: containerEase,
                }}
                className="w-full"
              >
                <motion.a
                  href="#features"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="group inline-flex items-center justify-between gap-6 pl-6 pr-1 bg-[#DEDBC8] text-black rounded-full py-1.5 font-medium text-sm border border-neutral-100/10 shadow-lg hover:shadow-primary/10 transition-all duration-300 w-[200px]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-black uppercase tracking-wider text-xs font-semibold">
                    Get Started
                  </span>
                  <motion.div
                    className="flex items-center justify-center bg-black rounded-full w-8 h-8 text-white"
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    whileHover={{ scale: 1.12 }}
                  >
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </motion.div>
                </motion.a>
              </motion.div>

            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
