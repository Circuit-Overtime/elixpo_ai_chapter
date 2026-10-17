"use client";

import { useState } from "react";
import Link from "next/link";
import PricingCard from "@/components/pricing/PricingCard";

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  const tiers = [
    {
      title: "FREE",
      price: "$0",
      description: "Basic access to essential models for everyday tasks.",
      buttonText: "Start for Free",
      accent: "emerald",
      features: [
        "100 messages / month",
        "GPT-5 Mini (openai)",
        "Mistral Small (mistral)",
        "DeepSeek V3.2 (deepseek)",
        "Gemini Flash (gemini-fast)",
      ],
      isPopular: false,
    },
    {
      title: "PRO",
      price: isAnnual ? "$15" : "$19",
      description: "Everything you need for intelligent, fast workflows.",
      buttonText: "Upgrade to Pro",
      accent: "amber",
      features: [
        "Unlimited messages",
        "GPT-5.2 (openai-large)",
        "Gemini 3 Flash (gemini)",
        "Claude Sonnet (claude)",
        "Kimi K2.5 (kimi)",
      ],
      isPopular: true,
    },
    {
      title: "MAX",
      price: isAnnual ? "$39" : "$49",
      description: "Maximum limits for professionals and heavy users.",
      buttonText: "Get Max",
      accent: "violet",
      features: [
        "Priority CPU Inference Queue",
        "Claude Opus (claude-large)",
        "Gemini 3.1 Pro (gemini-large)",
        "Grok Reasoning (grok-reasoning)",
        "Unlimited Image Generation",
      ],
      isPopular: false,
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-[#f0ede6] overflow-hidden selection:bg-[#6366f1]/40">
      <div className="fixed inset-0 z-[100] pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)'
      }} />
      <div className="fixed inset-0 z-[99] pointer-events-none opacity-[0.04]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '128px 128px'
      }} />

      <header className="relative z-20">
        <nav className="max-w-[calc(1200px+6rem)] mx-auto px-6 md:px-12 py-6 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-wider uppercase text-[#f0ede6]">
            Elixpo
          </Link>
          <ul className="hidden md:flex items-center gap-8 list-none">
            <li>
              <Link href="/chat" className="font-mono text-xs font-bold tracking-[0.05em] text-[#0a0a0a] bg-[#f0ede6] px-5 py-3 hover:bg-[#d1ccc0] transition-colors" style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}>
                Open App
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="relative z-10 flex-grow pt-24 pb-32 px-6 md:px-12 max-w-[calc(1200px+6rem)] mx-auto">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="4" width="4" height="4" fill="#6366f1" />
              <rect x="10" y="4" width="4" height="4" fill="#6366f1" />
              <rect x="16" y="4" width="4" height="4" fill="#6366f1" />
              <rect x="4" y="10" width="4" height="4" fill="#6366f1" />
              <rect x="10" y="10" width="4" height="4" fill="#6366f1" />
              <rect x="4" y="16" width="4" height="4" fill="#6366f1" />
            </svg>
            <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-[rgba(240,237,230,0.5)]">
              Pricing
            </span>
          </div>
          
          <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[1.05] mb-6 text-[#f0ede6]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Simple, Transparent.<br />
            <span className="text-[rgba(240,237,230,0.35)]">Built for scale.</span>
          </h1>
          <p className="text-[rgba(240,237,230,0.5)] text-lg max-w-xl mx-auto mb-10 leading-relaxed" style={{ fontFamily: 'system-ui' }}>
            Access Pollinations' powerful CPU-inference models. Upgrade to Pro or Max for unlimited generation and priority queues.
          </p>

          <div className="flex items-center justify-center gap-4 mb-16">
            <span className={`text-sm font-semibold tracking-wide ${!isAnnual ? "text-[#f0ede6]" : "text-[rgba(240,237,230,0.4)]"}`}>
              Monthly
            </span>
            <button 
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-14 h-7 rounded-none border border-[rgba(240,237,230,0.2)] bg-[rgba(10,10,10,0.8)] p-1 cursor-pointer transition-colors hover:border-[rgba(240,237,230,0.4)]"
            >
              <div 
                className={`w-5 h-5 bg-[#6366f1] transition-transform duration-300 ease-out ${isAnnual ? "translate-x-7" : "translate-x-0"}`}
              />
            </button>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold tracking-wide ${isAnnual ? "text-[#f0ede6]" : "text-[rgba(240,237,230,0.4)]"}`}>
                Annually
              </span>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full uppercase">
                Save 20%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[rgba(240,237,230,0.08)]">
            {tiers.map((tier) => (
              <PricingCard key={tier.title} {...tier} onSelect={() => {}} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
