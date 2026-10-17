"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Home, Github, Compass } from "lucide-react";

/* 404 — uses the same wave gradient palette as the hero so a misroute
 * still feels like part of the product. No canvas here because we want
 * the page to be as cheap to render as possible (some misrouted bots
 * will hammer it). */

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[80vh] flex-col items-center
                        justify-center overflow-hidden px-6 py-24 text-center">
      {/* Soft gradient glows behind the content */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[420px]
                        -translate-x-1/2 rounded-full bg-primary/[0.10] blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[280px] w-[280px]
                        rounded-full bg-lilac/[0.10] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y:  0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-sm uppercase tracking-[0.4em] text-muted">
          404 / not found
        </p>
        <h1 className="mt-4 font-display text-7xl leading-[1.05] tracking-tight
                       sm:text-8xl">
          <span className="bg-gradient-to-r from-primary via-gold to-lilac
                           bg-clip-text text-transparent
                           drop-shadow-[0_0_30px_rgba(255,93,104,0.35)]">
            Off the map.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-text-dim">
          The route you tapped doesn't exist on this build of the site.
          Maybe it's an IR-Quest beacon hidden in a different timeline —
          or maybe a typo. Head back home and we'll forget this ever
          happened.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary">
            <Home className="h-4 w-4" /> Back home
          </Link>
          <Link href="/apps/" className="btn-ghost">
            <Compass className="h-4 w-4" /> Browse apps
          </Link>
          <a
            href="https://github.com/elixpo/oreo/issues/new"
            target="_blank" rel="noreferrer"
            className="btn-ghost"
          >
            <Github className="h-4 w-4" /> Report a broken link
          </a>
        </div>
      </motion.div>
    </section>
  );
}
