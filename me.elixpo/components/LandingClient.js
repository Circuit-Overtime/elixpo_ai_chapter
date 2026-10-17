"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PixelBloomCanvas from "@/components/PixelBloomCanvas";

const LAST_PROFILE_KEY = "elixpo:last-visited-profile";
const CAROUSEL_MOTION_EVENT = "elixpo:carousel-motion";

function carouselOffset(index, activeIndex, length) {
  let offset = index - activeIndex;
  if (offset > length / 2) offset -= length;
  if (offset < -length / 2) offset += length;
  return offset;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  );
}

function paginationItems(total, current, maxItems) {
  if (total <= maxItems) return Array.from({ length: total }, (_, index) => index);

  const edgeCount = maxItems - 2;
  if (current < edgeCount - 1) {
    return [...Array.from({ length: edgeCount }, (_, index) => index), "ellipsis-end", total - 1];
  }
  if (current > total - edgeCount) {
    return [0, "ellipsis-start", ...Array.from({ length: edgeCount }, (_, index) => total - edgeCount + index)];
  }

  const windowSize = maxItems - 4;
  const windowStart = current - Math.floor(windowSize / 2);
  return [
    0,
    "ellipsis-start",
    ...Array.from({ length: windowSize }, (_, index) => windowStart + index),
    "ellipsis-end",
    total - 1,
  ];
}

function PaginationRail({ profiles, activeIndex, maxItems, className, onSelect }) {
  return (
    <ol className={className} aria-label={`Member pages; showing up to ${maxItems} positions`}>
      {paginationItems(profiles.length, activeIndex, maxItems).map((item) => {
        if (typeof item === "string") {
          return <li key={item} className="archive-pagination-ellipsis" aria-hidden="true">…</li>;
        }
        const profile = profiles[item];
        return (
          <li key={profile.slug}>
            <button
              type="button"
              className={item === activeIndex ? "is-active" : ""}
              onClick={() => onSelect(item)}
              aria-label={`Show ${profile.siteName}`}
              aria-current={item === activeIndex ? "true" : undefined}
            >
              <span>{String(item + 1).padStart(2, "0")}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function LandingClient({ profiles }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(true);
  const [query, setQuery] = useState("");
  const navigationTimerRef = useRef(null);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return profiles.filter((profile) =>
      [profile.siteName, profile.siteDescription, profile.location]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized))
    );
  }, [profiles, query]);

  const selectIndex = (index) => {
    document.dispatchEvent(new Event(CAROUSEL_MOTION_EVENT));
    setActiveIndex((index + profiles.length) % profiles.length);
    setQuery("");
  };

  useEffect(() => {
    const remembered = window.localStorage.getItem(LAST_PROFILE_KEY);
    const rememberedIndex = profiles.findIndex((profile) => profile.slug === remembered);
    if (rememberedIndex >= 0) setActiveIndex(rememberedIndex);
  }, [profiles]);

  useEffect(() => {
    if (!query.trim() || matches.length === 0) return;
    const firstMatchIndex = profiles.findIndex((profile) => profile.slug === matches[0].slug);
    if (firstMatchIndex >= 0 && firstMatchIndex !== activeIndex) {
      document.dispatchEvent(new Event(CAROUSEL_MOTION_EVENT));
      setActiveIndex(firstMatchIndex);
    }
  }, [activeIndex, matches, profiles, query]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (!typing && event.key === "ArrowLeft") selectIndex(activeIndex - 1);
      if (!typing && event.key === "ArrowRight") selectIndex(activeIndex + 1);
      if (event.key === "Escape") {
        setSearchOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, profiles.length]);

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  const handleCardClick = (event, profile, index, active) => {
    window.localStorage.setItem(LAST_PROFILE_KEY, profile.slug);
    const modifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (active || modifiedClick) return;

    event.preventDefault();
    window.clearTimeout(navigationTimerRef.current);
    document.dispatchEvent(new Event(CAROUSEL_MOTION_EVENT));
    setActiveIndex(index);
    setQuery("");
    navigationTimerRef.current = window.setTimeout(() => {
      window.location.assign(`/${profile.slug}`);
    }, 540);
  };

  return (
    <main className="landing-archive relative h-screen min-h-[100svh] w-full overflow-hidden bg-[#1b1009] text-[#ead9b7]">
      <PixelBloomCanvas
        videoSrc="/og-video.mp4"
        mobileVideoSrc="/og-video-mobile.mp4"
        mode="background"
        className="landing-kernel-canvas absolute inset-[-2px]"
      />
      <div className="landing-kernel-grade absolute inset-0" />

      <header className="archive-masthead absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-5 py-5 sm:px-9 sm:py-7">
        <div className="archive-masthead-copy">
          <span className="sm:hidden">Elixpo</span>
          <span className="hidden sm:inline">The Elixpo Organisation</span>
          <span className="hidden sm:inline">Member Registry</span>
          <span className="hidden lg:inline">Est. MMXXIII</span>
          <span className="hidden xl:inline">Portfolio Series</span>
        </div>

        <div className="relative flex items-center justify-end gap-2">
          <div className={`archive-search-field ${searchOpen ? "is-open" : ""}`}>
            <label className="sr-only" htmlFor="member-search">Search members</label>
            <input
              id="member-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a member"
              tabIndex={searchOpen ? 0 : -1}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open);
              if (searchOpen) setQuery("");
            }}
            className="archive-round-button"
            aria-label={searchOpen ? "Close member search" : "Search members"}
            aria-expanded={searchOpen}
          >
            <SearchIcon />
          </button>

          {searchOpen && query && (
            <div className="archive-search-results" role="listbox" aria-label="Matching members">
              {matches.length ? matches.map((profile) => {
                const index = profiles.findIndex((candidate) => candidate.slug === profile.slug);
                return (
                  <button
                    key={profile.slug}
                    type="button"
                    onClick={() => {
                      setActiveIndex(index);
                      document.dispatchEvent(new Event(CAROUSEL_MOTION_EVENT));
                      setQuery(profile.siteName);
                    }}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <span>{profile.siteName}</span>
                    <small>{profile.siteDescription}</small>
                  </button>
                );
              }) : <p>No member found</p>}
            </div>
          )}
        </div>
      </header>

      <section className="relative z-20 mx-auto flex h-full w-full max-w-[1500px] items-center justify-center px-4 pb-20 pt-20" aria-label="Member portfolio carousel">
        <div className="relative h-[min(58vw,27rem)] min-h-[21rem] w-full">
          {profiles.map((profile, index) => {
            const offset = carouselOffset(index, activeIndex, profiles.length);
            const distance = Math.abs(offset);
            const active = offset === 0;
            return (
              <article
                key={profile.slug}
                className="member-ticket-shell absolute left-1/2 top-1/2"
                data-active={active || undefined}
                data-distance={distance}
                aria-hidden={distance > 1}
                aria-current={active ? "true" : undefined}
                style={{
                  opacity: distance > 1 ? 0 : 1,
                  pointerEvents: distance > 1 ? "none" : "auto",
                  transform: `translateX(-50%) translateX(${offset * 82}%) translateY(-50%) scale(${active ? 1 : 0.78}) rotate(${offset * 3.5}deg)`,
                  zIndex: active ? 20 : 10 - distance,
                }}
              >
                <a
                  href={`/${profile.slug}`}
                  className="member-ticket-link"
                  tabIndex={distance > 1 ? -1 : 0}
                  aria-label={`Open ${profile.siteName}'s portfolio`}
                  onClick={(event) => handleCardClick(event, profile, index, active)}
                >
                  <div className="archive-ticket vintage-card">
                  <span className="archive-ticket-index">No. {String(index + 1).padStart(2, "0")}</span>
                  <div className="archive-ticket-copy">
                    <span className="archive-ticket-kicker">Portfolio admission · MMXXVI</span>
                    <h2>{profile.siteName}</h2>
                    <span className="archive-ticket-mark">◆</span>
                    <p>{profile.siteDescription}</p>
                    <div className="archive-ticket-meta">
                      <span>{profile.location}</span>
                      <span>{profile.email}</span>
                    </div>
                  </div>

                  <div className="archive-ticket-stub">
                    <div className="archive-portrait">
                      <img
                        src={`/assets/${profile.slug}/about/landing-card.webp`}
                        alt={`Portrait of ${profile.siteName}`}
                        loading={active ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={active ? "high" : "low"}
                      />
                    </div>
                    <span>Member registry</span>
                    <strong>{String(index + 1).padStart(2, "0")}</strong>
                  </div>

                  {active && (
                    <span className="archive-ticket-link">
                      <span>Enter folio</span>
                      <span aria-hidden="true">↗</span>
                    </span>
                  )}
                  </div>
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <nav className="archive-carousel-nav absolute bottom-5 left-1/2 z-40 -translate-x-1/2 sm:bottom-7" aria-label="Portfolio carousel controls">
        <button type="button" className="archive-round-button" onClick={() => selectIndex(activeIndex - 1)} aria-label="Previous member">←</button>
        <PaginationRail profiles={profiles} activeIndex={activeIndex} maxItems={10} className="archive-pagination-lg" onSelect={selectIndex} />
        <PaginationRail profiles={profiles} activeIndex={activeIndex} maxItems={5} className="archive-pagination-sm" onSelect={selectIndex} />
        <button type="button" className="archive-round-button" onClick={() => selectIndex(activeIndex + 1)} aria-label="Next member">→</button>
      </nav>
    </main>
  );
}
