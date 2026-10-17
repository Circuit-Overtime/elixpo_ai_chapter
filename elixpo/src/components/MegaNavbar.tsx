"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, HeartHandshake, Menu, X } from "lucide-react";

const links = [
  { label: "Projects", href: "/projects" },
  { label: "Research", href: "/research" },
  { label: "Packages", href: "/packages" },
  { label: "Services", href: "/services" },
  { label: "People", href: "/people" },
  { label: "History", href: "/history" },
];

export function MegaNavbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="site-nav-wrap">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="nav-brand" href="/" onClick={() => setOpen(false)}>
          <Image src="/logos/logo.webp" width={28} height={28} alt="" priority />
          Elixpo
        </Link>
        <div id="mobile-navigation" className={`nav-links ${open ? "mobile-open" : ""}`}>
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
          <Link className="mobile-sponsor-link" href="/partnerships" onClick={() => setOpen(false)}>Sponsor Elixpo <HeartHandshake size={15} /></Link>
        </div>
        <Link className="nav-sponsor" href="/partnerships"><HeartHandshake size={15} /> Sponsor</Link>
        <a className="nav-cta" href="https://github.com/elixpo/elixpo_chapter" target="_blank" rel="noreferrer">Build with us <ArrowUpRight size={13} /></a>
        <button className="nav-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? "Close navigation" : "Open navigation"}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      </nav>
    </div>
  );
}
