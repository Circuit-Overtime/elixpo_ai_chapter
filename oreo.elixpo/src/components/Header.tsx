"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Github, Star, GitFork, Home, Rocket, Cpu, LayoutGrid,
  Wrench, GitPullRequest, BookOpen, FileText,
} from "lucide-react";
import { useGithubStats } from "@/lib/useGithubStats";

const NAV = [
  { href: "/",            label: "Home",        Icon: Home },
  { href: "/get-started/",label: "Get Started", Icon: Rocket },
  { href: "/badge/",      label: "Badge",       Icon: Cpu },
  { href: "/apps/",       label: "Apps",        Icon: LayoutGrid },
  { href: "/docs/",      label: "Docs",        Icon: BookOpen },
  { href: "/paper/",     label: "Paper",       Icon: FileText },
  { href: "/hacks/",      label: "Hacks",       Icon: Wrench },
  { href: "/contribute/", label: "Contribute",  Icon: GitPullRequest },
];

function fmtCount(n: number | null): string {
  if (n === null) return "–";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (n >= 1000)   return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

export default function Header() {
  const pathname = usePathname();
  const { stars, forks } = useGithubStats();

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y:   0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-40 border-b border-border/60 bg-bg/80
                 backdrop-blur supports-[backdrop-filter]:bg-bg/60"
    >
      <div className="container-page flex h-16 items-center justify-between">
        {/* Logo + wordmark */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative h-9 w-9 overflow-hidden rounded-md
                          border border-primary/40 bg-bg-raised
                          shadow-[0_0_24px_rgba(255,93,104,0.25)]
                          transition-transform group-hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.ico"
              alt="OreoOS"
              className="absolute inset-0 h-full w-full object-contain p-0.5"
              loading="eager"
              decoding="async"
            />
          </div>
          <span className="font-display text-2xl tracking-tight">Oreo</span>
        </Link>

        {/* Centre nav with per-item icons */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative inline-flex items-center gap-1.5 rounded-md
                            px-3 py-2 text-xs uppercase tracking-widest
                            transition-colors
                            ${active ? "text-text" : "text-muted hover:text-text"}`}
              >
                <n.Icon className="h-3.5 w-3.5" />
                {n.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-px h-px bg-primary"
                    transition={{ type: "spring", stiffness: 340, damping: 28 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Live GitHub stats chip */}
        <a
          href="https://github.com/elixpo/oreo"
          target="_blank" rel="noreferrer"
          className="flex items-center gap-3 rounded-md border border-border
                     bg-bg-raised px-3 py-2 text-xs text-text-dim
                     transition-colors hover:border-primary/60 hover:text-text"
          title={stars !== null ? `${stars} stars · ${forks} forks` : "GitHub"}
        >
          <Github className="h-4 w-4" />
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="font-semibold text-text">elixpo/oreo</span>
            <span className="flex items-center gap-2 text-muted">
              <Star className="h-3 w-3" /> {fmtCount(stars)}
              <GitFork className="h-3 w-3" /> {fmtCount(forks)}
            </span>
          </div>
        </a>
      </div>
    </motion.header>
  );
}
