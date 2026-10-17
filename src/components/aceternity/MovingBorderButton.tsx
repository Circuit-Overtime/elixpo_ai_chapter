"use client";

import React from "react";

/**
 * MovingBorderButton — a button with an animated gradient border that
 * rotates around the edge. Adapted from Aceternity's Moving Border,
 * rewritten with a CSS conic-gradient + @keyframes spin instead of
 * framer-motion's offset-path animation. No shadcn CLI.
 *
 * Usage:
 *   <MovingBorderButton href="/chat" className="bg-white text-violet-700">
 *     Open App
 *   </MovingBorderButton>
 *
 * Requires the .moving-border-spin keyframes below to be in globals.css
 * (included in the comment at the bottom of this file).
 */

interface MovingBorderButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  /** Border thickness in px. */
  borderWidth?: number;
  /** Animation duration in seconds. */
  duration?: number;
}

export function MovingBorderButton({
  children,
  href,
  onClick,
  className = "",
  borderWidth = 2,
  duration = 4,
}: MovingBorderButtonProps) {
  const Tag = href ? "a" : "button";

  return (
    <Tag
      href={href}
      onClick={onClick}
      className="relative inline-block rounded-full p-[2px] overflow-hidden group"
      style={{ padding: borderWidth }}
    >
      {/* rotating gradient border */}
      <span
        className="absolute inset-[-50%] block"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, #7c3aed 15%, transparent 30%)",
          animation: `moving-border-spin ${duration}s linear infinite`,
        }}
      />
      {/* inner content surface, sits above the spinning border */}
      <span
        className={`relative z-10 flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition-colors ${className}`}
      >
        {children}
      </span>
    </Tag>
  );
}

/* ────────────────────────────────────────────────────────────
   Add to globals.css:

   @keyframes moving-border-spin {
     to { transform: rotate(360deg); }
   }

   Tailwind v3 (tailwind.config.js) equivalent if you prefer a utility class:

   module.exports = {
     theme: {
       extend: {
         animation: { "border-spin": "moving-border-spin 4s linear infinite" },
         keyframes: {
           "moving-border-spin": { to: { transform: "rotate(360deg)" } },
         },
       },
     },
   };
   ──────────────────────────────────────────────────────────── */
