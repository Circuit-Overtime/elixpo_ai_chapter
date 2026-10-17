"use client";

import React, { useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  ArrowUpRight, Sparkle, ExternalLink, Terminal, Download, Package, Code2
} from "lucide-react";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";

interface SpecRow {
  key: string;
  value: string;
  right: string;
}

interface NpmPackageCardProps {
  label: string;
  href: string;
  name: string;
  install: string;
  downloads: string;
  description: React.ReactNode;
  specs: SpecRow[];
}

// Shared NPM package card - identical aesthetic for LixSketch and LixEditor.
function NpmPackageCard({ label, href, name, install, downloads, description, specs }: NpmPackageCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-2xl bg-[#161616] relative overflow-hidden flex flex-col justify-between p-6 h-[420px] md:h-[440px] lg:h-[470px] border border-white/5 hover:border-primary/25 hover:bg-[#111a1a]/40 transition-all duration-300 group"
    >
      {/* Subtle glow / light flare at the top */}
      <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#111a1a]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Top label */}
      <div className="relative z-10 flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          <Sparkle className="h-3 w-3 text-white/70" strokeWidth={1.5} />
          <span className="uppercase tracking-[0.22em] text-[11px] text-white/70 font-mono">
            {label}
          </span>
          <Sparkle className="h-3 w-3 text-white/70" strokeWidth={1.5} />
        </div>
        <ArrowUpRight className="text-white/40 group-hover:text-primary transition-colors duration-300" size={16} strokeWidth={1.5} />
      </div>

      {/* npm artifact - fills the card's mid-space with package identity */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-3.5 py-4 w-full">
        {/* Floating package mark */}
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl liquid-glass border border-white/10 flex items-center justify-center shadow-inner group-hover:border-primary/25 transition-colors duration-300">
            <Package className="h-7 w-7 text-primary/80" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md bg-[#CB3837] text-white font-bold text-[9px] tracking-tight font-mono shadow-md">
            npm
          </span>
        </div>

        {/* Install command pill */}
        <div className="w-full max-w-[240px] liquid-glass rounded-lg px-3 py-2 flex items-center gap-2 border border-white/5">
          <Terminal size={12} className="text-primary/70 shrink-0" />
          <code className="text-[11px] font-mono text-white/85 truncate">
            <span className="text-white/40">$ </span>{install}
          </code>
        </div>

        {/* Faux registry badges */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/45">
          <span className="inline-flex items-center gap-1">
            <Download size={11} className="text-white/40" /> {downloads}
          </span>
          <span className="w-px h-3 bg-white/10" />
          <span>v1.x</span>
          <span className="w-px h-3 bg-white/10" />
          <span className="text-primary/70">MIT</span>
        </div>
      </div>

      {/* Bottom: title + description + spec grid */}
      <div className="relative z-10 w-full mb-1">
        <h4 className="text-2xl font-bold font-serif italic text-white mb-2 leading-tight group-hover:text-primary transition-colors">
          {name}
        </h4>
        <p className="text-xs text-[#DEDBC8]/80 leading-relaxed mb-6 font-mono">
          {description}
        </p>

        <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-2 gap-y-2.5 font-mono text-[10px] sm:text-[11px] text-white/80 border-t border-white/5 pt-4">
          {specs.map((row, i) => (
            <React.Fragment key={`${name}-spec-${i}`}>
              <span className="text-white/50">{row.key}</span>
              <Sparkle className="h-2.5 w-2.5 self-center text-white/35" strokeWidth={1.5} />
              <span className="truncate">{row.value}</span>
              <span className="text-right text-white/40 font-light">{row.right}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </a>
  );
}

interface VsCodeExtCardProps {
  label: string;
  href: string;
  name: string;
  install: string;
  installs: string;
  description: React.ReactNode;
}

// Shared VS Code extension card - identical aesthetic for both extensions,
// with a VS Code logo artifact mirroring the npm package mark.
function VsCodeExtCard({ label, href, name, install, installs, description }: VsCodeExtCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-2xl bg-[#161616] relative overflow-hidden flex flex-col justify-between p-5 md:p-6 flex-1 min-h-[210px] shadow-lg border border-white/5 hover:border-primary/25 hover:bg-[#111a1a]/40 transition-all duration-300 group"
    >
      <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#111a1a]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Top label */}
      <div className="relative z-10 flex items-center justify-between w-full">
        <span className="uppercase tracking-[0.22em] text-[11px] text-white/70 font-mono">{label}</span>
        <ArrowUpRight className="text-white/40 group-hover:text-primary transition-colors duration-300" size={16} strokeWidth={1.5} />
      </div>

      {/* VS Code logo artifact */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-3 py-3 w-full">
        <div className="relative">
          <div className="h-14 w-14 rounded-2xl liquid-glass border border-white/10 flex items-center justify-center shadow-inner group-hover:border-[#0098FF]/40 transition-colors duration-300">
            <Code2 className="h-7 w-7 text-[#3DA7F5]" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-1.5 -right-2 px-1.5 py-0.5 rounded-md bg-[#0078D4] text-white font-bold text-[8px] tracking-tight font-mono shadow-md">
            VS Code
          </span>
        </div>

        {/* Install command pill */}
        <div className="w-full max-w-[240px] liquid-glass rounded-lg px-3 py-2 flex items-center gap-2 border border-white/5">
          <Terminal size={12} className="text-primary/70 shrink-0" />
          <code className="text-[11px] font-mono text-white/85 truncate">
            <span className="text-white/40">&rsaquo; </span>{install}
          </code>
        </div>

        {/* Marketplace badges */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/45">
          <span className="inline-flex items-center gap-1">
            <Download size={11} className="text-white/40" /> {installs}
          </span>
          <span className="w-px h-3 bg-white/10" />
          <span>Marketplace</span>
          <span className="w-px h-3 bg-white/10" />
          <span className="text-primary/70">MIT</span>
        </div>
      </div>

      {/* Bottom: title + one-line description */}
      <div className="relative z-10 w-full">
        <h4 className="text-lg font-bold font-serif italic text-white mb-1 leading-tight group-hover:text-primary transition-colors">{name}</h4>
        <p className="text-[11px] text-[#DEDBC8]/75 leading-relaxed font-mono">{description}</p>
      </div>
    </a>
  );
}

export function PackagesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      ref={sectionRef}
      id="packages"
      className="bg-black text-[#E1E0CC] py-20 px-4 sm:px-6 lg:px-8 relative select-none overflow-hidden"
    >
      {/* Background visual highlight */}
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8"
        >
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.15em] text-neutral-500 block mb-1">Evolving Ecosystem</span>
            <h3 className="text-xl font-medium text-white">Our Extended Releases & Flagship Packages</h3>
          </div>
          <a
            href={ELIXPO_LINKS.githubChapter}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#DEDBC8]/70 hover:text-[#DEDBC8] transition-colors inline-flex items-center gap-1.5"
          >
            <span>Explore Chapter Monorepo</span>
            <ExternalLink size={12} />
          </a>
        </motion.div>

        {/* Bento Grid: two NPM cards + a stacked VS Code column */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 text-white"
        >
          {/* Column 1 - LixSketch NPM */}
          <NpmPackageCard
            label="LixSketch NPM Package"
            href={ELIXPO_LINKS.npmLixSketch}
            name="LixSketch"
            install="npm i @elixpo/lixsketch"
            downloads="1.2k/wk"
            description={
              <>
                Open-source SVG whiteboard engine with a hand-drawn aesthetic. The core drawing engine behind <span className="text-primary">LixSketch</span>.
              </>
            }
            specs={[
              { key: "Core", value: "Interactive Canvas", right: "SVG Whiteboard" },
              { key: "Theme", value: "Hand-Drawn Vector", right: "MIT License" },
              { key: "Docs", value: "github.com/elixpo/lixsketch", right: "MIT" },
            ]}
          />

          {/* Column 2 - LixEditor NPM (same look as LixSketch) */}
          <NpmPackageCard
            label="LixEditor NPM Package"
            href={ELIXPO_LINKS.npmLixEditor}
            name="LixEditor"
            install="npm i @elixpo/lixeditor"
            downloads="0.9k/wk"
            description={
              <>
                Rich WYSIWYG block editor &amp; renderer built on BlockNote - LaTeX, Mermaid &amp; syntax-highlighted code. The core editor engine behind <span className="text-primary">LixBlogs</span>.
              </>
            }
            specs={[
              { key: "Core", value: "Block Editor", right: "BlockNote" },
              { key: "Theme", value: "Rich WYSIWYG", right: "MIT License" },
              { key: "Docs", value: "github.com/elixpo/lixeditor", right: "MIT" },
            ]}
          />

          {/* Column 3 - VS Code extensions stacked */}
          <div className="flex flex-col gap-4 md:gap-5 md:col-span-2 lg:col-span-1 lg:h-[470px]">
            {/* LixSketch VS Code Extension */}
            <VsCodeExtCard
              label="LixSketch VS Code"
              href={ELIXPO_LINKS.vsLixSketch}
              name="LixSketch"
              install="ext install elixpo.lixsketch"
              installs="8.4k installs"
              description="Open-source whiteboard diagrams inside VS Code - draw, sketch, and save .lixsketch files offline."
            />

            {/* LixEditor VS Code Extension */}
            <VsCodeExtCard
              label="LixEditor VS Code"
              href={ELIXPO_LINKS.vsLixEditor}
              name="LixEditor"
              install="ext install elixpo.lixeditor"
              installs="6.1k installs"
              description="A rich block editor for .lixeditor files - LaTeX equations, Mermaid diagrams & syntax-highlighted code."
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
