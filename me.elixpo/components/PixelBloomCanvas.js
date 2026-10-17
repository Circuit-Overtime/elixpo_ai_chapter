"use client";

import { useEffect, useRef } from "react";
import theme from "@/content/portfolio-theme.json";

const CAROUSEL_MOTION_EVENT = "elixpo:carousel-motion";

function coverMedia(context, media, width, height, focusX = 0.5, focusY = 0.5) {
  const mediaWidth = media.videoWidth || media.naturalWidth;
  const mediaHeight = media.videoHeight || media.naturalHeight;
  if (!mediaWidth || !mediaHeight) return;

  const scale = Math.max(width / mediaWidth, height / mediaHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.min(
    mediaWidth - sourceWidth,
    Math.max(0, mediaWidth * focusX - sourceWidth / 2),
  );
  const sourceY = Math.min(
    mediaHeight - sourceHeight,
    Math.max(0, mediaHeight * focusY - sourceHeight / 2),
  );
  context.drawImage(
    media,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

function drawProceduralFrame(context, width, height, phase) {
  context.fillStyle = "#1a0f08";
  context.fillRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.min(width * 0.23, height * 0.42)}px Georgia, serif`;
  context.fillStyle = "#d9bd83";
  context.fillText("ELIXPO", width / 2, height / 2 + Math.sin(phase) * 0.8);
}

function createGlassPattern(context, tileCanvas, size) {
  tileCanvas.width = size;
  tileCanvas.height = size;
  const tile = tileCanvas.getContext("2d");
  tile.clearRect(0, 0, size, size);

  const sheen = tile.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, "rgba(255,255,255,0.2)");
  sheen.addColorStop(0.22, "rgba(255,255,255,0.055)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(56,28,12,0.08)");
  tile.fillStyle = sheen;
  tile.fillRect(0, 0, size, size);

  tile.beginPath();
  tile.moveTo(0.5, size - 0.5);
  tile.lineTo(0.5, 0.5);
  tile.lineTo(size - 0.5, 0.5);
  tile.strokeStyle = "rgba(255,244,213,0.18)";
  tile.lineWidth = 1;
  tile.stroke();

  tile.beginPath();
  tile.arc(Math.max(1.2, size * 0.16), Math.max(1.2, size * 0.16), Math.max(0.55, size * 0.045), 0, Math.PI * 2);
  tile.fillStyle = "rgba(255,255,255,0.2)";
  tile.fill();
  return context.createPattern(tileCanvas, "repeat");
}

export default function PixelBloomCanvas({
  src,
  videoSrc,
  mobileVideoSrc,
  mode = "portrait",
  className = "",
  cellSize,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    const sampleCanvas = document.createElement("canvas");
    const sampleContext = sampleCanvas.getContext("2d", { alpha: false });
    const glassTile = document.createElement("canvas");
    const resolvedVideoSrc = mobile && mobileVideoSrc ? mobileVideoSrc : videoSrc;
    const video = resolvedVideoSrc ? document.createElement("video") : null;
    const image = src && !video ? new Image() : null;
    const frameInterval = mobile ? 66 : 42;
    let frameId = 0;
    let timerId = 0;
    let renderedStaticFrame = false;
    let ready = !image && !video;
    let pageVisible = !document.hidden;
    let suspendUntil = 0;
    let glassPattern = null;
    let glassSize = 0;
    let vignette = null;

    const handleImageLoad = () => {
      ready = true;
      scheduleRender();
    };

    const handleVideoLoad = () => {
      ready = true;
      if (!reducedMotion && pageVisible) video.play().catch(() => {});
      scheduleRender();
    };

    if (image) {
      image.onload = handleImageLoad;
      image.src = src;
    }

    if (video) {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.disablePictureInPicture = true;
      video.addEventListener("loadeddata", handleVideoLoad, { once: true });
      video.src = resolvedVideoSrc;
      video.load();
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratioCap = mobile ? 1 : 1.25;
      const ratio = Math.min(window.devicePixelRatio || 1, ratioCap);
      const nextWidth = Math.max(1, Math.round(bounds.width * ratio));
      const nextHeight = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        glassPattern = null;
        vignette = null;
        renderedStaticFrame = false;
        scheduleRender();
      }
    };

    const handleVisibility = () => {
      pageVisible = !document.hidden;
      if (!pageVisible) {
        window.clearTimeout(timerId);
        cancelAnimationFrame(frameId);
        timerId = 0;
        frameId = 0;
        if (video) video.pause();
        return;
      }
      if (video && !reducedMotion) video.play().catch(() => {});
      scheduleRender();
    };

    const handleCarouselMotion = () => {
      suspendUntil = performance.now() + 560;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener(CAROUSEL_MOTION_EVENT, handleCarouselMotion);
    resize();

    function scheduleRender() {
      if (!pageVisible || timerId || frameId || (reducedMotion && renderedStaticFrame)) return;
      timerId = window.setTimeout(() => {
        timerId = 0;
        frameId = requestAnimationFrame(render);
      }, frameInterval);
    }

    const render = (time) => {
      frameId = 0;
      if (!ready || !pageVisible) {
        scheduleRender();
        return;
      }
      if (time < suspendUntil) {
        scheduleRender();
        return;
      }

      const { width, height } = canvas;
      if (!width || !height) return;

      const configuredSize = mode === "background" ? theme.background.cellSize : theme.portrait.cellSize;
      const size = Math.max(4, Math.round((cellSize ?? configuredSize) * (width / canvas.clientWidth)));
      const gridWidth = Math.ceil(width / size);
      const gridHeight = Math.ceil(height / size);
      const phase = ((time % (theme.background.loopSeconds * 1000)) / (theme.background.loopSeconds * 1000)) * Math.PI * 2;

      if (sampleCanvas.width !== gridWidth || sampleCanvas.height !== gridHeight) {
        sampleCanvas.width = gridWidth;
        sampleCanvas.height = gridHeight;
      }

      sampleContext.save();
      sampleContext.filter = mode === "background"
        ? "blur(0.55px) brightness(0.6) saturate(0.82) sepia(0.34)"
        : "blur(0.35px) brightness(0.82) saturate(0.9) sepia(0.24)";
      if (video) {
        const videoFocusX = mobile && mode === "background" ? 0.29 : 0.5;
        coverMedia(sampleContext, video, gridWidth, gridHeight, videoFocusX, 0.5);
      } else if (image) coverMedia(sampleContext, image, gridWidth, gridHeight);
      else drawProceduralFrame(sampleContext, gridWidth, gridHeight, phase);
      sampleContext.restore();

      context.fillStyle = "#1a0f08";
      context.fillRect(0, 0, width, height);
      context.save();
      context.imageSmoothingEnabled = false;
      context.globalAlpha = 0.9 + Math.sin(phase) * 0.018;
      context.drawImage(sampleCanvas, 0, 0, gridWidth, gridHeight, 0, 0, gridWidth * size, gridHeight * size);
      context.restore();

      if (!glassPattern || glassSize !== size) {
        glassPattern = createGlassPattern(context, glassTile, size);
        glassSize = size;
      }
      context.fillStyle = glassPattern;
      context.fillRect(0, 0, width, height);

      context.fillStyle = mode === "background" ? "rgba(20,10,5,0.18)" : "rgba(20,10,5,0.07)";
      context.fillRect(0, 0, width, height);

      if (!vignette) {
        vignette = context.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.16,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.72,
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(0.64, "rgba(0,0,0,0.035)");
        vignette.addColorStop(1, mode === "background" ? "rgba(0,0,0,0.46)" : "rgba(0,0,0,0.34)");
      }
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
      renderedStaticFrame = true;
      scheduleRender();
    };

    scheduleRender();

    return () => {
      window.clearTimeout(timerId);
      cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener(CAROUSEL_MOTION_EVENT, handleCarouselMotion);
      if (image) image.onload = null;
      if (video) {
        video.removeEventListener("loadeddata", handleVideoLoad);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      sampleCanvas.width = 1;
      sampleCanvas.height = 1;
      glassTile.width = 1;
      glassTile.height = 1;
    };
  }, [cellSize, mobileVideoSrc, mode, src, videoSrc]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`h-full w-full ${className}`} />;
}
