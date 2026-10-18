"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const routeFor = (person, item) =>
  item.toLowerCase() === "home" ? `/${person}` : `/${person}/${item.toLowerCase()}`;

export default function MemberHeader({ person, profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);
  const menuItems = profile.menuItems || ["Home", "About", "Projects", "Publications", "Connect"];

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const close = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <header className="portfolio-nav-wrap" ref={navRef}>
      <nav className="portfolio-nav" aria-label={`${profile.name || profile.siteName} portfolio`}>
        <a className="portfolio-brand" href={`/${person}`}>
          <span className="portfolio-brand-mark">
            <img
              src={`/assets/${person}/about/landing-card.webp`}
              alt=""
              width="38"
              height="38"
            />
          </span>
          <span>
            <strong>{profile.siteName}</strong>
            <small>Elixpo member</small>
          </span>
        </a>

        <div id="portfolio-links" className={`portfolio-links ${open ? "is-open" : ""}`}>
          {menuItems.map((item) => {
            const href = routeFor(person, item);
            const active = pathname === href || (href !== `/${person}` && pathname.startsWith(`${href}/`));
            return (
              <a key={item} href={href} aria-current={active ? "page" : undefined}>
                {item === "Publications" ? "Research" : item}
              </a>
            );
          })}
          <a
            className="portfolio-directory-link"
            href="/"
            aria-label="Browse all Elixpo member portfolios"
          >
            All members <span aria-hidden="true">↗</span>
          </a>
          <a className="portfolio-elixpo-link" href="https://elixpo.com" target="_blank" rel="noreferrer">
            Elixpo.com <span aria-hidden="true">↗</span>
          </a>
        </div>

        <button
          className="portfolio-menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="portfolio-links"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </nav>
    </header>
  );
}
