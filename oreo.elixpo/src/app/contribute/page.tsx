"use client";

import { motion } from "framer-motion";
import { Reveal, fadeUp, staggerContainer } from "@/components/MotionWrap";
import MarkdownView from "@/components/MarkdownView";
import {
  GitPullRequest, Bug, BookOpen, Code2, Heart, ExternalLink,
  FolderTree,
} from "lucide-react";

const TRACKS = [
  { Icon: Code2,           title: "Write an app",
    body: "manifest.json + a thin main.py shim + a src/ folder for modular code. apps/snake/ is the reference layout — see the App structure guide below for the full convention.",
    href: "/docs/apps",
    tint: "text-primary"  as const },
  { Icon: Bug,             title: "Fix a bug",
    body: "Open issues are labelled by area (os / store / ota / wifi / bt). 'good first issue' tags exist; pair them with a serial log.",
    href: "https://github.com/elixpo/oreo/issues",
    tint: "text-teal" as const },
  { Icon: BookOpen,        title: "Write a hack",
    body: "Drop Markdown into docs/hacks/ — we feature it on /hacks the next deploy.",
    href: "https://github.com/elixpo/oreo/tree/main/docs/hacks",
    tint: "text-gold" as const },
  { Icon: GitPullRequest,  title: "Improve the OS",
    body: "Performance, polish, new services. Big changes — open a draft PR early so we can review the shape.",
    href: "https://github.com/elixpo/oreo/tree/main/oreoOS",
    tint: "text-lilac" as const },
];

export default function ContributePage() {
  return (
    <div className="relative">
      {/* Soft glows so the page reads as part of the brand even
          without the canvas hero. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[320px] w-[320px]
                        rounded-full bg-primary/[0.08] blur-[120px]" />
        <div className="absolute right-1/4 top-20 h-[260px] w-[260px]
                        rounded-full bg-lilac/[0.10] blur-[120px]" />
      </div>

      <div className="container-page pt-16 pb-28">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
          <motion.span variants={fadeUp} className="chip mb-6">
            <Heart className="h-3 w-3 text-primary" /> made by humans, with humans
          </motion.span>
          <motion.h1
            variants={fadeUp}
            className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
          >
            Contribute to Oreo.{" "}
            <span className="bg-gradient-to-r from-primary via-gold to-lilac
                             bg-clip-text text-transparent">
              Bring snacks.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-text-dim">
            OreoOS is open: code, hardware, prompts, assets, the lot.
            Pick a lane — or invent one. We merge fast and credit loudly.
          </motion.p>
        </motion.div>

        {/* Contribution tracks */}
        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {TRACKS.map((t, i) => (
            <motion.a
              key={t.title}
              href={t.href}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="card-surface group flex items-start gap-4 p-6 hover:border-primary/40"
            >
              <div className={`grid h-11 w-11 shrink-0 place-items-center
                               rounded-md bg-card-sub ${t.tint}`}>
                <t.Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg leading-tight">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-dim">{t.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted
                                 transition-colors group-hover:text-primary">
                  Open <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </motion.a>
          ))}
        </div>

        {/* App structure overview — short version of the /docs/apps
            convention. Links into the dedicated docs page for the
            full lifecycle reference + code samples. */}
        <Reveal>
          <div className="mt-20 rounded-lg border border-border bg-bg-raised/40 p-8 sm:p-10">
            <div className="mb-3 flex items-center gap-3">
              <FolderTree className="h-5 w-5 text-primary" />
              <h2 className="font-display text-2xl tracking-tight">
                App structure
              </h2>
            </div>
            <p className="mb-6 max-w-3xl text-sm text-text-dim">
              Every app on the badge lives in{" "}
              <code className="text-text">apps/&lt;name&gt;/</code>. The launcher
              loads <code className="text-text">main.py</code> and reads an{" "}
              <code className="text-text">App</code> class off it &mdash; but{" "}
              <code className="text-text">main.py</code> is now a thin
              re-export shim. Real code lives under{" "}
              <code className="text-text">src/</code> so logic, rendering,
              and persistence each get their own file. Easier to read,
              easier to test on a laptop.
            </p>
            <pre className="mb-6 overflow-x-auto rounded-md border border-border
                             bg-bg p-4 text-xs leading-relaxed text-text-dim">
{`apps/snake/
├── manifest.json     name, author, icon, version
├── main.py           thin shim: from .src.app import App
├── __init__.py       (empty, makes it a package)
└── src/
    ├── __init__.py
    ├── app.py        App class — lifecycle hooks only
    ├── game.py       pure game logic + constants
    ├── render.py     drawing functions
    └── highscore.py  persistent best-score I/O`}
            </pre>
            <p className="text-sm text-text-dim">
              See{" "}
              <a href="/docs/apps"
                 className="text-primary underline decoration-primary/40
                            underline-offset-2 hover:decoration-primary">
                the full app guide
              </a>{" "}
              for lifecycle hooks, manifest fields, drawing APIs, and a
              walkthrough of the snake reference app.
            </p>
          </div>
        </Reveal>

        {/* CONTRIBUTING.md — fetched from /public at runtime and rendered
            through a tiny inline markdown formatter. The file is also a
            real on-disk asset at /CONTRIBUTING.md if a contributor wants
            the source. */}
        <Reveal>
          <div className="mt-20 rounded-lg border border-border bg-bg-raised/40 p-8 sm:p-10">
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 className="font-display text-2xl tracking-tight">
                The full contributing guide
              </h2>
              <a
                href="/CONTRIBUTING.md"
                target="_blank" rel="noreferrer"
                className="text-xs text-muted hover:text-text"
              >
                view raw →
              </a>
            </div>
            <p className="mb-6 text-sm text-muted">
              Mirrored verbatim from the repo's CONTRIBUTING.md. Edits to
              the source on GitHub re-deploy here automatically.
            </p>
            <MarkdownView url="/CONTRIBUTING.md" />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
