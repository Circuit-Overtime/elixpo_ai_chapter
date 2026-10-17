"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, HeartHandshake, Menu, X } from "lucide-react";

const primaryLinks = [
  { label: "Projects", href: "/projects" },
  { label: "Research", href: "/research" },
  { label: "Packages", href: "/packages" },
  { label: "Services", href: "/services" },
  { label: "About", href: "/about" },
];

const moreLinks = [
  { label: "Chapter", href: "/chapter" },
  { label: "People", href: "/people" },
  { label: "History", href: "/history" },
  { label: "Architecture", href: "/architecture" },
  { label: "Branding", href: "/branding" },
  { label: "Community", href: "/community" },
  { label: "Recognition", href: "/recognition" },
  { label: "Licensing", href: "/licensing" },
  { label: "Code of conduct", href: "/code-of-conduct" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/contact" },
];

export function MegaNavbar() {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = moreLinks.some((link) => isCurrent(link.href));

  useEffect(() => {
    if (moreRef.current) moreRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const closeMore = () => {
      if (moreRef.current) moreRef.current.open = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) closeMore();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMore();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  return (
    <div className="site-nav-wrap">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="nav-brand" href="/" onClick={() => setOpen(false)}>
          <Image src="/logos/logo.webp" width={28} height={28} alt="" priority />
          Elixpo
        </Link>
        <div id="mobile-navigation" className={`nav-links ${open ? "mobile-open" : ""}`}>
          {primaryLinks.map((link) => <Link key={link.href} href={link.href} aria-current={isCurrent(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
          {moreLinks.map((link) => <Link className="mobile-more-link" key={link.href} href={link.href} aria-current={isCurrent(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
          <Link className="mobile-sponsor-link" href="/partnerships" onClick={() => setOpen(false)}>Sponsor Elixpo <HeartHandshake size={15} /></Link>
        </div>
        <details className="nav-more" ref={moreRef}>
          <summary aria-current={moreActive ? "page" : undefined}>More <ChevronDown size={13}/></summary>
          <div>{moreLinks.map((link) => <Link key={link.href} href={link.href} aria-current={isCurrent(link.href) ? "page" : undefined} onClick={closeMore}>{link.label}<ArrowUpRight size={12}/></Link>)}</div>
        </details>
        <Link className="nav-sponsor" href="/partnerships"><HeartHandshake size={15} /> Sponsor</Link>
        <a className="nav-cta" href="https://github.com/elixpo/elixpo_chapter" target="_blank" rel="noreferrer">Build with us <ArrowUpRight size={13} /></a>
        <button className="nav-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? "Close navigation" : "Open navigation"}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      </nav>
    </div>
  );
}
