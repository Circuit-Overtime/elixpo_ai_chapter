"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "motion/react";
import { Star, ArrowRight, ExternalLink, ShieldCheck, Cpu } from "lucide-react";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";

const ECOSYSTEM_STARS = "85+";

// Logos: Simple Icons CDN tinted cream (#E1E0CC) so they read on the dark card.
// Pollinations isn't on Simple Icons, so we use its site favicon.
const COMPUTE_PARTNERS = [
  { name: "Pollinations", href: "https://pollinations.ai", logo: "https://www.google.com/s2/favicons?domain=pollinations.ai&sz=128" },
  { name: "Vercel", href: "https://vercel.com", logo: "https://cdn.simpleicons.org/vercel/E1E0CC" },
  { name: "Cloudflare", href: "https://cloudflare.com", logo: "https://cdn.simpleicons.org/cloudflare/E1E0CC" },
  { name: "DigitalOcean", href: "https://digitalocean.com", logo: "https://cdn.simpleicons.org/digitalocean/E1E0CC" },
  { name: "Firebase", href: "https://firebase.google.com", logo: "https://cdn.simpleicons.org/firebase/E1E0CC" },
];

// Compute partners as a shuffling deck - square cards stacked back-to-back,
// the front card cycling to the back like flipping through a photo album.
function ShufflingPartners() {
  const [order, setOrder] = useState<number[]>(() => COMPUTE_PARTNERS.map((_, i) => i));

  useEffect(() => {
    const id = setInterval(() => {
      setOrder((prev) => {
        const next = [...prev];
        next.push(next.shift()!); // front → back
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-40 h-40 sm:w-44 sm:h-44 mt-12 mb-6">
      {order.map((partnerIdx, depth) => {
        const partner = COMPUTE_PARTNERS[partnerIdx];
        return (
          <motion.a
            key={partner.name}
            href={partner.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={partner.name}
            className="absolute inset-0 rounded-2xl bg-[#1d1d1d] border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-3 overflow-hidden"
            animate={{
              y: depth * -6,
              x: depth * 7,
              scale: 1 - depth * 0.05,
              rotate: depth === 0 ? 0 : depth % 2 ? depth * 5 : -depth * 5,
              opacity: depth > 3 ? 0 : 1,
              zIndex: COMPUTE_PARTNERS.length - depth,
            }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-0 liquid-glass opacity-30 pointer-events-none" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={partner.logo}
              alt={`${partner.name} logo`}
              loading="lazy"
              className="relative h-12 w-12 object-contain"
            />
            <span className="relative text-[10px] font-mono uppercase tracking-wider text-[#DEDBC8]/85">
              {partner.name}
            </span>
          </motion.a>
        );
      })}
    </div>
  );
}

export function NominationSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  const heading = {
    tag: "Advancing Open Intelligence",
    line1: "Support Open Source.",
    line2: "Help us grow.",
  };

  const nominationSteps = [
    {
      step: "01",
      title: "Visit Portal",
      desc: "Go to stars.github.com/nominate and sign in with your GitHub account.",
    },
    {
      step: "02",
      title: "Set Nominee",
      desc: "Provide the primary developer's username: Circuit-Overtime.",
    },
    {
      step: "03",
      title: "Write a Note",
      desc: "Briefly explain how our collaborative open source projects supported you.",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  return (
    <section
      ref={containerRef}
      id="nominate"
      className="bg-black text-[#E1E0CC] py-20 px-4 sm:px-6 lg:px-8 relative select-none overflow-hidden"
    >
      {/* Background gradient pulses */}
      <div className="absolute hidden md:block top-1/4 right-[8%] w-[380px] h-[380px] bg-primary/[0.07] rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute hidden md:block bottom-0 left-[5%] w-[300px] h-[300px] bg-[#44386e]/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto">

        {/* Section headings */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="mb-12 flex flex-col items-start gap-1"
        >
          <motion.span
            variants={itemVariants}
            className="flex flex-wrap text-base sm:text-lg md:text-xl uppercase tracking-[0.15em] sm:tracking-[0.3em] text-[#DEDBC8]/60 font-mono font-medium mb-3"
          >
            {heading.tag}
          </motion.span>

          <div className="flex flex-col gap-1 items-start text-left">
            <motion.h2
              variants={itemVariants}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] tracking-tight text-white font-normal leading-tight"
            >
              {heading.line1}
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-2xl sm:text-3xl md:text-4xl italic font-serif text-[#DEDBC8]/60 leading-tight block"
            >
              {heading.line2}
            </motion.p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch mb-16">

          {/* Card 1: Nomination Panel (spans 2 columns on lg) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-2 bg-gradient-to-br from-[#161616] to-[#101010] border border-white/10 rounded-2xl p-6 sm:p-8 md:p-10 relative overflow-hidden flex flex-col justify-between hover:border-primary/25 transition-all duration-300 group"
          >
            {/* Decorative top flare */}
            <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary fill-primary/30" />
                  <span className="text-xs uppercase tracking-wider font-mono text-[#DEDBC8]">GitHub Stars Program</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-full font-mono text-[10px] group-hover:border-primary/30 transition-all duration-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white/55">Ecosystem Stars</span>
                  <span className="text-primary font-bold">{ECOSYSTEM_STARS} ★</span>
                </div>
              </div>

              {/* Hero star stat */}
              <div className="flex items-end gap-4 mb-6">
                <span className="text-6xl sm:text-7xl font-light text-white tracking-tight leading-none">
                  {ECOSYSTEM_STARS}
                </span>
                <div className="flex flex-col pb-1.5">
                  <span className="text-primary text-lg">★★★★★</span>
                  <span className="text-[11px] font-mono text-[#DEDBC8]/55 uppercase tracking-wider">stars and counting</span>
                </div>
              </div>

              <h3 className="text-2xl font-light text-white mb-4 leading-tight">
                Nominate <span className="text-primary italic font-serif font-semibold">Circuit-Overtime</span> for the GitHub Stars!
              </h3>

              <p className="text-xs sm:text-sm text-[#DEDBC8]/80 leading-relaxed mb-8 max-w-xl">
                If you believe in our mission of open development, Google Developer Groups (2025-2026) campus organizer initiatives, and making AI free, taking just 20 seconds to submit a nomination means the world to our small team.
              </p>

              {/* Steps */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-b border-white/[0.06] py-6 my-6">
                {nominationSteps.map((step, idx) => (
                  <div key={`nomination-step-item-${idx}`} className="flex flex-col gap-2 items-start">
                    <span className="text-xs font-mono text-primary font-bold">{step.step}</span>
                    <h4 className="text-xs font-semibold text-white/90 uppercase tracking-widest">{step.title}</h4>
                    <p className="text-xs text-[#DEDBC8]/70 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-xs font-mono text-neutral-400">Every nomination amplifies open-source!</span>
              <a
                href={ELIXPO_LINKS.nominate}
                target="_blank"
                rel="noopener noreferrer"
                className="group/btn inline-flex items-center gap-3 bg-[#DEDBC8] hover:bg-[#E1E0CC] text-black text-xs font-semibold uppercase tracking-wider rounded-full px-5 py-2.5 transition-all shadow-lg"
              >
                <span>Nominate Now</span>
                <ArrowRight size={14} className="transform -rotate-45 group-hover/btn:rotate-0 transition-transform duration-200" />
              </a>
            </div>
          </motion.div>

          {/* Card 2: Compute Partners (spans 1 column on lg) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="lg:col-span-1 bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between hover:border-primary/25 transition-all duration-300 group"
          >
            <div>
              <div className="flex justify-between items-start mb-6 gap-2 flex-wrap">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Cpu className="w-5 h-5 text-primary shrink-0" />
                </div>
                <span className="text-[10px] font-mono text-neutral-400">SUPPORTED DEVELOPMENT</span>
              </div>
              <h4 className="text-lg font-light text-white mb-3">Our Compute Partners</h4>
              <p className="text-xs text-[#DEDBC8]/75 leading-relaxed mb-6">
                Our AI workloads and infrastructure are powered by compute and platform support from:
              </p>

              {/* Partner logos - shuffling card deck */}
              <ShufflingPartners />
            </div>

            <div className="pt-6 mt-4 border-t border-white/10">
              <a
                href={ELIXPO_LINKS.fundingPolicy}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-1.5 text-primary/90 hover:text-primary transition-colors uppercase tracking-wider font-mono text-[10px]"
              >
                <span>Read the funding policy</span>
                <ExternalLink size={11} className="group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform duration-200" />
              </a>
            </div>
          </motion.div>

          {/* Card 3: License Protocol (spans 3 columns on lg) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-3 bg-gradient-to-r from-[#141414] to-[#101010] border border-white/10 rounded-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-primary/25 transition-all duration-300 group"
          >
            <div className="flex items-start gap-4 max-w-2xl">
              <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl text-primary flex-shrink-0 mt-1 group-hover:bg-primary/10 transition-all duration-300">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block mb-1">Artifact-specific licensing</span>
                <h4 className="text-lg font-light text-white mb-2">Clear terms for each kind of work</h4>
                <p className="text-xs text-[#DEDBC8]/75 leading-relaxed">
                  The owning repository or artifact record controls. New code, papers, hardware, datasets, models, and brand assets follow separate documented policies.
                </p>
              </div>
            </div>

            <div className="flex gap-6 font-mono text-[11px] text-white/60 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8 flex-shrink-0 w-full md:w-auto flex-wrap sm:flex-nowrap">
              <div>
                <span className="text-white/40 block text-[9px] uppercase tracking-wider">New code default</span>
                <span className="text-white/90 font-medium block mt-0.5">MIT</span>
              </div>
              <div>
                <span className="text-white/40 block text-[9px] uppercase tracking-wider text-primary">Papers and docs</span>
                <span className="text-primary font-bold block mt-0.5">CC BY 4.0</span>
              </div>
              <div>
                <span className="text-white/40 block text-[9px] uppercase tracking-wider">Hardware source</span>
                <span className="text-white/90 font-medium block mt-0.5">CERN-OHL-S-2.0</span>
              </div>
            </div>
          </motion.div>

        </div>

      </div>
    </section>
  );
}
