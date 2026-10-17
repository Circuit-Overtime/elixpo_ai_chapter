"use client";

/*
 * Reactive canvas hero — adapted from the shadcn `glowy-waves-hero`
 * reference dropped in plan.md.
 *
 * Differences from the original:
 *   • Uses our brand palette + copy instead of shadcn's `--primary` etc.
 *     (theme tokens are still read from CSS vars so future theme tweaks
 *     reflow automatically).
 *   • Replaces the shadcn <Button> import with our existing
 *     btn-primary / btn-ghost utility classes — we don't ship the
 *     shadcn machinery yet and don't need it for two CTAs.
 *   • Respects prefers-reduced-motion (slower smoothing, less mouse
 *     influence) so we don't ship a "fancy" hero that's hostile to
 *     vestibular-sensitive users.
 *   • Uses one allocation-free 60 fps loop, precomputed geometry and a
 *     desynchronised canvas. Theme colours and gradients are rebuilt only
 *     when their inputs change.
 */

import { motion, type Variants } from "framer-motion";
import { ArrowRight, Sparkles, Github } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

type Point = { x: number; y: number };

type WaveConfig = {
  offset:    number;
  amplitude: number;
  frequency: number;
  color:     string;
  opacity:   number;
};

const HIGHLIGHT_PILLS = [
  "Open hardware",
  "Open firmware",
  "On-device app store",
  "24 FPS native video",
] as const;

const HERO_STATS: { label: string; value: string }[] = [
  { label: "First-party apps", value: "20+" },
  { label: "MicroPython",      value: "1.28" },
  { label: "Native video",     value: "24 FPS" },
];

const containerVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0,
             transition: { duration: 0.8, staggerChildren: 0.12 } },
};

const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0,
             transition: { duration: 0.6, ease: "easeOut" } },
};

const statsVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1,
             transition: { duration: 0.6, ease: "easeOut", staggerChildren: 0.08 } },
};

export default function WavesHero() {
  const canvasRef       = useRef<HTMLCanvasElement | null>(null);
  const mouseRef        = useRef<Point>({ x: 0, y: 0 });
  const targetMouseRef  = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;

    /* Visibility-driven RAF gating. The hero is the most CPU-hungry
     * thing on the site (canvas + 5 wave passes per frame at 60 fps).
     * Whenever it scrolls off-screen we cancel the RAF and let the
     * browser reclaim the GPU/CPU; IntersectionObserver restarts it
     * when the user scrolls back. document.hidden also pauses on tab
     * background. Together these drop the idle-tab cost to ~0%. */
    let animationId: number = 0;
    let isVisible    = true;
    let docHidden    = false;
    let centerY      = 0;
    let bounds       = canvas.getBoundingClientRect();
    let background: CanvasGradient | string = "#09090b";
    let xSamples     = new Float32Array(0);
    let influence    = new Float32Array(0);
    const running    = () => isVisible && !docHidden;

    /* Pull live colour values off the CSS variables we set in
       globals.css. Re-runs on theme mutation. */
    const computeThemeColors = () => {
      const resolveColor = (variables: string[], alpha = 1) => {
        const tempEl = document.createElement("div");
        tempEl.style.cssText =
          "position:absolute;visibility:hidden;width:1px;height:1px;pointer-events:none";
        document.body.appendChild(tempEl);
        let color = `rgba(255,255,255,${alpha})`;
        for (const v of variables) {
          tempEl.style.backgroundColor = `var(${v})`;
          const computed = getComputedStyle(tempEl).backgroundColor;
          if (computed && computed !== "rgba(0, 0, 0, 0)") {
            if (alpha < 1) {
              const m = computed.match(
                /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
              );
              color = m ? `rgba(${m[1]},${m[2]},${m[3]},${alpha})` : computed;
            } else {
              color = computed;
            }
            break;
          }
        }
        document.body.removeChild(tempEl);
        return color;
      };

      return {
        backgroundTop:    resolveColor(["--background"], 1),
        backgroundBottom: resolveColor(["--card", "--background"], 0.95),
        wavePalette: [
          { offset: 0,             amplitude: 70, frequency: 0.0030,
            color: resolveColor(["--primary"],   0.85), opacity: 0.45 },
          { offset: Math.PI / 2,   amplitude: 90, frequency: 0.0026,
            color: resolveColor(["--secondary"], 0.70), opacity: 0.35 },
          { offset: Math.PI,       amplitude: 60, frequency: 0.0034,
            color: resolveColor(["--accent"],    0.55), opacity: 0.30 },
          { offset: Math.PI * 1.5, amplitude: 80, frequency: 0.0022,
            color: resolveColor(["--primary"],   0.25), opacity: 0.25 },
          { offset: Math.PI * 2,   amplitude: 55, frequency: 0.0040,
            color: resolveColor(["--foreground"],0.20), opacity: 0.20 },
        ] satisfies WaveConfig[],
      };
    };

    let themeColors = computeThemeColors();
    const rebuildBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, themeColors.backgroundTop);
      gradient.addColorStop(1, themeColors.backgroundBottom);
      background = gradient;
    };
    const observer = new MutationObserver(() => {
      themeColors = computeThemeColors();
      rebuildBackground();
    });
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ["class", "data-theme"],
    });

    const prefersReducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouseInfluence = prefersReducedMotion ? 10 : 70;
    const influenceRadius = prefersReducedMotion ? 160 : 320;
    const smoothing       = prefersReducedMotion ? 0.04 : 0.10;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;

    const resizeCanvas = () => {
      // Match the parent element's height instead of full viewport so
      // the canvas never bleeds past the hero section.
      const parent = canvas.parentElement;
      canvas.width  = parent?.clientWidth  ?? window.innerWidth;
      canvas.height = parent?.clientHeight ?? window.innerHeight;
      centerY = canvas.height / 2;
      bounds = canvas.getBoundingClientRect();
      // A slightly wider segment spacing on constrained/mobile CPUs removes
      // thousands of trig calls per second without a visible loss of curve
      // quality because Canvas interpolates between the points.
      const step = lowPower ? 7 : canvas.width > 1600 ? 6 : 5;
      const count = Math.ceil(canvas.width / step) + 1;
      xSamples = new Float32Array(count);
      influence = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        xSamples[i] = Math.min(canvas.width, i * step);
      }
      rebuildBackground();
    };
    const recenterMouse = () => {
      const c = { x: canvas.width / 2, y: canvas.height / 2 };
      mouseRef.current = c;
      targetMouseRef.current = c;
    };
    const handleResize    = () => { resizeCanvas(); recenterMouse(); };
    const handleMouseMove = (e: PointerEvent) => {
      targetMouseRef.current = {
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      };
    };
    const handleMouseLeave = () => recenterMouse();

    resizeCanvas();
    recenterMouse();
    window.addEventListener("resize", handleResize);
    canvas.addEventListener("pointermove", handleMouseMove, { passive: true });
    canvas.addEventListener("pointerleave", handleMouseLeave);

    const drawWave = (wave: WaveConfig, phase: number) => {
      ctx.beginPath();
      for (let i = 0; i < xSamples.length; i += 1) {
        const x = xSamples[i];
        const mouseEffect =
          influence[i] * mouseInfluence *
          Math.sin(phase * 0.5 + x * 0.01 + wave.offset);
        const y =
          centerY +
          Math.sin(x * wave.frequency + phase + wave.offset) *
            wave.amplitude +
          Math.sin(x * wave.frequency * 0.4 + phase * 1.5) *
            (wave.amplitude * 0.45) +
          mouseEffect;
        if (i === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.lineWidth   = 2.5;
      ctx.strokeStyle = wave.color;
      ctx.globalAlpha = wave.opacity;
      ctx.shadowBlur  = lowPower ? 12 : 24;
      ctx.shadowColor = wave.color;
      ctx.stroke();
    };

    const animate = (timestamp: number) => {
      if (!running()) { animationId = 0; return; }   // paused — leave loop
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * smoothing;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * smoothing;

      const mouseX = mouseRef.current.x;
      const dy = centerY - mouseRef.current.y;
      for (let i = 0; i < xSamples.length; i += 1) {
        const dx = xSamples[i] - mouseX;
        const distance = Math.sqrt(dx * dx + dy * dy);
        influence[i] = Math.max(0, 1 - distance / influenceRadius);
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const phase = timestamp * 0.00012;
      themeColors.wavePalette.forEach((wave) => drawWave(wave, phase));

      animationId = window.requestAnimationFrame(animate);
    };
    const kick = () => {
      if (!animationId && running()) {
        animationId = window.requestAnimationFrame(animate);
      }
    };
    kick();

    // Pause when off-screen.
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = !!entries[0]?.isIntersecting;
        kick();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    // Pause when tab is backgrounded.
    const onVisibility = () => {
      docHidden = document.hidden;
      kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointermove", handleMouseMove);
      canvas.removeEventListener("pointerleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, []);

  return (
    <section
      className="relative isolate flex min-h-[90vh] w-full items-center justify-center
                 overflow-hidden bg-background"
      role="region"
      aria-label="Hero"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Soft static glows behind the canvas — adds depth without
          extra paint cost. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2
                        rounded-full bg-primary/[0.06] blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px]
                        rounded-full bg-lilac/[0.07] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col
                      items-center px-6 py-24 text-center md:px-8 lg:px-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full"
        >
          <motion.div
            variants={itemVariants}
            className="mb-7 inline-flex items-center gap-2 rounded-pill
                       border border-border/40 bg-bg/60 px-4 py-2 text-xs
                       font-semibold uppercase tracking-[0.25em] text-text-dim
                       backdrop-blur"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            v1.4 · MicroPython · open source
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="mb-6 font-display text-4xl font-semibold leading-[1.05]
                       tracking-tight text-foreground md:text-6xl lg:text-7xl"
          >
            A python operating system,{" "}
            {/* Gradient stops are now warm-on-warm — primary →
                gold → lilac, all on the bright side of the palette
                — so the second half of the headline never dissolves
                into the page background. */}
            <span className="bg-gradient-to-r from-primary via-gold to-lilac
                             bg-clip-text text-transparent
                             drop-shadow-[0_0_30px_rgba(255,93,104,0.35)]">
              in a pocket-sized badge.
            </span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mx-auto mb-10 max-w-3xl text-lg leading-relaxed
                       text-text-dim md:text-xl"
          >
            OreoOS runs 20+ apps on a breadboard ESP32-S3 — a launcher,
            an on-device app store, OTA updates over WiFi, AirDrop-style
            file transfer, IR-quest peer-pairing, and a Tamagotchi panda
            that judges you for skipping meals.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/get-started/"
              className="btn-primary rounded-pill px-7 py-3 text-base uppercase tracking-[0.18em]"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/upload/"
              className="btn-ghost rounded-pill px-7 py-3 text-base uppercase tracking-[0.18em]
                         backdrop-blur"
            >
              Try file transfer
            </Link>
            <a
              href="https://github.com/elixpo/oreo"
              target="_blank" rel="noreferrer"
              className="btn-ghost rounded-pill px-7 py-3 text-base uppercase tracking-[0.18em]
                         backdrop-blur"
            >
              <Github className="h-4 w-4" /> Source
            </a>
          </motion.div>

          <motion.ul
            variants={itemVariants}
            className="mb-12 flex flex-wrap items-center justify-center gap-3
                       text-xs uppercase tracking-[0.2em] text-text-dim"
          >
            {HIGHLIGHT_PILLS.map((pill) => (
              <li
                key={pill}
                className="rounded-pill border border-border/40 bg-bg/60 px-4 py-2 backdrop-blur"
              >
                {pill}
              </li>
            ))}
          </motion.ul>

          <motion.div
            variants={statsVariants}
            className="grid gap-4 rounded-lg border border-border/40 bg-bg/60
                       p-6 backdrop-blur-sm sm:grid-cols-3"
          >
            {HERO_STATS.map((stat) => (
              <motion.div key={stat.label} variants={itemVariants} className="space-y-1">
                <div className="text-xs uppercase tracking-[0.3em] text-muted">
                  {stat.label}
                </div>
                <div className="font-display text-3xl text-foreground">
                  {stat.value}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
