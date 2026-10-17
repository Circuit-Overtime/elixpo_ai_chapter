"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Contact, Bird, Image as ImageIcon, Worm, Compass, BookOpen, Car,
  Cloud, GitCommit, User, Gamepad2, HardDrive, Palette, PawPrint,
  Cpu, Wifi, Bluetooth, RefreshCw, Settings, ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import type { AppEntry, AppIconId } from "@/data/apps";

const ICONS: Record<AppIconId, LucideIcon> = {
  Contact, Bird, Image: ImageIcon, Worm, Compass, BookOpen, Car, Cloud,
  GitCommit, User, Gamepad2, HardDrive, Palette, PawPrint, Cpu, Wifi,
  Bluetooth, RefreshCw, Settings,
};

type Tint = { ring: string; glow: string; text: string };

const TINT: Record<AppEntry["tint"], Tint> = {
  primary: { ring: "ring-primary/40", glow: "shadow-[0_0_36px_rgba(255,93,104,0.22)]", text: "text-primary" },
  teal:    { ring: "ring-teal/40",    glow: "shadow-[0_0_36px_rgba(61,220,151,0.20)]", text: "text-teal" },
  gold:    { ring: "ring-gold/40",    glow: "shadow-[0_0_36px_rgba(255,209,102,0.18)]",text: "text-gold" },
  lilac:   { ring: "ring-lilac/40",   glow: "shadow-[0_0_36px_rgba(162,155,254,0.20)]",text: "text-lilac" },
};

/* Icon tile reused by AppCard + the detail-page related strip — keeps
 * the "real PNG with letter fallback" logic in one place. */
function IconTile({
  app, tint, Icon,
}: {
  app: AppEntry;
  tint: Tint;
  Icon: LucideIcon;
}) {
  const [pngOk, setPngOk] = useState(true);
  return (
    <div className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden
                     rounded-md bg-card-sub p-2 ring-2 ring-inset
                     ${tint.ring} ${tint.text}`}>
      {app.pngIcon && pngOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.pngIcon}
          alt=""
          aria-hidden="true"
          onError={() => setPngOk(false)}
          className="h-full w-full object-contain"
          style={{ imageRendering: "pixelated" }}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Icon className="h-6 w-6" />
      )}
    </div>
  );
}

export default function AppCard({
  app,
  index = 0,
}: {
  app: AppEntry;
  index?: number;
}) {
  const tint = TINT[app.tint] ?? TINT.primary;
  const Icon = ICONS[app.icon] ?? Cpu;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.04 * (index % 6),
      }}
      whileHover={{ y: -4 }}
      className={`card-surface group relative overflow-hidden hover:border-text/30
                  ${tint.glow}`}
    >
      <Link
        href={`/apps/${app.urlSlug}/`}
        className="block p-5"
        aria-label={`Open details for ${app.name}`}
      >
        <div className="flex items-start gap-4">
          <IconTile app={app} tint={tint} Icon={Icon} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`truncate font-display text-lg ${tint.text}`}>
                {app.name}
              </h3>
              <span className="chip">{app.category}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-text-dim">
              {app.blurb}
            </p>
          </div>
          <ArrowUpRight
            className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0
                       transition-all duration-300
                       group-hover:translate-x-0.5 group-hover:-translate-y-0.5
                       group-hover:opacity-100 group-hover:text-text"
          />
        </div>
      </Link>

      <motion.div
        className="pointer-events-none absolute inset-x-5 bottom-0 h-px origin-left
                   bg-gradient-to-r from-transparent via-primary to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        whileHover={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.35 }}
      />
    </motion.div>
  );
}
