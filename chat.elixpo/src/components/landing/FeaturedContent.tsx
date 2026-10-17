"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";

gsap.registerPlugin(ScrollTrigger);

interface NewsData {
  latestNewsThumbnail?: string;
  latestNewsSummary?: string;
  latestNewsDate?: string;
}

interface PodcastData {
  latestPodcastName?: string;
  latestPodcastThumbnail?: string;
  latestPodcastBanner?: string;
}

export default function FeaturedContent() {
  const [news, setNews] = useState<NewsData | null>(null);
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/news-details").then((r) => r.json()).then((d: any) => { if (!d.error) setNews(d); }).catch(() => {});
    fetch("/api/podcast-details").then((r) => r.json()).then((d: any) => { if (!d.error) setPodcast(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll(".featured-card");
    gsap.fromTo(cards, { y: 60, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: "power3.out",
      scrollTrigger: { trigger: sectionRef.current, start: "top 80%", toggleActions: "play none none none" },
    });
  }, [news, podcast]);

  if (!news && !podcast) return null;

  const newsDate = news?.latestNewsDate
    ? new Date(news.latestNewsDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  return (
    <section ref={sectionRef} className="py-20 px-6 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-amber-600 mb-3 block">
          Today on Elixpo
        </span>
        <h2 className="font-[family-name:var(--font-parkinsans)] text-3xl md:text-4xl font-extrabold text-neutral-900">
          Fresh content, every day
        </h2>
      </motion.div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* News card */}
        {news && (
          <Link href="/news" className="featured-card group block rounded-3xl overflow-hidden border border-neutral-200 hover:border-neutral-300 transition-all hover:shadow-2xl hover:shadow-neutral-200/60 opacity-0">
            <div className="relative h-[200px] bg-cover bg-center" style={{ backgroundImage: news.latestNewsThumbnail ? `url(${news.latestNewsThumbnail})` : undefined, backgroundColor: "#1E2538" }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <span className="text-xs text-amber-300 font-semibold uppercase tracking-wider">Elixpo Daily</span>
                {newsDate && <span className="text-xs text-white/50 ml-2">{newsDate}</span>}
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600 line-clamp-2">{news.latestNewsSummary || "Today's top stories, narrated by AI."}</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 group-hover:gap-3 transition-all">
                <span>Listen now</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </div>
          </Link>
        )}

        {/* Podcast card */}
        {podcast && (
          <Link href="/podcast" className="featured-card group block rounded-3xl overflow-hidden border border-neutral-200 hover:border-neutral-300 transition-all hover:shadow-2xl hover:shadow-neutral-200/60 opacity-0">
            <div className="relative h-[200px] bg-cover bg-center" style={{ backgroundImage: (podcast.latestPodcastBanner || podcast.latestPodcastThumbnail) ? `url(${podcast.latestPodcastBanner || podcast.latestPodcastThumbnail})` : undefined, backgroundColor: "#2D1B4E" }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <span className="text-xs text-violet-300 font-semibold uppercase tracking-wider">Elixpo Podcast</span>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-900 font-semibold line-clamp-1">{podcast.latestPodcastName || "Today's podcast"}</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 group-hover:gap-3 transition-all">
                <span>Listen now</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
