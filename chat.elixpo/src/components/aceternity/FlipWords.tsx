"use client";

import React, { useEffect, useState } from "react";

/**
 * FlipWords — one word/phrase in a sentence cycles through alternatives.
 * Adapted from Aceternity's FlipWords, rewritten without framer-motion's
 * AnimatePresence (uses a CSS transition instead) so it has zero extra deps
 * beyond React. No shadcn CLI.
 *
 * Usage:
 *   <h1>
 *     Build smarter conversations.<br />
 *     With a <FlipWords words={["Powerful", "Private", "Multi-Model"]} /> AI.
 *   </h1>
 */

interface FlipWordsProps {
  words: string[];
  /** Ms each word stays visible before flipping. Default 2200. */
  duration?: number;
  className?: string;
}

export function FlipWords({ words, duration = 2200, className = "" }: FlipWordsProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false); // start fade-out
      const t = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setVisible(true); // fade back in with new word
      }, 250);
      return () => clearTimeout(t);
    }, duration);
    return () => clearInterval(interval);
  }, [words.length, duration]);

  return (
    <span
      className={`inline-block transition-all duration-250 ease-in-out ${
        visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 -translate-y-1 blur-sm"
      } ${className}`}
    >
      {words[index]}
    </span>
  );
}
