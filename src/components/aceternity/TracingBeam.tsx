"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * TracingBeam — a glowing line down the left side that fills in as the
 * user scrolls through a section, like a progress trace. Adapted from
 * Aceternity, rewritten with a scroll listener + CSS instead of
 * framer-motion's useScroll/useTransform. No shadcn CLI.
 *
 * Usage — wrap your tiered content:
 *   <TracingBeam>
 *     <div className="pl-10">
 *       {tiers.map(tier => <TierCard key={tier.id} {...tier} />)}
 *     </div>
 *   </TracingBeam>
 */

interface TracingBeamProps {
  children: React.ReactNode;
  className?: string;
  /** Beam color. Default violet-600. */
  color?: string;
}

export function TracingBeam({ children, className = "", color = "#7c3aed" }: TracingBeamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0 to 1

  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;

      // progress = how far we've scrolled through the element,
      // 0 when top of element hits bottom of viewport,
      // 1 when bottom of element hits top of viewport
      const total = rect.height + viewportH;
      const scrolled = viewportH - rect.top;
      const pct = Math.min(Math.max(scrolled / total, 0), 1);
      setProgress(pct);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* track */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200" />
      {/* filled beam */}
      <div
        className="absolute left-0 top-0 w-px transition-[height] duration-150 ease-out"
        style={{
          height: `${progress * 100}%`,
          background: `linear-gradient(to bottom, ${color}, ${color}99)`,
          boxShadow: `0 0 8px 1px ${color}66`,
        }}
      />
      {/* dot at the leading edge of the beam */}
      <div
        className="absolute left-[-3.5px] w-2 h-2 rounded-full transition-[top] duration-150 ease-out"
        style={{
          top: `${progress * 100}%`,
          background: color,
          boxShadow: `0 0 10px 2px ${color}aa`,
          opacity: progress > 0.02 && progress < 0.99 ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}
