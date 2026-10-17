"use client";

import React from "react";

/**
 * BackgroundGradientAnimation — smooth shifting gradient blobs behind
 * a container, calmer than Vortex/Aurora. Adapted from Aceternity,
 * rewritten as pure CSS blurred blobs + @keyframes drift, no canvas,
 * no shadcn CLI.
 *
 * Usage:
 *   <div className="relative overflow-hidden rounded-3xl">
 *     <BackgroundGradientAnimation />
 *     <div className="relative z-10 p-12 text-center">...CTA content...</div>
 *   </div>
 *
 * Requires the keyframes below in globals.css.
 */

interface BackgroundGradientAnimationProps {
  className?: string;
}

export function BackgroundGradientAnimation({ className = "" }: BackgroundGradientAnimationProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute -top-1/4 -left-1/4 w-2/3 h-2/3 rounded-full bg-violet-300/30 blur-3xl animate-blob-drift-1" />
      <div className="absolute -bottom-1/4 -right-1/4 w-2/3 h-2/3 rounded-full bg-sky-300/30 blur-3xl animate-blob-drift-2" />
      <div className="absolute top-1/3 left-1/2 w-1/2 h-1/2 rounded-full bg-rose-200/20 blur-3xl animate-blob-drift-3" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Add to globals.css:

   @keyframes blob-drift-1 {
     0%, 100% { transform: translate(0, 0) scale(1); }
     50% { transform: translate(6%, 8%) scale(1.1); }
   }
   @keyframes blob-drift-2 {
     0%, 100% { transform: translate(0, 0) scale(1); }
     50% { transform: translate(-8%, -6%) scale(1.05); }
   }
   @keyframes blob-drift-3 {
     0%, 100% { transform: translate(-50%, 0) scale(1); }
     50% { transform: translate(-50%, 10%) scale(0.95); }
   }
   .animate-blob-drift-1 { animation: blob-drift-1 14s ease-in-out infinite; }
   .animate-blob-drift-2 { animation: blob-drift-2 16s ease-in-out infinite; }
   .animate-blob-drift-3 { animation: blob-drift-3 12s ease-in-out infinite; }

   Tailwind v3 (tailwind.config.js) equivalent if preferred:

   module.exports = {
     theme: {
       extend: {
         animation: {
           "blob-drift-1": "blob-drift-1 14s ease-in-out infinite",
           "blob-drift-2": "blob-drift-2 16s ease-in-out infinite",
           "blob-drift-3": "blob-drift-3 12s ease-in-out infinite",
         },
         keyframes: {
           "blob-drift-1": { "0%,100%": { transform: "translate(0,0) scale(1)" }, "50%": { transform: "translate(6%,8%) scale(1.1)" } },
           "blob-drift-2": { "0%,100%": { transform: "translate(0,0) scale(1)" }, "50%": { transform: "translate(-8%,-6%) scale(1.05)" } },
           "blob-drift-3": { "0%,100%": { transform: "translate(-50%,0) scale(1)" }, "50%": { transform: "translate(-50%,10%) scale(0.95)" } },
         },
       },
     },
   };
   ──────────────────────────────────────────────────────────── */
