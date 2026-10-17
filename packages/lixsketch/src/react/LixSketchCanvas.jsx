'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImage } from '../utils/imageCompressor.js';
let _saveScene = null;
let _loadScene = null;
async function ensureSceneSerializer() {
  if (_saveScene && _loadScene) return;
  const m = await import('../core/SceneSerializer.js');
  _saveScene = m.saveScene;
  _loadScene = m.loadScene;
}

import useSketchStore, { TOOLS } from './store/useSketchStore.js';
import useUIStore from './store/useUIStore.js';
import SVGCanvas from './components/canvas/SVGCanvas.jsx';
import Toolbar from './components/Toolbar.jsx';
import Footer from './components/Footer.jsx';
import AppMenu from './components/AppMenu.jsx';
import RectangleSidebar from './components/sidebars/RectangleSidebar.jsx';
import CircleSidebar from './components/sidebars/CircleSidebar.jsx';
import PaintBucketSidebar from './components/sidebars/PaintBucketSidebar.jsx';
import LineSidebar from './components/sidebars/LineSidebar.jsx';
import ArrowSidebar from './components/sidebars/ArrowSidebar.jsx';
import PaintbrushSidebar from './components/sidebars/PaintbrushSidebar.jsx';
import TextSidebar from './components/sidebars/TextSidebar.jsx';
import FrameSidebar from './components/sidebars/FrameSidebar.jsx';
import IconSidebar from './components/sidebars/IconSidebar.jsx';
import ImageSidebar from './components/sidebars/ImageSidebar.jsx';
import MultiSelectActions from './components/canvas/MultiSelectActions.jsx';
import ContextMenu from './components/canvas/ContextMenu.jsx';
import FindBar from './components/canvas/FindBar.jsx';
import ImageSourcePicker from './components/canvas/ImageSourcePicker.jsx';
import CanvasLoadingOverlay from './components/canvas/CanvasLoadingOverlay.jsx';
import CommandPalette from './components/modals/CommandPalette.jsx';
import ExportImageModal from './components/modals/ExportImageModal.jsx';
import LixScriptModal from './components/modals/LixScriptModal.jsx';
import GraphModal from './components/modals/GraphModal.jsx';
import WebEmbedModal from './components/modals/WebEmbedModal.jsx';

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Self-contained canvas component. Mounts the SketchEngine on an internal
 * <svg>, renders the full toolbar + per-shape sidebars + offline modals,
 * and surfaces scene changes + image uploads to the host.
 *
 * Offline-first: no cloud sync, AI, or auth code paths reach this build.
 * The host owns persistence and image upload via the two callbacks.
 */
export default function LixSketchCanvas({
  initialScene = null,
  onSceneChange = null,
  onUploadImage = null,
  onExit = null,
  className = '',
  style = null,
}) {
  const wrapperRef = useRef(null);
  const lastSceneJsonRef = useRef('');
  const debounceRef = useRef(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Re-route engine image uploads through the host before any user action.
  useEffect(() => {
    installImageUploadBridge(onUploadImage);
  }, [onUploadImage]);

  // Eager-load lixFont / lixCode so the textarea overlay used while a user
  // types into a text shape uses the same font as the final rendered text.
  // Without this, the first text edit shows in a system font and snaps to
  // lixFont only after the SVG re-renders.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    Promise.allSettled([
      document.fonts.load('1em lixFont'),
      document.fonts.load('1em lixCode'),
    ]).catch(() => {});
  }, []);

  // Apply initialScene once the engine reports ready (via window.__sketchEngine).
  useEffect(() => {
    if (!initialScene || bootstrapped) return;
    let cancelled = false;
    async function tryLoad() {
      if (cancelled) return;
      const serializer = window.__sceneSerializer;
      if (!serializer) {
        setTimeout(tryLoad, 200);
        return;
      }
      try {
        await ensureSceneSerializer();
        if (cancelled) return;
        const data = typeof initialScene === 'string' ? JSON.parse(initialScene) : initialScene;
        if (data && data.format === 'lixsketch') {
          _loadScene(data);
          lastSceneJsonRef.current = JSON.stringify(data);
        }
      } catch (err) {
        console.warn('[LixSketchCanvas] initialScene load failed:', err);
      }
      setBootstrapped(true);
    }
    tryLoad();
    return () => { cancelled = true; };
  }, [initialScene, bootstrapped]);

  // Ctrl+S → flush + show toast. Same UX as the standalone product but
  // with no cloud round-trip — onSceneChange (passed by the host) is the
  // real persistence layer.
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        useUIStore.getState().closeAllModals?.();
        return;
      }
      const target = e.target;
      const tag = (target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && (e.key || '').toLowerCase() === 'r') {
        e.preventDefault();
        useSketchStore.getState().toggleRulers();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = (e.key || '').toLowerCase();
      if (key !== 's' || e.shiftKey) return;
      e.preventDefault();
      (async () => {
        try {
          await ensureSceneSerializer();
          const scene = _saveScene('Untitled');
          const json = JSON.stringify(scene);
          lastSceneJsonRef.current = json;
          if (onSceneChange) {
            const metadata = {
              shapeCount: Array.isArray(scene.shapes) ? scene.shapes.length : 0,
              viewport: scene.viewport || null,
              zoom: scene.zoom || 1,
              sizeBytes: json.length,
              savedAt: Date.now(),
            };
            onSceneChange(scene, metadata);
          }
          // Show the in-canvas save toast (rendered below).
          const toast = document.getElementById('lixsketch-save-toast');
          if (toast) {
            toast.classList.remove('hidden');
            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 1800);
          }
          useUIStore.getState().setSaveStatus?.('cloud');
        } catch (err) {
          console.warn('[LixSketchCanvas] Ctrl+S save failed:', err);
        }
      })();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSceneChange]);

  // Scene-change autosave — MutationObserver + mouseup, debounced.
  useEffect(() => {
    if (!onSceneChange) return;
    let svg = null;
    let observer = null;

    const flush = async () => {
      try {
        await ensureSceneSerializer();
        const scene = _saveScene('Untitled');
        const json = JSON.stringify(scene);
        if (json === lastSceneJsonRef.current) return;
        lastSceneJsonRef.current = json;
        const metadata = {
          shapeCount: Array.isArray(scene.shapes) ? scene.shapes.length : 0,
          viewport: scene.viewport || null,
          zoom: scene.zoom || 1,
          sizeBytes: json.length,
          savedAt: Date.now(),
        };
        onSceneChange(scene, metadata);
      } catch (err) {
        console.warn('[LixSketchCanvas] save failed:', err);
      }
    };
    const debounced = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };

    function attach() {
      svg = window.svg;
      if (!svg) {
        setTimeout(attach, 200);
        return;
      }
      observer = new MutationObserver(debounced);
      observer.observe(svg, { childList: true, subtree: true, attributes: true });
      svg.addEventListener('mouseup', debounced);
    }
    attach();
    window.addEventListener('beforeunload', flush);

    return () => {
      if (observer) observer.disconnect();
      if (svg) svg.removeEventListener('mouseup', debounced);
      window.removeEventListener('beforeunload', flush);
      clearTimeout(debounceRef.current);
    };
  }, [onSceneChange]);

  return (
    <div
      ref={wrapperRef}
      className={`lixsketch-canvas-root canvas-mode ${className}`}
      style={style}
    >
      <SVGCanvas />
      <Toolbar />
      <Footer />
      <AppMenu />
      <RectangleSidebar />
      <CircleSidebar />
      <PaintBucketSidebar />
      <LineSidebar />
      <ArrowSidebar />
      <PaintbrushSidebar />
      <TextSidebar />
      <FrameSidebar />
      <IconSidebar />
      <ImageSidebar />
      <MultiSelectActions />
      <CommandPalette />
      <ExportImageModal />
      <LixScriptModal />
      <GraphModal />
      <WebEmbedModal />
      <ContextMenu />
      <FindBar />
      <ImageSourcePicker />
      <CanvasLoadingOverlay />

      {/* Floating header — menu trigger + command center. Hosts can
          hide this strip by setting CSS `.lixsketch-floating-header { display: none }`
          if they render their own chrome (blogs.elixpo's CanvasSubpage does). */}
      <div className="lixsketch-floating-header absolute top-2 right-2 z-[1000] flex items-center gap-1.5 font-[lixFont]">
        <button
          type="button"
          title="LixScript MCP — coming soon"
          onClick={() => useUIStore.getState().toggleAIModal?.()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <i className="bx bx-code-alt text-base" />
        </button>
        <button
          type="button"
          title="Graph — plot equations"
          onClick={() => useUIStore.getState().toggleGraphModal?.()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <i className="bx bx-line-chart text-base" />
        </button>
        <button
          type="button"
          title="Commands and shortcuts (Ctrl+/)"
          onClick={() => useUIStore.getState().toggleCommandPalette?.()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <i className="bx bx-command text-base" />
        </button>
        <button
          type="button"
          title="Menu"
          onClick={() => useUIStore.getState().toggleMenu?.()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <i className="bx bx-menu text-base" />
        </button>
      </div>

      {/* Save toast — same look as the standalone product. Hidden by
          default; Ctrl+S flips the `hidden` class on/off. */}
      <div
        id="lixsketch-save-toast"
        className="hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl bg-surface/85 backdrop-blur-md border border-border-light text-text-secondary text-xs font-[lixFont] pointer-events-none"
      >
        <i className="bx bx-check text-green-400 mr-1.5" />
        Saved
      </div>
    </div>
  );
}

// ── Image upload bridge ───────────────────────────────────────────────
function installImageUploadBridge(onUploadImage) {
  if (typeof window === 'undefined') return;
  if (!onUploadImage) {
    // Offline mode (no host upload pipeline): leave the engine's
    // compressed-data-URL placement as the final state.
    window.uploadImageToCloudinary = async () => {};
    return;
  }

  window.uploadImageToCloudinary = async function bridgedUpload(imageShape) {
    const href = imageShape?.element?.getAttribute('href') || '';
    if (!href.startsWith('data:')) return;

    imageShape.uploadStatus = 'uploading';
    imageShape.uploadAbortController = new AbortController();
    const signal = imageShape.uploadAbortController.signal;
    imageShape.showUploadIndicator?.();

    try {
      let payloadDataUrl = href;
      try {
        const compressed = await compressImage(href);
        if (compressed?.dataUrl) payloadDataUrl = compressed.dataUrl;
      } catch (err) {
        console.warn('[LixSketchCanvas] compression failed, sending raw:', err);
      }
      if (signal.aborted) return;

      const result = await onUploadImage(payloadDataUrl);
      if (signal.aborted) return;
      if (!result?.url) throw new Error(result?.error || 'Upload failed');

      imageShape.element.setAttribute('href', result.url);
      imageShape.element.setAttribute('data-href', result.url);
      if (result.publicId) imageShape.element.setAttribute('data-cloudinary-id', result.publicId);
      if (typeof result.sizeBytes === 'number') {
        const oldSize = imageShape.element.__fileSize || 0;
        imageShape.element.__fileSize = result.sizeBytes;
        window.__roomImageBytesUsed = Math.max(
          0,
          (window.__roomImageBytesUsed || 0) - oldSize + result.sizeBytes
        );
      }
      imageShape.uploadStatus = 'done';
    } catch (err) {
      if (!signal.aborted) {
        console.warn('[LixSketchCanvas] upload failed:', err);
        imageShape.uploadStatus = 'failed';
      }
    } finally {
      imageShape.removeUploadIndicator?.();
      imageShape.uploadAbortController = null;
    }
  };
}
