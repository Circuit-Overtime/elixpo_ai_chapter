"use client";

import { motion, type Variants } from "framer-motion";

/* Shared motion presets so every page transition / reveal feels like
   it came from the same product. Components import these directly
   instead of redeclaring keyframes. The crisp-spring presets are tuned
   for "snappy but not bouncy" — feels intentional, not gimmicky. */

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0,
             transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
};

export const staggerContainer: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export function Reveal({
  children, delay = 0, className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
