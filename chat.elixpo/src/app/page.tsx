"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { FlipWords } from "@/components/aceternity/FlipWords";
import { TracingBeam } from "@/components/aceternity/TracingBeam";
import { MovingBorderButton } from "@/components/aceternity/MovingBorderButton";
import { BackgroundGradientAnimation } from "@/components/aceternity/BackgroundGradientAnimation";
import { Boxes } from "@/components/aceternity/BackgroundBoxes";
import { Spotlight } from '@/components/aceternity/Spotlight';
/* ────────────────────── FAQ Data ────────────────────── */
const faqItems = [
  {
    q: "What is Elixpo Chat?",
    a: "Elixpo Chat is a next-generation AI interface that combines cutting-edge language models with a beautifully designed conversational experience. It supports text, images, file uploads, and web search -- all in one seamless interface.",
  },
  {
    q: "Which AI models does it support?",
    a: "Elixpo Chat works with GPT-4o, Claude, Gemini, and more. You can switch between models mid-conversation to get the best response for your specific task.",
  },
  {
    q: "Is my data private and secure?",
    a: "Absolutely. We use end-to-end encryption for all conversations, your data is never used to train models, and you can delete your history at any time. Privacy is not optional -- it is foundational.",
  },
  {
    q: "Can I use it for my team or business?",
    a: "Yes. Elixpo offers workspace plans with shared conversation threads, role-based access, and API integrations so your entire team can leverage AI collaboratively.",
  },
  {
    q: "How is the design and developer handoff?",
    a: "Every component is built with proper naming conventions and production-grade code. The interface is fully responsive, accessible, and optimized for performance.",
  },
];

/* ─── Scroll-triggered animation hook ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── FAQ Item ─── */
function FaqItem({ q, a, idx }: { q: string; a: string; idx: number }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left border-b border-slate-200 py-5 group cursor-pointer"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs tracking-wider text-slate-400">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="text-[15px] font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
            {q}
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 pt-3 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="text-sm text-slate-500 leading-relaxed pl-10 pr-8">{a}</p>
      </div>
    </button>
  );
}

/* ════════════════════ LANDING PAGE ════════════════════ */
export default function LandingPage() {
  const hero = useInView(0.1);
  const features = useInView(0.1);
  const faq = useInView(0.1);
  const cta = useInView(0.1);

  return (
    <div className="relative min-h-screen bg-white text-slate-900 overflow-hidden selection:bg-sky-100">
      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative min-h-screen flex flex-col overflow-hidden bg-gradient-to-b from-sky-500 via-violet-400 to-white">
        <Spotlight
  className="-top-40 left-0 md:left-60 md:-top-20"
  fill="white"
/>

<Spotlight
  className="top-10 left-full h-[80vh] w-[50vw]"
  fill="#38bdf8"
/>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <Boxes className="opacity-35" />
        </div>
        {/* Watermark */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-violet-400/20 blur-3xl animate-pulse" />

          <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-sky-400/20 blur-3xl animate-pulse [animation-delay:1s]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] z-0 select-none">
          
          <span
            className="text-[28vw] font-bold tracking-tighter leading-none text-white"
            style={{ fontFamily: "system-ui" }}
          >
            ELIXPO
          </span>
          
          +
        </div>

        {/* Subtle dot grid on hero */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Navigation */}
        <header className="relative z-20">
          <nav className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-6 flex items-center justify-between">
            <Link
              href="/"
              className="text-xl font-bold tracking-wider uppercase text-white drop-shadow-sm"
            >
              Elixpo
            </Link>
            <ul className="hidden md:flex items-center gap-8 list-none">
              <li>
                <a
                  href="#features"
                  className="font-mono text-xs font-bold tracking-[0.05em] text-white/80 hover:text-white transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="font-mono text-xs font-bold tracking-[0.05em] text-white/80 hover:text-white transition-colors"
                >
                  FAQ
                </a>
              </li>
              <li>
                <Link
                  href="/chat/new"
                  className="font-mono text-xs font-bold tracking-[0.05em] text-sky-700 bg-white px-5 py-3 hover:bg-sky-50 transition-colors shadow-md"
                  style={{
                    clipPath:
                      "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                  }}
                >
                  Start Chatting
                </Link>
              </li>
            </ul>
          </nav>
        </header>

        {/* Hero Content */}

        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 pb-24">
          <div
            ref={hero.ref}
            className={`max-w-3xl text-center transition-all duration-[1000ms] ease-out ${
              hero.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-4 py-1.5 mb-8">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="font-mono text-xs font-bold tracking-[0.1em] text-white/90 uppercase">
                Multi-model AI · Live
              </span>
            </div>
            <h1
              className="text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-[-0.03em] leading-[1.05] mb-6 text-white drop-shadow-lg"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              Build Smarter Conversations with
              <br />
              <FlipWords
                words={[
                  "Elixpo",
                  "Powerful",
                  "Multi-Model",
                  "Versatile",
                ]}
                className="text-white/60"
              />{" "}
              AI
            </h1>
            <p
              className="text-white/80 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed"
              style={{ fontFamily: "system-ui" }}
            >
              A modern AI interface designed for speed, privacy, and
              unparalleled multimodal capabilities. Your conversations,
              elevated.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/chat/new"
                className="font-mono text-xs font-bold tracking-[0.05em] uppercase bg-white text-sky-700 px-7 py-4 hover:bg-sky-50 transition-colors shadow-lg"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                }}
              >
                Start Chatting
              </Link>
              <a
                href="#features"
                className="font-mono text-xs font-bold tracking-[0.05em] uppercase text-white border-2 border-white/40 px-7 py-4 hover:border-white hover:bg-white/10 transition-all"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                }}
              >
                Explore Features
              </a>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative z-10 border-t border-white/20 overflow-hidden bg-white/10 backdrop-blur-sm">
          <div className="flex animate-[ticker_20s_linear_infinite] whitespace-nowrap py-3">
            {Array(2)
              .fill(null)
              .map((_, i) => (
                <div key={i} className="flex items-center gap-6 px-3 shrink-0">
                  {[
                    "Multi-model AI",
                    "GPT-4o & Claude",
                    "File uploads",
                    "Voice input",
                    "Web search",
                    "Privacy-first",
                    "Real-time streaming",
                    "Markdown rendering",
                  ].map((t) => (
                    <React.Fragment key={`${i}-${t}`}>
                      <span className="font-mono text-xs font-bold tracking-wide text-white/70 uppercase">
                        {t}
                      </span>
                      <span className="text-white/40">&bull;</span>
                    </React.Fragment>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <main className="relative z-10 bg-white">
        {/* Section Divider */}
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-8">
          <div className="h-px bg-slate-100" />
        </div>

        {/* ══════ CAPABILITIES SECTION ══════ */}
        <section
          className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-20"
          id="features"
        >
          <div
            ref={features.ref}
            className={`transition-all duration-[800ms] ease-out ${features.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          >
            {/* Section badge */}
            <div className="flex items-center gap-2 mb-6">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="4" height="4" fill="#0ea5e9" />
                <rect x="10" y="4" width="4" height="4" fill="#0ea5e9" />
                <rect x="16" y="4" width="4" height="4" fill="#0ea5e9" />
                <rect x="4" y="10" width="4" height="4" fill="#0ea5e9" />
                <rect x="10" y="10" width="4" height="4" fill="#0ea5e9" />
                <rect x="4" y="16" width="4" height="4" fill="#0ea5e9" />
              </svg>
              <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-slate-400">
                Capabilities
              </span>
            </div>

            <h2
              className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-[-0.03em] leading-[1.1] mb-5 text-slate-900"
              style={{ fontFamily: "system-ui" }}
            >
              Designed by AI Experts for
              <br />
              <span className="text-slate-400">
                Next-Generation Interfaces.
              </span>
            </h2>
            <p className="text-slate-500 max-w-xl text-base leading-relaxed mb-14">
              We are a team of AI engineers and product designers passionate
              about building intelligent tools. Built from real-world use cases,
              tested, flexible, and designed for infinite scalability.
            </p>

            {/* ── Architecture Diagram ── */}
            <div className="mb-16 flex justify-center">
              <div className="w-full max-w-2xl bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
                <svg
                  viewBox="0 0 560 220"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full"
                >
                  <defs>
                    <linearGradient
                      id="trail-h1-light"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0" />
                      <stop
                        offset="70%"
                        stopColor="#0ea5e9"
                        stopOpacity="0.4"
                      />
                      <stop
                        offset="100%"
                        stopColor="#0ea5e9"
                        stopOpacity="0.9"
                      />
                    </linearGradient>
                    <linearGradient
                      id="trail-h2-light"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
                      <stop
                        offset="70%"
                        stopColor="#22c55e"
                        stopOpacity="0.4"
                      />
                      <stop
                        offset="100%"
                        stopColor="#22c55e"
                        stopOpacity="0.9"
                      />
                    </linearGradient>
                    <path id="path-user-elixpo-l" d="M130,110 L193,110" />
                    <path id="path-elixpo-resp-l" d="M353,110 L423,110" />
                    <path id="path-cloud-down-l" d="M273,30 L273,55" />
                  </defs>

                  {/* Machine boundary */}
                  <rect
                    x="5"
                    y="55"
                    width="550"
                    height="112"
                    fill="none"
                    stroke="rgba(100,116,139,0.2)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <rect x="15" y="48" width="96" height="14" fill="#f8fafc" />
                  <text
                    x="20"
                    y="58"
                    fontFamily="monospace"
                    fontSize="6"
                    letterSpacing="2"
                    fill="rgba(100,116,139,0.5)"
                  >
                    YOUR DEVICE
                  </text>

                  {/* YOUR PROMPT */}
                  <rect
                    x="20"
                    y="85"
                    width="110"
                    height="50"
                    fill="white"
                    stroke="rgba(100,116,139,0.2)"
                    strokeWidth="1"
                    rx="2"
                  />
                  <text
                    x="75"
                    y="106"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="7"
                    letterSpacing="1.5"
                    fill="rgba(71,85,105,0.7)"
                  >
                    YOUR PROMPT
                  </text>
                  <text
                    x="75"
                    y="118"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5.5"
                    letterSpacing="1"
                    fill="rgba(100,116,139,0.5)"
                  >
                    TEXT · FILES · VOICE
                  </text>

                  {/* Connector: Prompt → ELIXPO */}
                  <line
                    x1="130"
                    y1="110"
                    x2="193"
                    y2="110"
                    stroke="rgba(14,165,233,0.15)"
                    strokeWidth="1"
                  />
                  <line
                    x1="130"
                    y1="110"
                    x2="193"
                    y2="110"
                    stroke="url(#trail-h1-light)"
                    strokeWidth="2"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.2;0.8;0.2"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </line>
                  <rect x="-1.5" y="-1.5" width="3" height="3" fill="#0ea5e9">
                    <animateMotion dur="2s" repeatCount="indefinite">
                      <mpath href="#path-user-elixpo-l" />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      keyTimes="0;0.1;0.8;1"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>

                  {/* ELIXPO core */}
                  <rect
                    x="193"
                    y="63"
                    width="160"
                    height="94"
                    fill="white"
                    stroke="rgba(14,165,233,0.35)"
                    strokeWidth="1.5"
                    rx="2"
                  />
                  <text
                    x="274.5"
                    y="93"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="12"
                    letterSpacing="3"
                    fill="#0c4a6e"
                  >
                    ELIXPO
                  </text>
                  <text
                    x="273"
                    y="109"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5.5"
                    letterSpacing="1.5"
                    fill="#0ea5e9"
                  >
                    MULTI-MODEL AI
                  </text>
                  <line
                    x1="210"
                    y1="130"
                    x2="336"
                    y2="130"
                    stroke="rgba(100,116,139,0.12)"
                    strokeWidth="0.5"
                  />
                  <text
                    x="230"
                    y="145"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5"
                    letterSpacing="1"
                    fill="rgba(71,85,105,0.5)"
                  >
                    GPT-4o
                  </text>
                  <text
                    x="273"
                    y="145"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5"
                    letterSpacing="1"
                    fill="rgba(71,85,105,0.5)"
                  >
                    CLAUDE
                  </text>
                  <text
                    x="316"
                    y="145"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5"
                    letterSpacing="1"
                    fill="rgba(71,85,105,0.5)"
                  >
                    GEMINI
                  </text>

                  {/* Connector: ELIXPO → Response */}
                  <line
                    x1="353"
                    y1="110"
                    x2="423"
                    y2="110"
                    stroke="rgba(34,197,94,0.15)"
                    strokeWidth="1"
                  />
                  <line
                    x1="353"
                    y1="110"
                    x2="423"
                    y2="110"
                    stroke="url(#trail-h2-light)"
                    strokeWidth="2"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.2;0.8;0.2"
                      dur="2s"
                      begin="1s"
                      repeatCount="indefinite"
                    />
                  </line>
                  <rect x="-1.5" y="-1.5" width="3" height="3" fill="#22c55e">
                    <animateMotion dur="2s" begin="1s" repeatCount="indefinite">
                      <mpath href="#path-elixpo-resp-l" />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      keyTimes="0;0.1;0.8;1"
                      dur="2s"
                      begin="1s"
                      repeatCount="indefinite"
                    />
                  </rect>

                  {/* RESPONSE */}
                  <rect
                    x="423"
                    y="85"
                    width="120"
                    height="50"
                    fill="white"
                    stroke="rgba(100,116,139,0.2)"
                    strokeWidth="1"
                    rx="2"
                  />
                  <text
                    x="483"
                    y="106"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="7"
                    letterSpacing="1.5"
                    fill="rgba(71,85,105,0.7)"
                  >
                    RESPONSE
                  </text>
                  <text
                    x="483"
                    y="118"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="5.5"
                    letterSpacing="1"
                    fill="#22c55e"
                  >
                    STREAMING · FAST
                  </text>

                  {/* TELEMETRY */}
                  <rect
                    x="213"
                    y="2"
                    width="120"
                    height="28"
                    fill="white"
                    stroke="rgba(100,116,139,0.15)"
                    strokeWidth="1"
                    rx="2"
                  />
                  <text
                    x="273"
                    y="18"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="7"
                    letterSpacing="1.5"
                    fill="rgba(71,85,105,0.5)"
                  >
                    TELEMETRY
                  </text>

                  {/* Blocked line */}
                  <line
                    x1="273"
                    y1="30"
                    x2="273"
                    y2="63"
                    stroke="#ef4444"
                    strokeWidth="0.5"
                    strokeDasharray="3 5"
                    opacity="0.5"
                  />
                  <rect x="-1.5" y="-1.5" width="3" height="3" fill="#ef4444">
                    <animateMotion dur="1.5s" repeatCount="indefinite">
                      <mpath href="#path-cloud-down-l" />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0.8;0.8;0"
                      keyTimes="0;0.6;1"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </rect>

                  {/* X mark */}
                  <line
                    x1="267"
                    y1="40"
                    x2="279"
                    y2="52"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="279"
                    y1="40"
                    x2="267"
                    y2="52"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />

                  {/* Privacy label */}
                  <text
                    x="273"
                    y="195"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="6"
                    letterSpacing="2"
                    fill="rgba(100,116,139,0.4)"
                  >
                    ZERO TELEMETRY · YOUR DATA STAYS LOCAL
                  </text>
                </svg>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-100">
              {[
                {
                  label: "Privacy & security",
                  num: "001",
                  title: "Your data stays yours.",
                  desc: "End-to-end encryption for every conversation. Never used to train models. Delete your history at any time. Privacy is foundational.",
                  accent: "bg-violet-50 border-l-4 border-violet-300",
                },
                {
                  label: "Multi-model",
                  num: "002",
                  title: "One interface, every model.",
                  desc: "GPT-4o, Claude, Gemini, and more. Switch models mid-conversation to get the best response for your specific task.",
                  accent: "bg-sky-50 border-l-4 border-sky-300",
                },
                {
                  label: "Multimodal",
                  num: "003",
                  title: "Beyond text conversations.",
                  desc: "Share files, voice notes, code snippets, and images seamlessly. Elixpo understands multiple formats and context simultaneously.",
                  accent: "bg-emerald-50 border-l-4 border-emerald-300",
                },
                {
                  label: "Architecture",
                  num: "004",
                  title: "Streaming at full speed.",
                  desc: "Server-sent events deliver responses as they are generated. No waiting for completion. Every token arrives the instant it is ready.",
                  accent: "bg-rose-50 border-l-4 border-rose-300",
                },
              ].map((card) => (
                <div
                  key={card.num}
                  className={`bg-white p-8 md:p-10 group hover:bg-slate-50 transition-colors duration-300 ${card.accent}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400">
                      {card.label}
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.1em] text-slate-300">
                      {card.num}
                    </span>
                  </div>
                  <h3
                    className="text-xl md:text-2xl font-bold tracking-[-0.02em] mb-3 text-slate-800"
                    style={{ fontFamily: "system-ui" }}
                  >
                    {card.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-4">
          <div className="h-px bg-slate-100" />
        </div>

        {/* ══════ 3-TIER CPU ARCHITECTURE SECTION ══════ */}
        <section
          className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-20 bg-gradient-to-b from-white to-sky-50/40"
          id="architecture"
        >
          <div className="flex items-center gap-2 mb-6">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="4" width="16" height="4" rx="1" fill="#0ea5e9" />
              <rect x="4" y="10" width="16" height="4" rx="1" fill="#7dd3fc" />
              <rect x="4" y="16" width="16" height="4" rx="1" fill="#bae6fd" />
            </svg>
            <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-slate-400">
              Infrastructure
            </span>
          </div>

          <h2
            className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-[-0.03em] leading-[1.1] mb-4 text-slate-900"
            style={{ fontFamily: "system-ui" }}
          >
            Powered by a 3-Tier
            <br />
            <span className="text-slate-400">CPU Architecture.</span>
          </h2>
          <p className="text-slate-500 max-w-xl text-base leading-relaxed mb-16">
            Elixpo runs on a purpose-built three-layer compute stack — each tier
            independently scalable, so your conversations stay fast regardless
            of load.
          </p>

          {/* Tier cards — stacked vertically to show layering */}
          <div className="relative max-w-3xl mx-auto">
            {/* Connecting spine */}
            <TracingBeam className="max-w-3xl mx-auto">
              <div className="pl-10">
                {/* Tier 1, Tier 2, Tier 3 — unchanged */}
                {/* Tier 1 */}
                <div className="relative flex gap-6 md:gap-10 items-start mb-6 group">
                  <div className="shrink-0 w-[3.5rem] h-[3.5rem] rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center shadow-sm group-hover:bg-sky-200 transition-colors z-10">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="5" rx="1" />
                      <line x1="6" y1="5.5" x2="6" y2="5.5" strokeWidth="2" />
                      <line x1="10" y1="5.5" x2="10" y2="5.5" strokeWidth="2" />
                      <line x1="18" y1="5.5" x2="20" y2="5.5" />
                    </svg>
                  </div>
                  <div className="flex-1 bg-white border border-sky-100 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-sky-200 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-sky-500">
                        Tier 01 · Presentation
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 tracking-wider">
                        EDGE / CDN
                      </span>
                    </div>
                    <h3
                      className="text-lg font-bold text-slate-800 mb-1"
                      style={{ fontFamily: "system-ui" }}
                    >
                      Interface & Delivery Layer
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      The front-facing layer serves the UI from globally
                      distributed edge nodes. Static assets, routing, and
                      session initiation happen here — milliseconds from the
                      user, always.
                    </p>
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      {["Next.js", "Edge Runtime", "CDN Cache", "TLS 1.3"].map(
                        (tag) => (
                          <span
                            key={tag}
                            className="font-mono text-[10px] bg-sky-50 text-sky-600 border border-sky-100 px-2.5 py-1 rounded-full tracking-wide"
                          >
                            {tag}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                {/* Tier 2 */}
                <div className="relative flex gap-6 md:gap-10 items-start mb-6 group">
                  <div className="shrink-0 w-[3.5rem] h-[3.5rem] rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center shadow-sm group-hover:bg-violet-200 transition-colors z-10">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="9" width="20" height="5" rx="1" />
                      <line x1="6" y1="11.5" x2="6" y2="11.5" strokeWidth="2" />
                      <line
                        x1="10"
                        y1="11.5"
                        x2="10"
                        y2="11.5"
                        strokeWidth="2"
                      />
                      <line x1="18" y1="11.5" x2="20" y2="11.5" />
                    </svg>
                  </div>
                  <div className="flex-1 bg-white border border-violet-100 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-violet-200 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-violet-500">
                        Tier 02 · Application
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 tracking-wider">
                        ORCHESTRATION
                      </span>
                    </div>
                    <h3
                      className="text-lg font-bold text-slate-800 mb-1"
                      style={{ fontFamily: "system-ui" }}
                    >
                      AI Orchestration Engine
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      The brain of Elixpo. Incoming prompts are parsed, enriched
                      with context, and routed to the optimal model — GPT-4o,
                      Claude, Gemini — in real time. Streaming, tool calls, and
                      file handling all live here.
                    </p>
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      {[
                        "Model Router",
                        "Stream SSE",
                        "Context Engine",
                        "Tool Calls",
                      ].map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[10px] bg-violet-50 text-violet-600 border border-violet-100 px-2.5 py-1 rounded-full tracking-wide"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tier 3 */}
                <div className="relative flex gap-6 md:gap-10 items-start group">
                  <div className="shrink-0 w-[3.5rem] h-[3.5rem] rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shadow-sm group-hover:bg-rose-200 transition-colors z-10">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#e11d48"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="15" width="20" height="5" rx="1" />
                      <line x1="6" y1="17.5" x2="6" y2="17.5" strokeWidth="2" />
                      <line
                        x1="10"
                        y1="17.5"
                        x2="10"
                        y2="17.5"
                        strokeWidth="2"
                      />
                      <line x1="18" y1="17.5" x2="20" y2="17.5" />
                    </svg>
                  </div>
                  <div className="flex-1 bg-white border border-rose-100 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-rose-200 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-rose-500">
                        Tier 03 · Data
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 tracking-wider">
                        PERSISTENCE
                      </span>
                    </div>
                    <h3
                      className="text-lg font-bold text-slate-800 mb-1"
                      style={{ fontFamily: "system-ui" }}
                    >
                      Encrypted Data Layer
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      All conversation history, user preferences, and uploaded
                      files are encrypted at rest and never shared across
                      accounts. The data tier is isolated from the public
                      internet — fully private, fully yours.
                    </p>
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      {[
                        "E2E Encryption",
                        "KV Store",
                        "Cloudflare D1",
                        "Zero Telemetry",
                      ].map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[10px] bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-1 rounded-full tracking-wide"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TracingBeam>
            <p className="text-center text-xs font-mono text-slate-400 tracking-widest uppercase mt-10">
              Each tier scales independently · Zero single points of failure
            </p>

            {/* Bottom note */}
            <p className="text-center text-xs font-mono text-slate-400 tracking-widest uppercase mt-10">
              Each tier scales independently · Zero single points of failure
            </p>
          </div>
        </section>

        {/* Section Divider */}
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-4">
          <div className="h-px bg-slate-100" />
        </div>

        {/* ══════ PARTNER SECTION ══════ */}
        <section className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-16">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 block mb-3">
                Powering next-generation AI workflows
              </span>
              <span className="text-xl font-bold tracking-tight text-slate-500">
                Pollinations.ai
              </span>
              <br />
              <span className="font-bold tracking-tight text-slate-700">
                Running on CPU · 3 Model Tiers
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-slate-500 uppercase">
                Active
              </span>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-4">
          <div className="h-px bg-slate-100" />
        </div>

        {/* ══════ FAQ SECTION ══════ */}
        <section
          className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-20 bg-slate-50/60"
          id="faq"
        >
          <div
            ref={faq.ref}
            className={`transition-all duration-[800ms] ease-out ${faq.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-16 items-start">
              <div>
                {/* Section badge */}
                <div className="flex items-center gap-2 mb-6">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="6" y="4" width="4" height="4" fill="#0ea5e9" />
                    <rect x="14" y="4" width="4" height="4" fill="#0ea5e9" />
                    <rect x="10" y="10" width="4" height="4" fill="#0ea5e9" />
                    <rect x="6" y="16" width="4" height="4" fill="#0ea5e9" />
                    <rect x="14" y="16" width="4" height="4" fill="#0ea5e9" />
                  </svg>
                  <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-slate-400">
                    FAQ
                  </span>
                </div>

                <h2
                  className="text-3xl md:text-4xl font-bold tracking-[-0.03em] leading-tight mb-5 text-slate-900"
                  style={{ fontFamily: "system-ui" }}
                >
                  Frequently Asked
                  <br />
                  <span className="text-slate-400">Questions.</span>
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed mb-8">
                  Everything you need to know about Elixpo Chat. Can not find
                  the answer you are looking for?
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href="#"
                    className="font-mono text-[11px] font-bold tracking-[0.05em] uppercase px-5 py-3 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
                    }}
                  >
                    Documentation
                  </Link>
                  <Link
                    href="#"
                    className="font-mono text-[11px] font-bold tracking-[0.05em] uppercase px-5 py-3 bg-sky-500 text-white hover:bg-sky-600 transition-colors shadow-sm"
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
                    }}
                  >
                    Ask Question
                  </Link>
                </div>
              </div>
              <div className="border-t border-slate-200 md:border-t-0">
                {faqItems.map((item, idx) => (
                  <FaqItem key={item.q} q={item.q} a={item.a} idx={idx} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-4">
          <div className="h-px bg-slate-100" />
        </div>

        {/* ══════ CTA SECTION ══════ */}
        <section className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-24">
          <div
            ref={cta.ref}
            className={`relative border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-12 md:p-20 text-center overflow-hidden transition-all duration-[800ms] ease-out shadow-sm ${cta.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          >
            {/* Top accent line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40%] h-32 bg-gradient-to-b from-sky-400/[0.08] to-transparent blur-[60px]" />
            <BackgroundGradientAnimation />
            <div className="relative z-10">
              <h2
                className="text-3xl md:text-5xl font-bold tracking-[-0.03em] mb-5 text-slate-900"
                style={{ fontFamily: "system-ui" }}
              >
                Ready to Build Your AI
                <br />
                <span className="text-slate-400">Chat Experience?</span>
              </h2>
              <p className="text-slate-500 text-base max-w-md mx-auto mb-10 leading-relaxed">
                Start chatting with Elixpo AI today and experience the future of
                conversational interfaces.
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <MovingBorderButton
                  href="/chat"
                  className="font-mono text-xs font-bold tracking-[0.05em] uppercase bg-sky-500 text-white hover:bg-sky-600"
                >
                  Open App
                </MovingBorderButton>
                <Link
                  href="#"
                  className="font-mono text-xs font-bold tracking-[0.05em] uppercase text-slate-600 border border-slate-200 bg-white px-7 py-4 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
                  style={{
                    clipPath:
                      "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                  }}
                >
                  Join Community
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ════════ Footer ════════ */}
      <footer className="relative z-10 border-t border-slate-100 bg-slate-50">
        <div className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-12">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-8">
            <div>
              <span className="text-lg font-bold tracking-wider uppercase block mb-3 text-slate-800">
                Elixpo
              </span>
              <p className="text-slate-500 text-sm max-w-[280px] leading-relaxed">
                Next-generation AI interface. Multi-model, privacy-first,
                beautifully designed.
              </p>
            </div>
            <div>
              <h3 className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 mb-4">
                Product
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/chat"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    Chat
                  </Link>
                </li>
                <li>
                  <a
                    href="#features"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 mb-4">
                Legal
              </h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    Privacy
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    Terms
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-slate-500 hover:text-sky-600 transition-colors"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-between mt-12 pt-6 border-t border-slate-100">
            <span className="font-mono text-[11px] tracking-[0.1em] text-slate-400 uppercase">
              &copy; {new Date().getFullYear()} Elixpo
            </span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-[blink_1.5s_step-end_infinite]" />
              <span className="font-mono text-[11px] tracking-[0.1em] text-slate-500">
                All systems operational
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ──── Custom Animations ──── */}
      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
