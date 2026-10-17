"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";

gsap.registerPlugin(ScrollTrigger);

const DEMO_MESSAGES = [
  { role: "user", text: "Explain quantum entanglement like I'm 10" },
  {
    role: "assistant",
    text: "Imagine you have two magic coins. You flip one and it lands on heads — instantly, the other one becomes tails, no matter how far apart they are. That's kind of what quantum entanglement is! Two tiny particles get \"linked\" together...",
  },
  { role: "user", text: "Can you make that into a short story?" },
  {
    role: "assistant",
    text: "Once upon a time, in a lab full of blinking lights, a scientist named Mira split a glowing particle in two. She sent one half to her friend Leo across the ocean...",
  },
];

const MODELS = ["Pollinations GPT", "Claude", "Gemini", "Mistral"];

export default function ChatShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".chat-container",
        { y: 80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
            toggleActions: "play none none none",
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Staggered message reveal
  useEffect(() => {
    if (visibleCount >= DEMO_MESSAGES.length) return;
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), 800);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  // Reset loop
  useEffect(() => {
    if (visibleCount < DEMO_MESSAGES.length) return;
    const timer = setTimeout(() => setVisibleCount(0), 4000);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <section ref={sectionRef} className="py-32 px-6 bg-gradient-to-b from-neutral-50 to-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-violet-600 mb-3 block">
          AI Chat
        </span>
        <h2 className="font-[family-name:var(--font-parkinsans)] text-4xl md:text-5xl font-extrabold text-neutral-900 mb-4">
          Chat with intelligence
        </h2>
        <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
          Conversations with artifacts, multiple models, rich formatting, and session history. Your AI workspace.
        </p>
      </motion.div>

      <div className="chat-container max-w-5xl mx-auto opacity-0">
        <div className="rounded-3xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-200/50 overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
            <div className="flex items-center gap-3">
              <Image src="/images/logo.png" alt="Elixpo" width={28} height={28} className="rounded-md" />
              <span className="font-semibold text-sm text-neutral-900">New conversation</span>
            </div>
            <div className="flex items-center gap-2">
              {MODELS.map((m) => (
                <span
                  key={m}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    m === "Pollinations GPT"
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 cursor-pointer"
                  }`}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Chat body */}
          <div className="p-6 min-h-[340px] flex flex-col gap-4">
            {DEMO_MESSAGES.slice(0, visibleCount).map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neutral-900 text-white rounded-br-md"
                      : "bg-neutral-100 text-neutral-800 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}

            {visibleCount > 0 && visibleCount < DEMO_MESSAGES.length && visibleCount % 2 === 0 && (
              <div className="flex justify-start">
                <div className="flex gap-1.5 px-5 py-3.5">
                  <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div className="px-6 pb-5">
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="flex-1 text-sm text-neutral-400">Message Elixpo...</span>
              <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
