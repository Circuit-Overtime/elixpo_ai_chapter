"use client";

import { useEffect, useState } from "react";
import { ContributorAvatar } from "./ContributorAvatar";
import contributorsData from "@/data/contributors.json";

// The roster is refreshed by the @elixpoo bot (see
// .github/workflows/update-contributors.yml) and served raw from main.
const RAW_ROSTER_URL =
  "https://raw.githubusercontent.com/elixpo/elixpo/main/src/data/contributors.json";

// Named core team with their role chips.
const LEADS = [
  { login: "Circuit-Overtime", name: "Ayushman Bhattacharya", role: "Founder & Lead" },
  { login: "ez-vivek", name: "Vivek Yadav", role: "Lead Co-Dev" },
  { login: "anwe-ch", name: "anwe-ch", role: "Core Maintainer" },
];

interface RingProps {
  members: string[];
  inset: string;
  spin: string;
  counter: string;
  size: number;
}

function Ring({ members, inset, spin, counter, size }: RingProps) {
  return (
    <div className={`absolute ${inset} rounded-full border border-white/10`}>
      <div className={`relative w-full h-full ${spin}`}>
        {members.map((login, i) => {
          const angle = (i / members.length) * 360;
          const rad = (angle * Math.PI) / 180;
          const x = 50 + 50 * Math.cos(rad);
          const y = 50 + 50 * Math.sin(rad);
          return (
            <div
              key={login}
              className={`absolute ${counter}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <ContributorAvatar login={login} size={size} className="border-2 border-[#DEDBC8]/30 shadow-md" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Contributors() {
  const [contributors, setContributors] = useState<string[]>(
    contributorsData.contributors,
  );
  const [subheadline, setSubheadline] = useState<string>(
    contributorsData.subheadline,
  );

  useEffect(() => {
    let active = true;
    fetch(RAW_ROSTER_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data || !Array.isArray(data.contributors) || !data.contributors.length) {
          return;
        }
        setContributors(data.contributors);
        if (typeof data.subheadline === "string") setSubheadline(data.subheadline);
      })
      .catch(() => {
        /* keep the bundled fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const orbit1 = contributors.slice(0, 6);
  const orbit2 = contributors.slice(6, 15);
  const orbit3 = contributors.slice(15);

  return (
    <section
      id="contributors"
      className="bg-black text-[#E1E0CC] py-24 md:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none"
    >
      {/* Ambient background glow */}
      <div className="absolute hidden md:block top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-primary/[0.03] rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-12">
          <span className="text-[10px] uppercase tracking-widest text-[#DEDBC8] font-medium font-mono block mb-3">
            The People Behind Elixpo
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight text-white mb-4">
            Our <span className="italic font-serif text-primary">Contributors</span>
          </h2>
          <p className="text-[#DEDBC8]/60 max-w-xl mx-auto text-xs sm:text-sm font-mono leading-relaxed">
            {subheadline}
          </p>
        </div>

        {/* Core team - named leads with role chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
          {LEADS.map((lead) => (
            <a
              key={lead.login}
              href={`https://github.com/${lead.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 pl-2 pr-4 py-2 rounded-full bg-white/[0.04] border border-white/10 hover:border-primary/30 hover:bg-white/[0.07] transition-colors"
            >
              <ContributorAvatar login={lead.login} size={36} className="border border-white/10" />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-white/90 group-hover:text-primary transition-colors">{lead.name}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#DEDBC8]/55">{lead.role}</span>
              </span>
            </a>
          ))}
        </div>

        {/* Solar System */}
        <div className="relative w-full aspect-square max-w-[600px] mx-auto">
          {/* Center - Founder avatar */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <ContributorAvatar
              login="Circuit-Overtime"
              size={80}
              className="border-4 border-primary shadow-xl shadow-primary/30"
            />
          </div>

          <Ring members={orbit1} inset="inset-[25%]" spin="animate-orbit-slow" counter="animate-counter-orbit-slow" size={36} />
          <Ring members={orbit2} inset="inset-[12%]" spin="animate-orbit-medium" counter="animate-counter-orbit-medium" size={32} />
          <Ring members={orbit3} inset="inset-0" spin="animate-orbit-outer" counter="animate-counter-orbit-outer" size={28} />
        </div>

        {/* Contributor count */}
        <p className="text-center text-xs text-[#DEDBC8]/65 font-mono mt-8">
          45+ contributors and growing
        </p>
      </div>
    </section>
  );
}
