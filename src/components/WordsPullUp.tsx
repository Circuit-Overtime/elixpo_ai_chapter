"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
  /** When set, renders this logo (with a bounce) at the top-right instead of the asterisk. */
  logoSrc?: string;
  startDelay?: number;
}

export function WordsPullUp({
  text,
  className = "",
  showAsterisk = false,
  logoSrc,
  startDelay = 0,
}: WordsPullUpProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });

  const words = text.split(" ").filter(Boolean);
  const logoDelay = startDelay + words.length * 0.08 + 0.35;

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex flex-wrap items-baseline gap-x-[0.25em] ${className}`}
    >
      {words.map((word, index) => {
        const isLastWord = index === words.length - 1;

        return (
          <span
            key={index}
            className="inline-block overflow-hidden relative leading-none"
            style={{ paddingBottom: "0.08em" }}
          >
            <motion.span
              initial={{ y: "110%", opacity: 0 }}
              animate={isInView ? { y: 0, opacity: 1 } : { y: "110%", opacity: 0 }}
              transition={{
                duration: 0.8,
                delay: startDelay + index * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="inline-block relative leading-none text-[#E1E0CC]"
            >
              {isLastWord && showAsterisk && !logoSrc ? (
                <span className="inline-block relative pr-[0.25em]">
                  {word}
                  <span className="absolute top-[0.1em] right-[0.15em] text-[0.34em] font-light leading-none select-none text-primary/80">
                    *
                  </span>
                </span>
              ) : (
                word
              )}
            </motion.span>
          </span>
        );
      })}

      {/* Bouncing logo accent (replaces the asterisk) */}
      {logoSrc && (
        <motion.span
          initial={{ opacity: 0, scale: 0.4 }}
          animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.6, delay: logoDelay, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -top-[0.18em] -right-[0.02em] w-[0.6em] h-[0.6em] select-none pointer-events-none"
        >
          <motion.img
            src={logoSrc}
            alt="Elixpo"
            animate={{ y: ["0%", "-24%", "0%"], rotate: [0, -5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-full h-full object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
          />
        </motion.span>
      )}
    </span>
  );
}
