"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Mounts a Lenis smooth-scroll instance for the lifetime of the page.
 * Renders nothing; it only drives the global scroll behaviour.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchPointer = window.matchMedia("(pointer: coarse)");

    // Touch browsers already provide GPU-backed momentum scrolling. Avoiding
    // a second animation loop improves responsiveness and battery life.
    if (reducedMotion.matches || touchPointer.matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.9,
      autoResize: true,
      anchors: true,
      stopInertiaOnNavigate: true,
    });

    let frame = 0;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
