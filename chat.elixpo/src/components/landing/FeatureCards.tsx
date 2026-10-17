"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    title: "Elixpo Daily",
    description:
      "5 AI-curated news stories narrated with alternating voices, smooth transitions, and stunning visuals. Your morning briefing, reimagined.",
    href: "/news",
    gradient: "from-amber-400 to-orange-500",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
      </svg>
    ),
  },
  {
    title: "Elixpo Podcast",
    description:
      "Long-form AI podcasts with real storytelling — researched, scripted, and narrated with emotion, breathing, and charisma. 5 minutes of depth.",
    href: "/podcast",
    gradient: "from-violet-400 to-purple-500",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    title: "Discover",
    description:
      "Real-time weather with AI-generated summaries and beautiful watercolor visuals. Your local forecast told as a story.",
    href: "/discover",
    gradient: "from-cyan-400 to-blue-500",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        <circle cx="12" cy="12" r="5" />
      </svg>
    ),
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[0];
  index: number;
}) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { y: 80, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: cardRef.current,
          start: "top 85%",
          toggleActions: "play none none none",
        },
        delay: index * 0.15,
      }
    );
  }, [index]);

  return (
    <a
      ref={cardRef}
      href={feature.href}
      className="group relative flex flex-col p-8 rounded-3xl bg-white border border-neutral-200 hover:border-neutral-300 transition-all duration-300 hover:shadow-2xl hover:shadow-neutral-200/60 opacity-0"
    >
      {/* Icon */}
      <div
        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}
      >
        {feature.icon}
      </div>

      <h3 className="font-[family-name:var(--font-parkinsans)] text-xl font-bold text-neutral-900 mb-3">
        {feature.title}
      </h3>

      <p className="text-neutral-500 leading-relaxed text-sm flex-1">
        {feature.description}
      </p>

      {/* Arrow */}
      <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-neutral-900 group-hover:gap-3 transition-all duration-300">
        <span>Try it</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}

export default function FeatureCards() {
  return (
    <section id="features" className="relative py-32 px-6 bg-neutral-50/50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-amber-600 mb-3 block">
          Everything you need
        </span>
        <h2 className="font-[family-name:var(--font-parkinsans)] text-4xl md:text-5xl font-extrabold text-neutral-900">
          Three ways to stay informed
        </h2>
      </motion.div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}
