"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const stickers = [
  { src: "/brand/stickers/previews/ship-it-preview.webp", alt: "Watermarked preview of the Elixpo panda riding a rocket sticker" },
  { src: "/brand/stickers/previews/commit-preview.webp", alt: "Watermarked preview of the Elixpo panda and Octocat commit sticker" },
  { src: "/brand/stickers/previews/lgtm-preview.webp", alt: "Watermarked preview of the Elixpo panda LGTM sticker" },
];

export function PartnershipImpact() {
  const sectionRef = useRef<HTMLElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const number = numberRef.current;
    if (!section || !number || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let hasRun = false;
    const formatter = new Intl.NumberFormat("en-US");

    const startCounter = () => {
      if (hasRun) return;
      hasRun = true;
      const startedAt = performance.now();
      const duration = 1500;

      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        number.textContent = formatter.format(Math.round(3500 * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };

      number.textContent = "0";
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startCounter();
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(section);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="partnership-impact" ref={sectionRef} aria-labelledby="sticker-impact-title">
      <div className="impact-sticker-field" aria-label="Watermarked previews of Elixpo sticker artwork">
        <i aria-hidden="true" />
        {stickers.map((sticker, index) => (
          <figure key={sticker.src} className={`impact-sticker sticker-${index + 1}`}>
            <Image src={sticker.src} alt={sticker.alt} width={480} height={480} sizes="(max-width: 620px) 42vw, 260px" />
          </figure>
        ))}
      </div>
      <div className="impact-copy">
        <p className="eyebrow">Community reach / recorded total</p>
        <p className="impact-number" aria-label="More than 3,500 stickers given away">
          <span ref={numberRef}>3,500</span><sup>+</sup>
        </p>
        <h2 id="sticker-impact-title">Elixpo stickers have been given away so far.</h2>
        <p>
          More than 3,500 stickers have reached students, developers, and
          community events. They are shared as an invitation to discover the
          projects and contribute in public. The artwork shown here is a
          protected preview; event-use material is released only after a
          partnership request is approved.
        </p>
      </div>
    </section>
  );
}
