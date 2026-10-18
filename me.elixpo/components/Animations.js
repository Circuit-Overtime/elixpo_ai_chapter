"use client";

import { useEffect, useRef, useState } from "react";

export function FadeInReveal() {
  useEffect(() => {
    if (typeof anime === "undefined") return;
    const appContainers = document.querySelectorAll(".appContainer");
    appContainers.forEach((container) => {
      anime({
        targets: container,
        opacity: [0, 1],
        translateY: [60, 0],
        duration: 1200,
        easing: "easeOutExpo",
        complete: () => {
          container.style.opacity = 1;
        },
      });
    });
  }, []);
  return null;
}

export function MediaDecodeReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(max-width: 639px)");

    if (!mediaQuery.matches) {
      root.classList.remove("media-decode-enabled");
      return;
    }

    const cleanups = [];
    const processedImages = new WeakSet();
    const processedBackgrounds = new WeakSet();
    const reveal = (element) => element.classList.add("media-decoded");
    const decodeImage = (element) => {
      if (processedImages.has(element)) return;
      processedImages.add(element);
      const finish = () => reveal(element);

      if (element.complete) {
        if (element.naturalWidth === 0) {
          finish();
          return;
        }
        if (typeof element.decode === "function") {
          element.decode().catch(() => {}).finally(finish);
        } else {
          finish();
        }
        return;
      }

      element.addEventListener("load", finish, { once: true });
      element.addEventListener("error", finish, { once: true });
      cleanups.push(() => {
        element.removeEventListener("load", finish);
        element.removeEventListener("error", finish);
      });
    };

    document.querySelectorAll("img").forEach(decodeImage);

    const backgroundElements = Array.from(
      document.querySelectorAll('[style*="background-image"]'),
    );
    const decodeBackground = (element) => {
      if (processedBackgrounds.has(element)) return;
      processedBackgrounds.add(element);
      const urls = Array.from(
        getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g),
        (match) => match[1],
      );

      if (urls.length === 0) {
        reveal(element);
        return;
      }

      Promise.all(
        urls.map((url) => {
          const image = new Image();
          image.src = url;
          return typeof image.decode === "function"
            ? image.decode().catch(() => {})
            : new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = resolve;
              });
        }),
      ).finally(() => reveal(element));
    };

    let backgroundObserver = null;
    if ("IntersectionObserver" in window) {
      backgroundObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            backgroundObserver.unobserve(entry.target);
            decodeBackground(entry.target);
          });
        },
        { rootMargin: "240px 0px" },
      );

      backgroundElements.forEach((element) => backgroundObserver.observe(element));
      cleanups.push(() => backgroundObserver.disconnect());
    } else {
      backgroundElements.forEach(decodeBackground);
    }

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(({ addedNodes }) => {
        addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;

          const images = [
            ...(node.matches("img") ? [node] : []),
            ...node.querySelectorAll("img"),
          ];
          images.forEach(decodeImage);

          const backgrounds = [
            ...(node.matches('[style*="background-image"]') ? [node] : []),
            ...node.querySelectorAll('[style*="background-image"]'),
          ];
          backgrounds.forEach((element) => {
            if (backgroundObserver) backgroundObserver.observe(element);
            else decodeBackground(element);
          });
        });
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => mutationObserver.disconnect());

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}

export function InertiaScroll() {
  useEffect(() => {
    const appContainer = document.getElementById("appContainer");
    if (!appContainer) return;

    let velocity = 0;
    let isTicking = false;
    const friction = 0.82;
    let frame;

    function startInertia() {
      if (isTicking) return;
      isTicking = true;

      function step() {
        appContainer.scrollTop += velocity;
        velocity *= friction;
        if (Math.abs(velocity) < 0.5) {
          velocity = 0;
          isTicking = false;
          cancelAnimationFrame(frame);
          return;
        }
        frame = requestAnimationFrame(step);
      }
      step();
    }

    const handler = (e) => {
      if (
        e.target.tagName === "TEXTAREA" ||
        (e.target.closest && e.target.closest("textarea"))
      ) {
        return;
      }
      // Let scrollable inner containers (like descriptionRow2) handle their own scroll
      const scrollableParent = e.target.closest && e.target.closest(".overflow-y-auto");
      if (scrollableParent) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableParent;
        const atTop = scrollTop === 0 && e.deltaY < 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atBottom) return;
      }
      if (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        velocity += e.deltaY * 0.5;
        startInertia();
      }
    };

    appContainer.addEventListener("wheel", handler, { passive: false });
    return () => {
      appContainer.removeEventListener("wheel", handler);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

export function SpotlightScroller({ children }) {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const center = container.querySelector("#spotlightCenter");
    if (center) {
      const sl = center.offsetLeft - container.offsetWidth / 2 + center.offsetWidth / 2;
      container.scrollLeft = sl;
    }
  }, []);

  const onMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  const onMouseUp = () => setIsDragging(false);
  const onMouseLeave = () => setIsDragging(false);
  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft - (x - startX);
  };

  return (
    <section
      ref={scrollRef}
      className="spotlight relative h-[300px] sm:h-[350px] mb-[20px] px-3 sm:px-6 md:px-[40px] box-border py-[20px] sm:py-[40px] gap-[15px] sm:gap-[20px] overflow-x-auto overflow-y-hidden flex-nowrap flex flex-row select-none"
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
      aria-label="Horizontally scrollable member spotlight"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
    >
      {children}
    </section>
  );
}

export function ScaleContainer() {
  useEffect(() => {
    function scaleAppContainer() {
      const container = document.getElementById("appContainer");
      if (!container) return;
      const maxWidth = 1440;
      const scaleX = window.innerWidth / maxWidth;
      const scaleY = window.innerHeight / window.innerHeight;
      const scale = Math.min(scaleX, scaleY);
      container.style.transform = `translate(-50%, 0) scale(${scale})`;
      container.style.transformOrigin = "top center";
    }

    scaleAppContainer();
    window.addEventListener("resize", scaleAppContainer);
    return () => window.removeEventListener("resize", scaleAppContainer);
  }, []);
  return null;
}
