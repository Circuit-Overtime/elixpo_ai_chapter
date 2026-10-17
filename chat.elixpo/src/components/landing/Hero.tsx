"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";

const TYPING_WORDS = [
  "your daily news.",
  "AI podcasts.",
  "weather insights.",
  "stories that matter.",
  "the world, simplified.",
];

export default function Hero() {
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // GSAP entrance for the headline
  useEffect(() => {
    if (headlineRef.current) {
      gsap.fromTo(
        headlineRef.current,
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power3.out", delay: 0.3 }
      );
    }
  }, []);

  // Typing effect
  useEffect(() => {
    const word = TYPING_WORDS[wordIndex];
    const speed = isDeleting ? 40 : 80;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        setDisplayed(word.slice(0, displayed.length + 1));
        if (displayed.length + 1 === word.length) {
          setTimeout(() => setIsDeleting(true), 1800);
        }
      } else {
        setDisplayed(word.slice(0, displayed.length - 1));
        if (displayed.length === 0) {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % TYPING_WORDS.length);
        }
      }
    }, speed);

    return () => clearTimeout(timer);
  }, [displayed, isDeleting, wordIndex]);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 overflow-hidden bg-gradient-to-b from-white via-amber-50/30 to-white">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-amber-200/30 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-orange-200/20 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-6 px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold tracking-wide uppercase border border-amber-200"
      >
        Powered by Pollinations AI
      </motion.div>

      <h1
        ref={headlineRef}
        className="text-center font-[family-name:var(--font-parkinsans)] text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 max-w-4xl opacity-0"
      >
        Stay informed with
        <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
          {displayed}
        </span>
        <span className="animate-pulse text-amber-500">|</span>
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="mt-6 text-center text-lg sm:text-xl text-neutral-500 max-w-2xl leading-relaxed"
      >
        AI-generated news, podcasts, and weather — delivered fresh every day.
        Built with React, powered by Pollinations, hosted on Cloudflare.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="mt-10 flex flex-wrap gap-4 justify-center"
      >
        <a
          href="#features"
          className="px-8 py-3.5 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/10 hover:shadow-xl hover:shadow-neutral-900/20"
        >
          Explore Features
        </a>
        <a
          href="/news"
          className="px-8 py-3.5 rounded-full text-sm font-semibold bg-white text-neutral-900 border border-neutral-300 hover:border-neutral-400 transition-all"
        >
          Listen Now
        </a>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-neutral-400 tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="w-5 h-8 rounded-full border-2 border-neutral-300 flex items-start justify-center pt-1.5"
        >
          <div className="w-1 h-1.5 rounded-full bg-neutral-400" />
        </motion.div>
      </motion.div>
    </section>
  );
}
