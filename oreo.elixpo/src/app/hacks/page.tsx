"use client";

import { motion } from "framer-motion";
import { Reveal, fadeUp, staggerContainer } from "@/components/MotionWrap";
import { Clock, Wrench, ExternalLink } from "lucide-react";

type Hack = {
  slug: string;
  title: string;
  body: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  mins: number;
  href: string;
};

const HACKS: Hack[] = [
  { slug: "github-handle", title: "Set Your GitHub Handle",
    body: "Edit secrets.py so the badge app pulls your live GitHub profile stats.",
    difficulty: "beginner", mins: 5,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/github-handle.md" },
  { slug: "gallery-photo", title: "Add Your Photo to Gallery",
    body: "Drop a PNG into apps/gallery/assets/raw/, deploy, watch it land in the carousel.",
    difficulty: "beginner", mins: 8,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/gallery-photo.md" },
  { slug: "commits-brick", title: "Add the Commits Brick-Breaker",
    body: "Install the Commits arcade so you can bat merge balls through a wall of green squares.",
    difficulty: "beginner", mins: 15,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/commits-brick.md" },
  { slug: "custom-theme", title: "Theme the OS in your colours",
    body: "Edit oreoOS/theme.py to retint the whole UI in a single commit.",
    difficulty: "beginner", mins: 10,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/custom-theme.md" },
  { slug: "ir-quest", title: "Build an IR-Quest beacon",
    body: "Wire a TSOP38 to a spare ESP and beam tokens to nearby badges.",
    difficulty: "intermediate", mins: 30,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/ir-quest.md" },
  { slug: "imu-tilt", title: "Tilt-to-scroll any app",
    body: "Pull the MPU6050 accel readings into your update() and remap UP/DOWN.",
    difficulty: "intermediate", mins: 25,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/imu-tilt.md" },
  { slug: "custom-app", title: "Ship your first app",
    body: "manifest.json + main.py — 30 lines, lands in the drawer.",
    difficulty: "intermediate", mins: 45,
    href: "https://github.com/elixpo/oreo/blob/main/CONTRIBUTING.md#building-an-app" },
  { slug: "ota-self-host", title: "Self-host OTA updates",
    body: "Point the OTA module at your own GitHub fork — ship private builds to your badge.",
    difficulty: "advanced", mins: 60,
    href: "https://github.com/elixpo/oreo/blob/main/docs/hacks/ota-fork.md" },
  { slug: "pcb-design", title: "Spin a PCB",
    body: "Use the KiCad project in /docs/hardware/ as a starting point for a v2 board.",
    difficulty: "advanced", mins: 240,
    href: "https://github.com/elixpo/oreo/tree/main/docs/hardware" },
];

const DIFF_TINT = {
  beginner:     { bg: "bg-teal/10",   text: "text-teal",   border: "border-teal/30" },
  intermediate: { bg: "bg-gold/10",   text: "text-gold",   border: "border-gold/30" },
  advanced:     { bg: "bg-lilac/10", text: "text-lilac", border: "border-lilac/30" },
};

export default function HacksPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute left-1/3 top-0 h-[420px] w-[420px] rounded-full bg-gold/[0.10]  blur-[140px]" />
        <div className="absolute right-1/4 top-32 h-[260px] w-[260px] rounded-full bg-lilac/[0.10] blur-[120px]" />
        <div className="absolute left-1/4 top-48  h-[220px] w-[220px] rounded-full bg-teal/[0.08]  blur-[120px]" />
      </div>
      <div className="container-page pt-16 pb-28">
      <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
        <motion.span variants={fadeUp} className="chip mb-6">
          <Wrench className="h-3 w-3" /> open hardware, open invitation
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
        >
          Customize Your Badge.{" "}
          <span className="bg-gradient-to-r from-primary via-gold to-lilac
                           bg-clip-text text-transparent
                           drop-shadow-[0_0_30px_rgba(255,93,104,0.35)]">
            Make it weird.
          </span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-text-dim">
          Step-by-step recipes for retinting the OS, writing your first
          app, or wiring extra sensors. Each hack is one Markdown file
          on the repo — copy, paste, deploy.
        </motion.p>
      </motion.div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {HACKS.map((h, i) => {
          const t = DIFF_TINT[h.difficulty];
          return (
            <motion.a
              key={h.slug}
              href={h.href}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: 0.04 * (i % 6), duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="card-surface group flex flex-col p-6 hover:border-primary/40"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-display text-lg leading-tight">{h.title}</h3>
                <span className={`chip ${t.bg} ${t.text} ${t.border} border`}>
                  {h.difficulty}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-text-dim">{h.body}</p>
              <div className="mt-5 flex items-center justify-between text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {h.mins < 60 ? `${h.mins} min` : `${Math.round(h.mins / 60)} h`}
                </span>
                <span className="inline-flex items-center gap-1 transition-colors
                                 group-hover:text-primary">
                  Try this hack <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </motion.a>
          );
        })}
      </div>

      <Reveal>
        <div className="mt-16 rounded-lg border border-border bg-bg-raised/40 p-8">
          <h2 className="font-display text-2xl">Got an idea for a hack?</h2>
          <p className="mt-2 text-text-dim">
            Write it up as Markdown, drop it in <code className="text-text">docs/hacks/</code>,
            send a PR. We'll surface it here.
          </p>
          <a
            href="https://github.com/elixpo/oreo/tree/main/docs/hacks"
            target="_blank" rel="noreferrer"
            className="btn-primary mt-5"
          >
            Open hacks folder on GitHub
          </a>
        </div>
      </Reveal>
      </div>
    </div>
  );
}
