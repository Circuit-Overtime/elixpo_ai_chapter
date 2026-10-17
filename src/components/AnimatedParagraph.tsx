"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "motion/react";

interface AnimatedWordProps {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}

function AnimatedWord({ word, index, total, progress }: AnimatedWordProps) {
  const wordProgress = index / total;
  const start = Math.max(0, wordProgress - 0.15);
  const end = Math.min(1, wordProgress + 0.05);
  const opacity = useTransform(progress, [start, end], [0.25, 1]);

  return (
    <motion.span style={{ opacity }} className="inline-block mr-[0.28em] my-0.5">
      {word}
    </motion.span>
  );
}

interface AnimatedParagraphProps {
  text: string;
  className?: string;
}

export function AnimatedParagraph({ text, className = "" }: AnimatedParagraphProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.8", "end 0.23"],
  });

  const words = text.split(" ");

  return (
    <p ref={containerRef} className={`${className} leading-relaxed flex flex-wrap`}>
      {words.map((word, index) => (
        <AnimatedWord
          key={index}
          word={word}
          index={index}
          total={words.length}
          progress={scrollYProgress}
        />
      ))}
    </p>
  );
}
