"use client";

import { motion } from "framer-motion";
import { Reveal, fadeUp, staggerContainer } from "@/components/MotionWrap";
import {
  FolderTree, Code2, Layers, Cog, Palette, Save,
  ExternalLink, ArrowRight,
} from "lucide-react";

/* /docs/apps — the full "how to write a badge app" reference.
 *
 * Pairs with the short overview on /contribute. This page goes deep:
 * directory layout, lifecycle hooks, manifest fields, drawing API,
 * input model, and a walkthrough of snake as the reference app.
 *
 * Static markup — no runtime data dependencies — so the Next.js
 * static export ships it as a flat HTML page.
 */

export default function AppDocsPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[320px] w-[320px]
                        rounded-full bg-primary/[0.08] blur-[120px]" />
        <div className="absolute right-1/4 top-20 h-[260px] w-[260px]
                        rounded-full bg-teal/[0.10] blur-[120px]" />
      </div>

      <div className="container-page pt-16 pb-28">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
          <motion.span variants={fadeUp} className="chip mb-6">
            <FolderTree className="h-3 w-3 text-primary" /> docs · writing apps
          </motion.span>
          <motion.h1
            variants={fadeUp}
            className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
          >
            Write an app for the badge.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-text-dim">
            Apps on OreoOS are plain Python packages. One manifest, one
            shim, and a <code className="text-text">src/</code> tree that
            you organise however your app needs. The launcher discovers
            it automatically.
          </motion.p>
        </motion.div>

        {/* ── Directory layout ───────────────────────────────────── */}
        <Reveal>
          <section className="mt-16">
            <div className="mb-3 flex items-center gap-3">
              <FolderTree className="h-5 w-5 text-primary" />
              <h2 className="font-display text-2xl tracking-tight">
                Directory layout
              </h2>
            </div>
            <p className="mb-6 max-w-3xl text-sm text-text-dim">
              Every app lives in <code className="text-text">apps/&lt;name&gt;/</code>.
              The launcher imports{" "}
              <code className="text-text">apps.&lt;name&gt;.main</code> and
              reads <code className="text-text">App</code> off it — so{" "}
              <code className="text-text">main.py</code> is required, but
              it's a 2-line shim. Your actual code lives under{" "}
              <code className="text-text">src/</code>.
            </p>
            <pre className="overflow-x-auto rounded-md border border-border
                            bg-bg p-4 text-xs leading-relaxed text-text-dim">
{`apps/snake/
├── manifest.json     name, author, icon, version, category
├── main.py           thin shim — re-exports App from src/
├── __init__.py       empty; makes it a Python package
├── assets/           optional — sprites, fonts, optimised images
│   ├── raw/          source images (host-only, never on flash)
│   └── optimized/    .py modules baked by tools/optimize_assets.py
├── hiscore.txt       optional — written by the app at runtime
└── src/              your code, split however you like
    ├── __init__.py
    ├── app.py        App class — lifecycle hooks only
    ├── game.py       pure logic + constants
    ├── render.py     drawing
    └── highscore.py  file I/O`}
            </pre>
            <p className="mt-4 max-w-3xl text-sm text-text-dim">
              The split inside <code className="text-text">src/</code> is{" "}
              <em>your call</em> — Snake uses logic / render / persistence,
              but a simpler app might be a single{" "}
              <code className="text-text">src/app.py</code>, and a complex
              game can have a dozen modules. The deploy script pushes every
              <code className="text-text"> .py</code> under{" "}
              <code className="text-text">src/</code> recursively.
            </p>
          </section>
        </Reveal>

        {/* ── main.py shim ──────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <Code2 className="h-5 w-5 text-teal" />
              <h2 className="font-display text-2xl tracking-tight">
                The main.py shim
              </h2>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-text-dim">
              The launcher requires <code className="text-text">main.py</code> and
              looks for a class named <code className="text-text">App</code>{" "}
              on it. Re-export from your <code className="text-text">src/</code>{" "}
              package and you're done:
            </p>
            <pre className="overflow-x-auto rounded-md border border-border
                            bg-bg p-4 text-xs leading-relaxed text-text">
{`# apps/snake/main.py

from .src.app import App

__all__ = ["App"]`}
            </pre>
            <p className="mt-4 max-w-3xl text-sm text-text-dim">
              That's the whole file. Real app code goes in{" "}
              <code className="text-text">src/app.py</code>.
            </p>
          </section>
        </Reveal>

        {/* ── manifest.json ──────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <Cog className="h-5 w-5 text-gold" />
              <h2 className="font-display text-2xl tracking-tight">
                manifest.json
              </h2>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-text-dim">
              Metadata the launcher reads at boot to populate the app
              drawer. All fields are required except{" "}
              <code className="text-text">icon</code> (defaults to a
              generic tile).
            </p>
            <pre className="overflow-x-auto rounded-md border border-border
                            bg-bg p-4 text-xs leading-relaxed text-text">
{`{
  "name":     "Snake",
  "author":   "Circuit-Overtime",
  "version":  "1.0.0",
  "category": "game",
  "icon":     "snake"
}`}
            </pre>
            <ul className="mt-4 max-w-3xl space-y-2 text-sm text-text-dim">
              <li><b className="text-text">name</b> — display name in the drawer (under the tile).</li>
              <li><b className="text-text">author</b> — GitHub handle shown on the about screen.</li>
              <li><b className="text-text">version</b> — semver; bumped by your PR.</li>
              <li><b className="text-text">category</b> — <code>game</code> / <code>tool</code> / <code>system</code>. Affects drawer grouping.</li>
              <li><b className="text-text">icon</b> — stem of a sprite in <code>assets/icons/optimized/</code> (e.g. <code>"snake"</code> → <code>snake.py</code>).</li>
            </ul>
          </section>
        </Reveal>

        {/* ── Lifecycle hooks ────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <Layers className="h-5 w-5 text-lilac" />
              <h2 className="font-display text-2xl tracking-tight">
                Lifecycle hooks
              </h2>
            </div>
            <p className="mb-6 max-w-3xl text-sm text-text-dim">
              The OS calls four methods on your <code className="text-text">App</code>{" "}
              instance — implement what you need, ignore what you don't.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Hook
                sig="on_enter(os)"
                body="Called once when the user opens the app. Set up state, load assets, snapshot any persistent values. The os object exposes settings, display, buttons, and notifications."
              />
              <Hook
                sig="update(dt)"
                body="Called every frame (~30 FPS). dt is seconds since last frame. Advance game state, tick animations, poll sensors. No drawing here."
              />
              <Hook
                sig="draw(d)"
                body="Called every frame after update(). d is the display. Paint your scene. Set self._dirty = False at the end if you want to skip redraws when nothing changed."
              />
              <Hook
                sig="on_button_press(btn)"
                body="Called when a button goes down. btn is one of api.BTN_UP / DOWN / LEFT / RIGHT / A / B / HOME. HOME is reserved by the launcher — it pops back to the drawer."
              />
            </div>
            <pre className="mt-6 overflow-x-auto rounded-md border border-border
                            bg-bg p-4 text-xs leading-relaxed text-text-dim">
{`# apps/snake/src/app.py (excerpt)

import oreoOS
from oreoOS import api, theme, widgets

from . import game, render, highscore


class App(oreoOS.App):
    name = "Snake"

    def on_enter(self, os):
        self._os    = os
        self._state = game.INTRO
        self._hi    = highscore.load()
        self._snake = game.initial_snake()
        # ... initial state ...

    def update(self, dt):
        if self._state != game.PLAY: return
        # ... advance snake by one cell when step timer fires ...

    def draw(self, d):
        d.clear(theme.BG)
        widgets.draw_header(d, "SNAKE")
        render.draw_arena(d, self._snake, self._food, self._food_sprite)
        widgets.draw_hint(d, "A=start  B=pause  arrows=move")

    def on_button_press(self, btn):
        if btn == api.BTN_A and self._state == game.INTRO:
            self._start()`}
            </pre>
          </section>
        </Reveal>

        {/* ── Drawing API ───────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <Palette className="h-5 w-5 text-primary" />
              <h2 className="font-display text-2xl tracking-tight">
                Drawing API
              </h2>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-text-dim">
              Screen is 320×240 landscape. The display object{" "}
              <code className="text-text">d</code> passed to{" "}
              <code className="text-text">draw()</code> exposes a small set
              of primitives:
            </p>
            <ul className="max-w-3xl space-y-2 text-sm text-text-dim">
              <li>
                <code className="text-text">d.clear(color)</code> — fill the
                whole framebuffer.
              </li>
              <li>
                <code className="text-text">d.rect(x, y, w, h, color, fill=True)</code>
                {" "}— solid or outlined rectangle.
              </li>
              <li>
                <code className="text-text">d.text(s, x, y, color, scale=1)</code>
                {" "}— bitmap text at the given scale (1, 2, or 3).
              </li>
              <li>
                <code className="text-text">d.blit(data, x, y, w, h)</code>
                {" "}— stamp an RGB565 sprite. Magenta is the chroma key for
                transparency.
              </li>
              <li>
                <code className="text-text">d.blit_scale(data, x, y, w, h, scale)</code>
                {" "}— integer upscale of a sprite during stamping.
              </li>
            </ul>
            <p className="mt-4 max-w-3xl text-sm text-text-dim">
              Use <code className="text-text">widgets.draw_header(d, "TITLE")</code>{" "}
              and <code className="text-text">widgets.draw_hint(d, "...")</code>{" "}
              for the standard chrome — the badge looks more consistent if
              every app uses them.
            </p>
          </section>
        </Reveal>

        {/* ── Persistence ───────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <Save className="h-5 w-5 text-teal" />
              <h2 className="font-display text-2xl tracking-tight">
                Persistence
              </h2>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-text-dim">
              Two options:
            </p>
            <ul className="max-w-3xl space-y-3 text-sm text-text-dim">
              <li>
                <b className="text-text">OS settings</b> — for small
                key/value state shared across launches:{" "}
                <code className="text-text">os.settings_get(key, default)</code>{" "}
                /{" "}
                <code className="text-text">os.settings_set(key, value)</code>.
                Backed by a single JSON file the OS manages for you.
              </li>
              <li>
                <b className="text-text">Plain files</b> — for larger or
                custom data, just{" "}
                <code className="text-text">open()</code> a file under your
                app dir. Snake's hi-score lives at{" "}
                <code className="text-text">apps/snake/hiscore.txt</code>.
                Wrap I/O in <code className="text-text">try</code> blocks
                so a full or read-only flash doesn't crash the app.
              </li>
            </ul>
          </section>
        </Reveal>

        {/* ── Deploying ─────────────────────────────────────────── */}
        <Reveal>
          <section className="mt-14">
            <div className="mb-3 flex items-center gap-3">
              <ArrowRight className="h-5 w-5 text-gold" />
              <h2 className="font-display text-2xl tracking-tight">
                Deploying to the badge
              </h2>
            </div>
            <p className="mb-4 max-w-3xl text-sm text-text-dim">
              From the repo root, with the badge connected over USB:
            </p>
            <pre className="overflow-x-auto rounded-md border border-border
                            bg-bg p-4 text-xs leading-relaxed text-text">
{`python tools/deploy.py            # auto-detect port, push diffs
python tools/deploy.py --force    # ignore hash cache, push everything
python tools/deploy.py --clean    # wipe device first`}
            </pre>
            <p className="mt-4 max-w-3xl text-sm text-text-dim">
              The script auto-discovers any directory under{" "}
              <code className="text-text">apps/</code> that has both{" "}
              <code className="text-text">main.py</code> and{" "}
              <code className="text-text">manifest.json</code>, plus its
              entire <code className="text-text">src/</code> subtree. No
              entry in <code className="text-text">tools/deploy.py</code>{" "}
              to edit.
            </p>
          </section>
        </Reveal>

        {/* ── Snake reference ───────────────────────────────────── */}
        <Reveal>
          <section className="mt-14 rounded-lg border border-border bg-bg-raised/40 p-8 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl tracking-tight">
                  Read the reference: apps/snake/
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-text-dim">
                  Snake is the canonical example for this layout. About
                  350 lines split across four modules, each under 150
                  lines. If you're stuck, start by reading{" "}
                  <code className="text-text">src/app.py</code> —
                  it's the smallest and shows how the pieces wire together.
                </p>
              </div>
              <a
                href="https://github.com/elixpo/oreo/tree/main/apps/snake"
                target="_blank" rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5
                           rounded-md border border-border bg-bg px-3 py-2
                           text-xs text-text hover:border-primary/50
                           hover:text-primary"
              >
                View on GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </section>
        </Reveal>

      </div>
    </div>
  );
}

function Hook({ sig, body }: { sig: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-raised/50 p-4">
      <code className="text-sm font-semibold text-primary">{sig}</code>
      <p className="mt-2 text-xs leading-relaxed text-text-dim">{body}</p>
    </div>
  );
}
