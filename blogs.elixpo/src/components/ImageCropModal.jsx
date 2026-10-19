'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { IMAGE_ACCEPT_ATTR, isAllowedImage } from '../utils/allowedImageTypes';

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100, vignette: 0 };

// One crop + stylise modal for every fixed-ratio image: avatars, banners, covers
// (NOT in-blog images). The caller fixes the aspect ratio and output size; the
// user pans/zooms within that ratio and tunes brightness / contrast / saturation
// / vignette. Outputs a WebP Blob to onSave (or null when the image is removed).
export default function ImageCropModal({
  title = 'Edit Image',
  aspectRatio = 16 / 5,
  outputWidth = 1200,
  quality = 0.55,         // starting WebP quality; lowered further to hit maxSizeKB
  maxSizeKB = 120,        // hard target — output is re-encoded down until it fits
  round = false,          // circular crop guide (avatars)
  currentImage = null,    // shows a "Remove" action when set
  initialSrc = null,      // open straight into crop with this image (skips the source tabs)
  belowHeader = false,    // editor covers sit below its fixed navbar
  squareDialog = false,   // constrain the outer panel to a responsive 1:1 shape
  onSave,
  onClose,
}) {
  const outputHeight = Math.round(outputWidth / aspectRatio);
  const isSquare = Math.abs(aspectRatio - 1) < 0.01;

  const [tab, setTab] = useState('upload');
  const [imageSrc, setImageSrc] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  const resetState = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0, scale: 1 });
    setFilters(DEFAULT_FILTERS);
    setUrlError('');
  };

  const loadImage = useCallback((src) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setCrop({ x: 0, y: 0, scale: 1 });
      setFilters(DEFAULT_FILTERS);
      setImageSrc(src);
    };
    img.onerror = () => setUrlError('Failed to load image');
    img.src = src;
  }, []);

  // Caller pre-selected an image (e.g. a device file) — load it straight away.
  useEffect(() => {
    if (initialSrc) loadImage(initialSrc);
  }, [initialSrc, loadImage]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAllowedImage(file)) {
      setUrlError('Unsupported file type. Allowed: AVIF, JPEG, PNG, BMP, SVG, WebP.');
      e.target.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUrlError('File too large (max 20MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !isAllowedImage(file)) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleUrlSubmit = () => {
    setUrlError('');
    if (!urlInput.trim()) return;
    loadImage(urlInput.trim());
  };

  // Render the crop + filters to the output-resolution canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imageSrc) return;

    const ctx = canvas.getContext('2d');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    ctx.fillStyle = '#141a26';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    // Colour adjustments apply to the photo only (vignette is drawn after).
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`;

    const fitScale = Math.max(outputWidth / img.naturalWidth, outputHeight / img.naturalHeight);
    const drawScale = fitScale * crop.scale;
    const drawW = img.naturalWidth * drawScale;
    const drawH = img.naturalHeight * drawScale;
    const drawX = (outputWidth - drawW) / 2 + crop.x;
    const drawY = (outputHeight - drawH) / 2 + crop.y;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.filter = 'none';

    // Vignette — radial darkening from the edges inward.
    if (filters.vignette > 0) {
      const cx = outputWidth / 2;
      const cy = outputHeight / 2;
      const outerR = Math.hypot(outputWidth, outputHeight) / 2;
      const g = ctx.createRadialGradient(cx, cy, outerR * 0.5, cx, cy, outerR);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(filters.vignette / 100) * 0.9})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outputWidth, outputHeight);
    }
  }, [imageSrc, crop, filters, outputWidth, outputHeight]);

  // Pointer drag → pan (mouse + touch), scaled from preview px to canvas px.
  const panFrom = (clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scaleX = outputWidth / rect.width;
    const scaleY = outputHeight / rect.height;
    const dx = (clientX - dragStart.current.x) * scaleX;
    const dy = (clientY - dragStart.current.y) * scaleY;
    setCrop((prev) => ({ ...prev, x: dragStart.current.cropX + dx, y: dragStart.current.cropY + dy }));
  };

  const handleMouseDown = (e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
  };
  const handleMouseMove = useCallback((e) => { if (dragging) panFrom(e.clientX, e.clientY); }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    setDragging(true);
    dragStart.current = { x: t.clientX, y: t.clientY, cropX: crop.x, cropY: crop.y };
  };
  const handleTouchMove = useCallback((e) => { if (dragging) panFrom(e.touches[0].clientX, e.touches[0].clientY); }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  // Lock background page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, saving]);

  // Wheel-to-zoom: attach a NON-passive listener so preventDefault actually stops
  // the page (and the modal) from scrolling. React's onWheel is passive, so it can't.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imageSrc) return;
    const onWheel = (e) => {
      e.preventDefault();
      setCrop((prev) => ({ ...prev, scale: Math.max(0.3, Math.min(4, prev.scale + (e.deltaY > 0 ? -0.05 : 0.05))) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [imageSrc]);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    // Always lossy WebP; step quality down until the blob fits maxSizeKB so every
    // image hitting the site is heavily compressed regardless of source size.
    const toBlob = (q) => new Promise((res) => canvas.toBlob(res, 'image/webp', q));
    const maxBytes = maxSizeKB * 1024;
    let blob = null;
    for (let q = quality; q >= 0.3; q -= 0.1) {
      blob = await toBlob(q);
      if (blob && blob.size <= maxBytes) break;
    }
    if (blob) onSave(blob);
    setSaving(false);
  };

  const handleRemove = () => { onSave(null); onClose(); };

  const SLIDERS = [
    { key: 'brightness', label: 'Brightness', min: 50, max: 150, suffix: '%', defaultValue: 100 },
    { key: 'contrast', label: 'Contrast', min: 50, max: 150, suffix: '%', defaultValue: 100 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 200, suffix: '%', defaultValue: 100 },
    { key: 'vignette', label: 'Vignette', min: 0, max: 100, suffix: '', defaultValue: 0 },
  ];

  return (
    <div
      className={`fixed inset-x-0 bottom-0 flex items-center justify-center p-4 ${belowHeader ? 'top-14 z-[49] bg-black/40' : 'top-0 z-[100] bg-black/55'}`}
      onClick={onClose}
    >
      <div
        className="border rounded-2xl w-full max-w-[900px] overflow-y-auto overscroll-contain"
        style={{
          ...(squareDialog && {
            width: 'min(640px, calc(100vw - 2rem), calc(100dvh - 2rem))',
            height: 'min(640px, calc(100vw - 2rem), calc(100dvh - 2rem))',
          }),
          maxHeight: belowHeader ? 'calc(100dvh - 5rem)' : 'calc(100dvh - 2rem)',
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--card-border)',
          color: 'var(--text-primary)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.42), 0 0 0 1px rgba(155,123,247,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]" style={{ backgroundColor: 'var(--card-bg)' }}>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Source tabs — only before an image is chosen */}
        {!imageSrc && (
          <div className="flex border-b border-[var(--border-default)]">
            {[
              { key: 'upload', label: 'Upload', icon: 'cloud-upload-outline' },
              { key: 'url', label: 'From URL', icon: 'link-outline' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); resetState(); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium transition-colors ${
                  tab === t.key
                    ? 'text-[var(--text-primary)] border-b-2 border-[#9b7bf7]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-body)] border-b-2 border-transparent'
                }`}
              >
                <ion-icon name={t.icon} style={{ fontSize: '15px' }} />
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="p-6">
          {/* Upload */}
          {tab === 'upload' && !imageSrc && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-[var(--border-default)] rounded-xl h-[180px] flex flex-col items-center justify-center cursor-pointer hover:border-[var(--border-hover)] transition-colors group"
            >
              <ion-icon name="image-outline" style={{ fontSize: '30px', color: 'var(--text-faint)' }} />
              <p className="text-[var(--text-muted)] text-[13px] mt-2">Drop an image or click to browse</p>
              <p className="text-[var(--text-faint)] text-[11px] mt-1">
                {round ? 'Square crop' : `${aspectRatio.toFixed(2)}:1 crop`} · output {outputWidth}×{outputHeight}. Max 20MB.
              </p>
              <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT_ATTR} className="hidden" onChange={handleFileUpload} />
            </div>
          )}

          {/* URL */}
          {tab === 'url' && !imageSrc && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 bg-[var(--bg-app)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 outline-none text-[13px] border border-[var(--border-default)] focus:border-[var(--border-hover)] transition-colors placeholder-[var(--text-faint)]"
                />
                <button onClick={handleUrlSubmit} className="px-5 py-2.5 bg-[#9b7bf7] text-white font-semibold rounded-lg text-[13px] hover:bg-[#b69aff] transition-colors">
                  Load
                </button>
              </div>
              {urlError && <p className="text-red-400 text-[11px]">{urlError}</p>}
            </div>
          )}
          {urlError && imageSrc === null && tab === 'upload' && <p className="text-red-400 text-[11px] mt-2">{urlError}</p>}

          {/* Crop + stylise */}
          {imageSrc && (
            <div className="space-y-5">
              <div className={isSquare ? 'flex justify-center' : ''}>
                <div
                  ref={containerRef}
                  className={`relative overflow-hidden border border-[var(--border-default)] cursor-grab active:cursor-grabbing select-none ${round ? 'rounded-full' : 'rounded-xl'} ${isSquare ? '' : 'w-full'}`}
                  style={isSquare
                    ? { width: 'min(280px, 75vw)', aspectRatio: '1 / 1' }
                    : { width: '100%', aspectRatio: `${aspectRatio}` }}
                  onMouseDown={handleMouseDown}
                  onTouchStart={handleTouchStart}
                >
                  <canvas ref={canvasRef} className="w-full h-full block" />
                  <div className="absolute bottom-2 right-2 bg-black/50 rounded-md px-2 py-1 text-[10px] text-[#ccc] pointer-events-none">
                    Drag · scroll to zoom
                  </div>
                </div>
              </div>

              {/* Zoom */}
              <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <label className="text-[11px] text-[var(--text-muted)] mb-2 flex items-center justify-between">
                  <span className="font-medium">Zoom</span>
                  <span className="flex items-center gap-2">
                    <span>{Math.round(crop.scale * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => setCrop((prev) => ({ ...prev, x: 0, y: 0, scale: 1 }))}
                      className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-faint)' }}
                      title="Reset zoom and position"
                      aria-label="Reset zoom and position"
                    >
                      <ion-icon name="refresh-outline" style={{ fontSize: '14px' }} />
                    </button>
                  </span>
                </label>
                <input
                  type="range" min="0.3" max="4" step="0.05" value={crop.scale}
                  onChange={(e) => setCrop((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))}
                  className="w-full accent-[#9b7bf7] h-1 bg-[var(--bg-elevated)] rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Stylise */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SLIDERS.map((s) => (
                  <div key={s.key} className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <label className="text-[11px] text-[var(--text-muted)] mb-2 flex items-center justify-between">
                      <span className="font-medium">{s.label}</span>
                      <span className="flex items-center gap-2">
                        <span>{filters[s.key]}{s.suffix}</span>
                        <button
                          type="button"
                          onClick={() => setFilters((prev) => ({ ...prev, [s.key]: s.defaultValue }))}
                          className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--text-faint)' }}
                          title={`Reset ${s.label.toLowerCase()}`}
                          aria-label={`Reset ${s.label.toLowerCase()}`}
                        >
                          <ion-icon name="refresh-outline" style={{ fontSize: '14px' }} />
                        </button>
                      </span>
                    </label>
                    <input
                      type="range" min={s.min} max={s.max} step="1" value={filters[s.key]}
                      onChange={(e) => setFilters((prev) => ({ ...prev, [s.key]: parseInt(e.target.value) }))}
                      className="w-full accent-[#9b7bf7] h-1 bg-[var(--bg-elevated)] rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap gap-2">
                  <button onClick={resetState} className="px-4 py-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-lg transition-colors">
                    Change image
                  </button>
                  <button onClick={() => setFilters(DEFAULT_FILTERS)} className="px-4 py-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-lg transition-colors">
                    Reset style
                  </button>
                  {currentImage && (
                    <button onClick={handleRemove} className="px-4 py-2 text-[13px] text-red-400 hover:text-red-300 bg-[var(--bg-elevated)] rounded-lg transition-colors">
                      Remove
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-[#9b7bf7] text-white font-semibold rounded-lg text-[13px] hover:bg-[#b69aff] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <span className="h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
