"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight } from "lucide-react";
import { Reveal, staggerContainer, fadeUp } from "@/components/MotionWrap";
import AppCard from "@/components/AppCard";
import { PRELOADED, ALL_APPS, STORE } from "@/data/apps";

export default function AppsPage() {
  return (
    <div className="relative">
      {/* Ambient glows so the page feels like part of the brand. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2
                        rounded-full bg-primary/[0.10] blur-[140px]" />
        <div className="absolute right-1/4 top-40 h-[260px] w-[260px]
                        rounded-full bg-lilac/[0.10] blur-[120px]" />
      </div>

      <div className="container-page pt-16 pb-28">
        {/* Centred header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.span variants={fadeUp} className="chip mb-6">
            {ALL_APPS.length + STORE.length} apps and counting
          </motion.span>
          <motion.h1
            variants={fadeUp}
            className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
          >
            Everything that ships,
            <br />
            <span className="bg-gradient-to-r from-primary via-gold to-lilac
                             bg-clip-text text-transparent
                             drop-shadow-[0_0_30px_rgba(255,93,104,0.35)]">
              and everything that streams in.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-text-dim">
            The preloaded set lands on the badge at flash time. The store
            pulls fresh apps from GitHub at runtime — no laptop, no
            recompile, no developer mode toggle.
          </motion.p>

          {/* Docs CTA — every catalogue tile is just an example; if
              someone's reading this page they probably want to write
              their own. Send them straight to /docs/apps. */}
          <motion.div variants={fadeUp} className="mt-8 flex justify-center">
            <Link
              href="/docs/apps/"
              className="inline-flex items-center gap-2 rounded-md
                         border border-primary/40 bg-primary/10 px-4 py-2.5
                         text-sm font-medium text-primary
                         transition-colors hover:border-primary
                         hover:bg-primary/15"
            >
              <BookOpen className="h-4 w-4" />
              Read the app-building docs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Preloaded — centred */}
        <Reveal>
          <div className="mx-auto mt-20 max-w-5xl text-center">
            <h2 className="font-display text-2xl tracking-tight">Preloaded</h2>
            <p className="mt-1 text-sm text-muted">
              Shipped with v1. Edit or remove any of them locally.
            </p>
          </div>
        </Reveal>
        <div className="mx-auto mt-6 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRELOADED.map((a, i) => <AppCard key={a.slug} app={a} index={i} />)}
        </div>

        {/* Full catalogue */}
        <Reveal>
          <div className="mx-auto mt-24 max-w-5xl text-center">
            <h2 className="font-display text-2xl tracking-tight">More on the badge</h2>
            <p className="mt-1 text-sm text-muted">
              Settings, tools, and games sit one drawer-tap away.
            </p>
          </div>
        </Reveal>
        <div className="mx-auto mt-6 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_APPS.filter(a => !PRELOADED.find(p => p.slug === a.slug))
            .map((a, i) => <AppCard key={a.slug} app={a} index={i} />)}
        </div>

        {/* Store */}
        <Reveal>
          <div className="mx-auto mt-24 max-w-5xl text-center">
            <h2 className="font-display text-2xl tracking-tight">From the store</h2>
            <p className="mt-1 text-sm text-muted">
              Community apps installable at runtime from{" "}
              <code className="text-text-dim">apps_market/</code> on the repo.
            </p>
          </div>
        </Reveal>
        <div className="mx-auto mt-6 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STORE.map((a, i) => <AppCard key={a.slug} app={a} index={i} />)}
        </div>

        <Reveal>
          <div className="mx-auto mt-16 max-w-3xl text-center">
            <a
              href="https://github.com/elixpo/oreo/tree/main/apps_market"
              target="_blank" rel="noreferrer"
              className="btn-ghost"
            >
              Browse the full catalogue on GitHub
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
