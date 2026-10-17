"use client";

import { WordsPullUpMultiStyle } from "./WordsPullUpMultiStyle";
import { ProductDirectoryTeaser } from "./ProductDirectoryTeaser";
import { Segment } from "@/lib/elixpo-links";

export function FeaturesSection() {
  const heading1: Segment[] = [
    { text: "Enhanced Learning & Intelligence Process Optimization.", className: "font-normal text-primary" },
  ];

  const heading2: Segment[] = [
    { text: "An Open Source Project Series centered on Computer Science.", className: "font-normal text-neutral-500" },
  ];

  return (
    <section
      id="features"
      className="bg-black text-[#E1E0CC] pt-24 pb-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none"
    >
      {/* Subtle background noise overlay */}
      <div className="absolute inset-0 bg-noise opacity-[0.15] mix-blend-overlay pointer-events-none z-0" />

      {/* Background ambient lighting */}
      <div className="absolute hidden md:block top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-primary/[0.02] blur-[160px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header containing multi-style headers */}
        <div className="mb-14 sm:mb-20 text-left max-w-4xl">
          <WordsPullUpMultiStyle
            segments={heading1}
            justify="flex-start"
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light tracking-tight mb-2"
          />
          <WordsPullUpMultiStyle
            segments={heading2}
            justify="flex-start"
            startDelay={0.2}
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light tracking-tight"
          />
        </div>

        <div>
          <ProductDirectoryTeaser />
        </div>
      </div>
    </section>
  );
}
