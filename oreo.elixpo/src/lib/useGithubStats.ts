"use client";

import { useEffect, useState } from "react";


const REPO       = "elixpo/oreo";
const CACHE_KEY  = "oreo-gh-stats";
const TTL_MS     = 10 * 60 * 1000;        // 10 mins

// Conservative defaults so the UI never renders "0 stars" while the
// fetch is in flight; replaced the instant the live response lands.
const FALLBACK   = { stars: 446, forks: 140 };

type Stats = { stars: number | null; forks: number | null; loading: boolean };

export function useGithubStats(): Stats {
  const [stats, setStats] = useState<Stats>(() => {
    // SSR-safe initial state — sessionStorage isn't available during
    // server rendering so we serve the conservative fallback and let
    // the effect upgrade to live numbers on the client.
    if (typeof window === "undefined") {
      return { stars: FALLBACK.stars, forks: FALLBACK.forks, loading: false };
    }
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.ts && Date.now() - obj.ts < TTL_MS) {
          return { stars: obj.stars, forks: obj.forks, loading: false };
        }
      }
    } catch { /* ignore — fall through to fallback */ }
    return { stars: FALLBACK.stars, forks: FALLBACK.forks, loading: true };
  });

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        // sessionStorage hit is honoured silently — already reflected
        // in initial state; only refresh on a stale or missing entry.
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && obj.ts && Date.now() - obj.ts < TTL_MS) {
            return;
          }
        }
        const r = await fetch(`https://api.github.com/repos/${REPO}`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        const fresh = {
          stars:   j.stargazers_count ?? FALLBACK.stars,
          forks:   j.forks_count      ?? FALLBACK.forks,
          loading: false,
        };
        if (!aborted) setStats(fresh);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            ts: Date.now(), stars: fresh.stars, forks: fresh.forks,
          }));
        } catch { /* private mode / quota */ }
      } catch {
        // Network blew up — keep the fallback, just flip loading off.
        if (!aborted) {
          setStats(s => ({ ...s, loading: false }));
        }
      }
    })();
    return () => { aborted = true; };
  }, []);

  return stats;
}
