"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const STACK = [
  { name: "Next.js 15", desc: "App Router + Turbopack", color: "bg-black text-white" },
  { name: "Cloudflare D1", desc: "Edge SQL database", color: "bg-orange-500 text-white" },
  { name: "Cloudflare KV", desc: "Global key-value cache", color: "bg-orange-400 text-white" },
  { name: "Cloudinary", desc: "Media storage & CDN", color: "bg-blue-600 text-white" },
  { name: "Pollinations AI", desc: "Text, audio & image gen", color: "bg-green-600 text-white" },
  { name: "Tailwind CSS v4", desc: "Utility-first styling", color: "bg-cyan-500 text-white" },
];

export default function TechStack() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const pills = containerRef.current.querySelectorAll(".tech-pill");
    gsap.fromTo(
      pills,
      { y: 30, opacity: 0, scale: 0.9 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        stagger: 0.08,
        ease: "back.out(1.7)",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      }
    );
  }, []);

  return (
    <section className="py-28 px-6 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-14"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-3 block">
          Built with
        </span>
        <h2 className="font-[family-name:var(--font-parkinsans)] text-3xl md:text-4xl font-extrabold text-neutral-900">
          Modern stack, edge-first
        </h2>
      </motion.div>

      <div ref={containerRef} className="max-w-3xl mx-auto flex flex-wrap justify-center gap-4">
        {STACK.map((item) => (
          <div
            key={item.name}
            className={`tech-pill flex items-center gap-3 px-5 py-3 rounded-2xl ${item.color} opacity-0 shadow-md hover:shadow-lg transition-shadow cursor-default`}
          >
            <span className="font-bold text-sm">{item.name}</span>
            <span className="text-xs opacity-80">{item.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
