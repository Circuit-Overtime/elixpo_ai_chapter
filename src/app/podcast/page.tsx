"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import PodcastSkeleton from "@/components/skeletons/PodcastSkeleton";

interface TimelineEntry {
  type: "male" | "female" | "image";
  content: string;
  start: number;
  end: number;
}

interface CarouselImage {
  time: number;
  url: string;
  description: string;
}

export default function PodcastPage() {
  const [podcastName, setPodcastName] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [sourceDomain, setSourceDomain] = useState("");
  const [gradientColor, setGradientColor] = useState("#1a1a2e");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [activeSpeaker, setActiveSpeaker] = useState<"male" | "female" | "">("");
  const [activeCarouselUrl, setActiveCarouselUrl] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);
  const speeds = [1, 1.5, 2];

  // The currently displayed background image (banner or carousel slide)
  const displayImage = activeCarouselUrl || bannerUrl || thumbnailUrl;

  useEffect(() => {
    fetch("/api/podcast").then((r) => r.json()).then((data: any) => {
      if (data.error) return;
      setPodcastName(data.podcast_name);
      setBannerUrl(data.podcast_banner_url || "");
      setThumbnailUrl(data.podcast_thumbnail_url || "");
      setSourceLink(data.topic_source || "");
      try { setSourceDomain(new URL(data.topic_source).hostname.replace(/^www\./, "")); } catch { /* */ }
      if (data.podcast_audio_url) {
        const audio = new Audio(data.podcast_audio_url);
        audio.preload = "metadata";
        audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
        audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
        audio.addEventListener("play", () => setIsPlaying(true));
        audio.addEventListener("pause", () => setIsPlaying(false));
        audio.addEventListener("ended", () => setIsPlaying(false));
        audio.addEventListener("error", () => setAudioError(true));
        audioRef.current = audio;
      } else { setAudioError(true); }
      setLoaded(true);
    }).catch(console.error);

    fetch("/api/podcast-details").then((r) => r.json()).then((d: any) => {
      if (d.gradientColor) setGradientColor(d.gradientColor);
      if (d.carouselImages) setCarouselImages(d.carouselImages);
      if (d.timeline?.length) setTimeline(d.timeline);
      else if (d.timelineUrl) fetch(d.timelineUrl).then((r) => r.json()).then((timelineData: any) => setTimeline(timelineData)).catch(() => {});
    }).catch(() => {});

    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; } };
  }, []);

  const updateTimeline = useCallback(() => {
    if (!timeline.length) return;
    const t = currentTime;
    const idx = timeline.findIndex((e) => (e.type === "male" || e.type === "female") && t >= e.start && t < e.end);
    if (idx !== -1) { setActiveIdx(idx); setActiveSpeaker(timeline[idx].type as "male" | "female"); }
    const passed = carouselImages.filter((img) => t >= img.time);
    if (passed.length) setActiveCarouselUrl(passed[passed.length - 1].url);
  }, [currentTime, timeline, carouselImages]);

  useEffect(() => { updateTimeline(); }, [updateTimeline]);

  useEffect(() => {
    if (activeIdx < 0 || !subtitleContainerRef.current) return;
    const el = subtitleContainerRef.current.children[activeIdx] as HTMLElement;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  const togglePlay = () => { if (!audioRef.current || audioError) return; audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause(); };
  const cycleSpeed = () => { const n = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; setSpeed(n); if (audioRef.current) audioRef.current.playbackRate = n; };
  const skip = (s: number) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + s)); };
  const seekFromX = (clientX: number) => {
    if (!seekBarRef.current || !audioRef.current) return;
    const r = seekBarRef.current.getBoundingClientRect();
    audioRef.current.currentTime = (Math.max(0, Math.min(clientX - r.left, r.width)) / r.width) * duration;
  };
  const isDragging = useRef(false);
  const onSeekDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    seekFromX(x);
  };
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const x = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      seekFromX(x);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  });
  const fmt = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const faviconUrl = sourceDomain ? `https://www.google.com/s2/favicons?domain=${sourceDomain}&sz=64` : "";

  // Dynamic subtitle — compute active chunk from currentTime on every tick
  interface SubLine { text: string; speaker: "male" | "female"; start: number; end: number; }
  const [activeSubLine, setActiveSubLine] = useState<SubLine | null>(null);

  useEffect(() => {
    const t = currentTime;
    const entry = timeline.find((e) => (e.type === "male" || e.type === "female") && t >= e.start && t < e.end);
    if (!entry) { setActiveSubLine((p) => p ? null : p); return; }

    const words = entry.content.split(/\s+/);
    const chunks: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur.length + w.length + 1 > 50 && cur) { chunks.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    }
    if (cur) chunks.push(cur);

    const progress = (t - entry.start) / (entry.end - entry.start);
    const idx = Math.min(Math.floor(progress * chunks.length), chunks.length - 1);

    setActiveSubLine((prev) => {
      if (prev?.text === chunks[idx]) return prev;
      return { text: chunks[idx], speaker: entry.type as "male" | "female", start: entry.start, end: entry.end };
    });
  }, [currentTime, timeline]);

  if (!loaded) {
    return <PodcastSkeleton />;
  }

  return (
    <section className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Back */}
      <Link href="/" className="fixed top-4 left-4 z-50 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      </Link>

      {/* ═══ FULL-SCREEN BACKGROUND IMAGE (no blur) ═══ */}
      {displayImage && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000"
          style={{ backgroundImage: `url(${displayImage})` }}
        />
      )}

      {/* Gradient overlay: image visible at top, fades to color at bottom */}
      <div className="absolute inset-0 z-[1]" style={{
        background: `linear-gradient(to bottom, transparent 0%, ${gradientColor}33 20%, ${gradientColor}aa 45%, ${gradientColor}ee 65%, ${gradientColor} 85%)`
      }} />

      {/* Dark vignette edges */}
      <div className="absolute inset-0 z-[1]" style={{ background: "radial-gradient(ellipse at center 30%, transparent 40%, rgba(0,0,0,0.4) 100%)" }} />

      {/* ═══ CONTENT LAYER ═══ */}
      <div className="relative z-10 h-full flex flex-col">

        {/* Top spacer — lets background image breathe */}
        <div className="flex-1 min-h-0" />

        {/* Carousel dots */}
        {carouselImages.length > 0 && (
          <div className="flex justify-center gap-1.5 mb-3">
            {carouselImages.map((img, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${activeCarouselUrl === img.url ? "bg-white w-5" : "bg-white/25 w-1.5"}`} />
            ))}
          </div>
        )}

        {/* Speaker indicator */}
        {activeSpeaker && isPlaying && (
          <div className="flex justify-center mb-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 backdrop-blur-sm">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeSpeaker === "female" ? "bg-pink-400" : "bg-blue-400"}`} />
              <span className="text-[9px] text-white/50 font-semibold tracking-widest uppercase">
                {activeSpeaker === "female" ? "Liza" : "Lix"}
              </span>
            </div>
          </div>
        )}

        {/* Rolling subtitle — single line above player */}
        {showCaptions && (
          <div className="flex-shrink-0 px-6 mb-2">
            <div className="max-w-lg mx-auto text-center min-h-[52px] flex flex-col items-center justify-end">
              {activeSubLine ? (
                <>
                  <span className={`text-[9px] uppercase tracking-widest font-bold mb-1 transition-colors duration-200 ${activeSubLine.speaker === "female" ? "text-pink-400/70" : "text-blue-400/70"}`}>
                    {activeSubLine.speaker === "female" ? "Liza" : "Lix"}
                  </span>
                  <p key={`${activeSubLine.start}-${activeSubLine.text.slice(0,20)}`} className="text-sm text-white/85 font-medium leading-snug animate-[fadeUp_0.25s_ease-out]">
                    {activeSubLine.text}
                  </p>
                </>
              ) : (
                <p className="text-xs text-white/20 italic">{loaded && !isPlaying ? "Press play" : "\u00A0"}</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ PLAYER ═══ */}
        <div className="flex-shrink-0 px-4 pb-6 pt-3">
          <div className="max-w-lg mx-auto rounded-3xl px-6 py-5 bg-black/30 backdrop-blur-md border border-white/[0.06]">
            {/* Title row */}
            <div className="flex items-center gap-4 mb-4">
              {/* Mini thumbnail */}
              {(thumbnailUrl || bannerUrl) && (
                <div className="w-14 h-14 rounded-xl bg-cover bg-center flex-shrink-0 border border-white/10 shadow-lg" style={{ backgroundImage: `url(${thumbnailUrl || bannerUrl})` }} />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white/90 truncate">{podcastName || "Elixpo Podcast"}</h2>
                <div className="flex items-center gap-1.5">
                  {faviconUrl && sourceDomain ? (
                    <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 group">
                      <img src={faviconUrl} alt="" width={14} height={14} className="rounded-sm opacity-40 group-hover:opacity-70" />
                      <span className="text-[11px] text-white/30 group-hover:text-white/50 uppercase tracking-wider">{sourceDomain}</span>
                    </a>
                  ) : <span className="text-[11px] text-white/20 italic">Elixpo Copilot</span>}
                </div>
              </div>
              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                  showCaptions ? "bg-white/15 border-white/20 text-white/80" : "bg-transparent border-white/8 text-white/25 hover:text-white/45"
                }`}
              >CC</button>
            </div>

            {/* Seek */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] text-white/30 font-mono w-9 text-right">{fmt(currentTime)}</span>
              <div ref={seekBarRef} onMouseDown={onSeekDown} onTouchStart={onSeekDown} className="flex-1 h-1 rounded-full cursor-pointer relative group hover:h-1.5 transition-all" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-white/80 transition-all" style={{ width: `${pct}%` }} />
                <div className="absolute w-3 h-3 rounded-full bg-white -top-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${pct}% - 6px)` }} />
              </div>
              <span className="text-[10px] text-white/30 font-mono w-9">{fmt(duration)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6">
              <button onClick={cycleSpeed} className="min-w-[40px] h-8 px-2.5 rounded-full text-[11px] text-white/50 font-bold bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] transition-all cursor-pointer flex items-center justify-center">{speed}x</button>
              <button onClick={() => skip(-10)} className="text-white/40 hover:text-white/70 active:scale-90 transition-all cursor-pointer p-2 rounded-full hover:bg-white/[0.06]">
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>
              <button onClick={togglePlay} disabled={audioError} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${audioError ? "bg-white/10" : "bg-white hover:scale-105 active:scale-95 shadow-white/10"}`}>
                {audioError ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                ) : isPlaying ? (
                  <svg viewBox="0 0 32 32" className="w-6 h-6"><path d="M7.25 29C5.45507 29 4 27.5449 4 25.75V7.25C4 5.45507 5.45507 4 7.25 4H10.75C12.5449 4 14 5.45507 14 7.25V25.75C14 27.5449 12.5449 29 10.75 29H7.25ZM21.25 29C19.4551 29 18 27.5449 18 25.75V7.25C18 5.45507 19.4551 4 21.25 4H24.75C26.5449 4 28 5.45507 28 7.25V25.75C28 27.5449 26.5449 29 24.75 29H21.25Z" fill="#111" /></svg>
                ) : (
                  <svg viewBox="0 0 32 32" className="w-6 h-6 ml-0.5"><path d="M12.2246 27.5373C9.89137 28.8585 7 27.173 7 24.4917V7.50044C7 4.81864 9.89234 3.1332 12.2256 4.45537L27.2233 12.9542C29.5897 14.2951 29.5891 17.7047 27.2223 19.0449L12.2246 27.5373Z" fill="#111" /></svg>
                )}
              </button>
              <button onClick={() => skip(10)} className="text-white/40 hover:text-white/70 active:scale-90 transition-all cursor-pointer p-2 rounded-full hover:bg-white/[0.06]">
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              </button>
              <div className="w-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
