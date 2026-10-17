'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { IMAGE_ACCEPT_ATTR, isAllowedImage } from '../../utils/allowedImageTypes';

const ASPECT_RATIO = 3; // 3:1
const CANVAS_HEIGHT = 280;
const CANVAS_WIDTH = CANVAS_HEIGHT * ASPECT_RATIO;

const GALLERY_IMAGES = [
  '/sample_pics/img.jpg',
  '/sample_pics/img_two.jpg',
  '/sample_pics/img_three.jpg',
];

export default function CoverUploadModal({ onSelect, onClose }) {
  const [tab, setTab] = useState('upload');
  const [imageSrc, setImageSrc] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadImage = useCallback((src) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setCrop({ x: 0, y: 0, scale: 1 });
      setImageSrc(src);
    };
    img.onerror = () => setUrlError('Failed to load image');
    img.src = src;
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAllowedImage(file)) {
      setUrlError('Unsupported file type. Allowed: AVIF, JPEG, PNG, BMP, SVG, WebP.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleUrlSubmit = () => {
    setUrlError('');
    if (!urlInput.trim()) return;
    loadImage(urlInput.trim());
  };

  const handleGallerySelect = (src) => {
    loadImage(src);
  };

  // Draw the crop preview
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imageSrc) return;

    const ctx = canvas.getContext('2d');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    ctx.fillStyle = '#141a26';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const scale = crop.scale;
    const imgW = img.naturalWidth * scale;
    const imgH = img.naturalHeight * scale;

    // Fit image to cover the canvas area, then apply offset
    const fitScale = Math.max(CANVAS_WIDTH / img.naturalWidth, CANVAS_HEIGHT / img.naturalHeight);
    const drawScale = fitScale * scale;
    const drawW = img.naturalWidth * drawScale;
    const drawH = img.naturalHeight * drawScale;
    const drawX = (CANVAS_WIDTH - drawW) / 2 + crop.x;
    const drawY = (CANVAS_HEIGHT - drawH) / 2 + crop.y;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, [imageSrc, crop]);

  const handleMouseDown = (e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setCrop((prev) => ({ ...prev, x: dragStart.current.cropX + dx, y: dragStart.current.cropY + dy }));
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleWheel = (e) => {
    e.preventDefault();
    setCrop((prev) => ({
      ...prev,
      scale: Math.max(0.5, Math.min(3, prev.scale + (e.deltaY > 0 ? -0.05 : 0.05))),
    }));
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export as lossy JPEG at low quality for R2
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    onSelect(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-[680px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Cover Image</h3>
          <button onClick={onClose} className="text-[#888] hover:text-[var(--text-primary)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[var(--border-default)]">
          {[
            { key: 'upload', label: 'Upload' },
            { key: 'gallery', label: 'Gallery' },
            { key: 'url', label: 'Link' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setImageSrc(null); setUrlError(''); }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'text-[#7ba8f0] border-b-2 border-[#7ba8f0]'
                  : 'text-[#888] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Upload tab */}
          {tab === 'upload' && !imageSrc && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-default)] rounded-xl h-[200px] flex flex-col items-center justify-center cursor-pointer hover:border-[#7ba8f0] transition-colors"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-[var(--text-faint)] text-xs mt-2">Click to upload an image</p>
              <p className="text-[#333] text-[10px] mt-1">Recommended: 1200x400 (3:1)</p>
              <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT_ATTR} className="hidden" onChange={handleFileUpload} />
            </div>
          )}

          {/* Gallery tab */}
          {tab === 'gallery' && !imageSrc && (
            <div className="grid grid-cols-3 gap-2">
              {GALLERY_IMAGES.map((src) => (
                <button
                  key={src}
                  onClick={() => handleGallerySelect(src)}
                  className="aspect-[3/1] rounded-lg overflow-hidden border-2 border-transparent hover:border-[#7ba8f0] transition-colors"
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* URL tab */}
          {tab === 'url' && !imageSrc && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder="Paste an image URL..."
                  className="flex-1 bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none text-xs border border-[var(--border-hover)] focus:border-[#7ba8f0] transition-colors"
                />
                <button
                  onClick={handleUrlSubmit}
                  className="px-4 py-2 bg-[#7ba8f0] text-[#030712] font-semibold rounded-lg text-xs hover:bg-[#9dc0ff] transition-colors"
                >
                  Load
                </button>
              </div>
              {urlError && <p className="text-red-400 text-[10px]">{urlError}</p>}
            </div>
          )}

          {/* Crop view */}
          {imageSrc && (
            <div className="space-y-3">
              <p className="text-[#888] text-[10px]">Drag to reposition. Scroll to zoom. 3:1 crop.</p>
              <div
                className="relative rounded-xl overflow-hidden border border-[var(--border-default)] cursor-grab active:cursor-grabbing mx-auto"
                style={{ width: '100%', aspectRatio: '3/1', maxHeight: CANVAS_HEIGHT }}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                  style={{ display: 'block' }}
                />
              </div>

              {/* Zoom slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[#888]">Zoom</span>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={crop.scale}
                  onChange={(e) => setCrop((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))}
                  className="flex-1 accent-[#7ba8f0] h-1"
                />
                <span className="text-[10px] text-[#888] w-8 text-right">{Math.round(crop.scale * 100)}%</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setImageSrc(null); setCrop({ x: 0, y: 0, scale: 1 }); }}
                  className="px-3 py-1.5 text-xs text-[#888] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-1.5 bg-[#7ba8f0] text-[#030712] font-semibold rounded-lg text-xs hover:bg-[#9dc0ff] transition-colors"
                >
                  Set Cover
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
