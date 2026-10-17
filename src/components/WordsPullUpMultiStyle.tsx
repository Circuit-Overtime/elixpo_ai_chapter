"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { Segment } from "@/lib/elixpo-links";

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
  startDelay?: number;
  justify?: "center" | "flex-start" | "flex-end" | string;
}

export function WordsPullUpMultiStyle({
  segments,
  className = "",
  startDelay = 0,
  justify = "center",
}: WordsPullUpMultiStyleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });

  // Map words to retain their style identifiers but animate sequentially
  const flattenedWords: Array<{ word: string; fontClass: string }> = [];

  segments.forEach((seg) => {
    const parted = seg.text.split(" ");
    parted.forEach((p) => {
      if (p.trim()) {
        flattenedWords.push({
          word: p,
          fontClass: seg.className || seg.extraClass || "",
        });
      }
    });
  });

  const justifyClass =
    justify === "flex-start"
      ? "justify-start"
      : justify === "flex-end"
        ? "justify-end"
        : "justify-center";

  return (
    <div
      ref={containerRef}
      className={`inline-flex flex-wrap ${justifyClass} gap-x-[0.25em] gap-y-[0.1em] text-center ${className}`}
    >
      {flattenedWords.map((item, index) => {
        return (
          <span
            key={index}
            className="inline-block overflow-hidden relative"
            style={{ paddingBottom: "0.05em" }}
          >
            <motion.span
              initial={{ y: "115%", opacity: 0 }}
              animate={isInView ? { y: 0, opacity: 1 } : { y: "115%", opacity: 0 }}
              transition={{
                duration: 0.8,
                delay: startDelay + index * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`inline-block whitespace-nowrap text-[#E1E0CC] ${item.fontClass}`}
            >
              {item.word}
            </motion.span>
          </span>
        );
      })}
    </div>
  );
}
