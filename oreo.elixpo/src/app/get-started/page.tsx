"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal, fadeUp, staggerContainer } from "@/components/MotionWrap";
import { Download, Terminal, Usb, Github } from "lucide-react";

const STEPS = [
  { n: "01", t: "Flash MicroPython",      b: "Download the ESP32-S3 build, hold the BOOT button, flash via esptool. Two-minute job." },
  { n: "02", t: "Clone the OS",            b: "`git clone https://github.com/elixpo/oreo` and copy `.env.example` → `.env` with your WiFi credentials." },
  { n: "03", t: "Deploy",                  b: "`python tools/deploy.py` — pushes everything over USB, skips unchanged files, bumps the version." },
  { n: "04", t: "Open the badge",          b: "Drawer → Settings → WiFi → Send files. Cloudflare-served `/upload` works from any phone on the same WiFi." },
];

export default function GetStartedPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute left-1/4 top-0  h-[400px] w-[400px] rounded-full bg-primary/[0.10] blur-[140px]" />
        <div className="absolute right-1/3 top-40 h-[260px] w-[260px] rounded-full bg-teal/[0.10]    blur-[120px]" />
      </div>
      <div className="container-page pt-16 pb-28">
      <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
        <motion.span variants={fadeUp} className="chip mb-6">~15 minutes · USB-C + a computer</motion.span>
        <motion.h1
          variants={fadeUp}
          className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
        >
          From box to badge,{" "}
          <span className="bg-gradient-to-r from-primary via-gold to-lilac
                           bg-clip-text text-transparent
                           drop-shadow-[0_0_30px_rgba(255,93,104,0.35)]">
            in four steps.
          </span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-text-dim">
          The deploy script handles version bumps, hash-cache pruning,
          free-space guards, and secrets generation. You hold the BOOT
          button, you wait, you tap A.
        </motion.p>
      </motion.div>

      <Reveal>
        <ol className="mt-14 grid gap-5">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.06 * i, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="card-surface relative overflow-hidden p-6"
            >
              <div className="flex items-start gap-5">
                <span className="font-display text-3xl text-primary/70">{s.n}</span>
                <div className="flex-1">
                  <h3 className="font-display text-xl">{s.t}</h3>
                  <p className="mt-2 text-text-dim">{s.b}</p>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </Reveal>

      <Reveal>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <CTA icon={<Download className="h-4 w-4" />} title="MicroPython firmware"
               body="ESP32-S3 build matching your flash size."
               href="https://micropython.org/download/ESP32_GENERIC_S3/" />
          <CTA icon={<Terminal className="h-4 w-4" />} title="mpremote"
               body="Talks to the badge over USB serial."
               href="https://docs.micropython.org/en/latest/reference/mpremote.html" />
          <CTA icon={<Github className="h-4 w-4" />} title="Repo"
               body="Source, schematics, CHANGELOG."
               href="https://github.com/elixpo/oreo" />
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-16 rounded-md border border-border bg-bg-raised/40 p-6 text-sm text-text-dim">
          <p className="text-text">Need help?</p>
          <p className="mt-2">
            Open an issue with your serial-console log
            (<code className="text-text-dim">mpremote connect /dev/ttyACM0 repl</code>) —
            the project's print breadcrumbs make most boot failures
            diagnosable in one round trip.
          </p>
        </div>
      </Reveal>
      </div>
    </div>
  );
}

function CTA({ icon, title, body, href }: { icon: React.ReactNode; title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="card-surface group flex items-start gap-3 p-5
                 hover:border-primary/40"
    >
      <div className="grid h-9 w-9 place-items-center rounded-md
                      bg-card-sub text-primary">
        {icon}
      </div>
      <div>
        <p className="font-display text-base">{title}</p>
        <p className="mt-1 text-xs text-text-dim">{body}</p>
      </div>
    </Link>
  );
}
