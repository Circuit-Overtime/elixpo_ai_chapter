"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ShowcaseBlockProps {
  id: string;
  label: string;
  title: string;
  description: string;
  gradient: string;
  codeSnippet: string;
  reversed?: boolean;
}

export default function ShowcaseBlock({
  id,
  label,
  title,
  description,
  gradient,
  codeSnippet,
  reversed = false,
}: ShowcaseBlockProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const els = sectionRef.current.querySelectorAll(".showcase-animate");
    gsap.fromTo(
      els,
      { y: 50, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          toggleActions: "play none none none",
        },
      }
    );
  }, []);

  return (
    <section id={id} ref={sectionRef} className="py-28 px-6 bg-white">
      <div
        className={`max-w-6xl mx-auto flex flex-col ${
          reversed ? "md:flex-row-reverse" : "md:flex-row"
        } items-center gap-12 md:gap-20`}
      >
        {/* Text side */}
        <div className="flex-1 max-w-lg">
          <span className="showcase-animate text-xs font-semibold tracking-widest uppercase text-amber-600 mb-3 block opacity-0">
            {label}
          </span>
          <h2 className="showcase-animate font-[family-name:var(--font-parkinsans)] text-3xl md:text-4xl font-extrabold text-neutral-900 mb-4 opacity-0">
            {title}
          </h2>
          <p className="showcase-animate text-neutral-500 leading-relaxed text-base opacity-0">
            {description}
          </p>
        </div>

        {/* Code/preview side */}
        <div className="showcase-animate flex-1 w-full max-w-xl opacity-0">
          <div className={`rounded-3xl bg-gradient-to-br ${gradient} p-[1px] shadow-2xl shadow-neutral-200/80`}>
            <div className="rounded-3xl bg-neutral-950 p-6 overflow-hidden">
              {/* Window dots */}
              <div className="flex gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <pre className="text-sm text-neutral-300 overflow-x-auto leading-relaxed font-mono">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
