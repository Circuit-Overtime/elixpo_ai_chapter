'use client';

import { useState, useEffect, useRef, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../../components/Navbar/Navbar';
import { saveToLibrary } from '../../lib/library';
import { isSignedIn, getUser } from '../../lib/auth';
import { useModels } from '../../lib/useModels';
import { generateVideo } from '../../lib/videoGen';
import { generateVideoPrompt } from '../../lib/autoPrompt';
import styles from './Session.module.css';

const API_BASE = '/api';

export default function SessionPage({ params }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { imageModels: IMAGE_MODELS, videoModels: VIDEO_MODELS, all: ALL_MODELS } = useModels();

  const [prompt, setPrompt] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [model, setModel] = useState('flux');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(576);
  const [mode, setMode] = useState('image');
  const [genStyle, setGenStyle] = useState(null);
  const [duration, setDuration] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [seed, setSeed] = useState(0);

  const [resultSrc, setResultSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generationTime, setGenerationTime] = useState(null);

  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Video state
  const [previewTab, setPreviewTab] = useState('image');
  const [videoSrc, setVideoSrc] = useState(null);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoMaintenance, setVideoMaintenance] = useState(false);
  const hasGenerated = useRef(false);
  const moreMenuRef = useRef(null);

  // Remix brush state
  const [remixMode, setRemixMode] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [remixPrompt, setRemixPrompt] = useState('');
  const [remixLoading, setRemixLoading] = useState(false);
  const [newRefImage, setNewRefImage] = useState(null);
  const [newRefPreview, setNewRefPreview] = useState(null);
  const refInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const isDrawing = useRef(false);

  // Determine ref image limit by tier
  const getRefImageLimit = () => {
    if (!isSignedIn()) return 1; // guest
    return 2; // free and above
  };

  // Clipboard paste → reference image
  useEffect(() => {
    const handlePaste = (e) => {
      if (remixMode) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          if (newRefImage && getRefImageLimit() <= 1) return; // guest limit
          const url = URL.createObjectURL(file);
          setNewRefImage(url);
          setNewRefPreview(url);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [remixMode, newRefImage]);

  // Close more menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Read query params for property overrides
  const searchParams = useSearchParams();

  // Build shareable URL params (excludes reference images)
  const updateUrlParams = (params) => {
    const q = new URLSearchParams();
    if (params.prompt) q.set('prompt', params.prompt);
    if (params.model) q.set('model', params.model);
    if (params.width) q.set('width', String(params.width));
    if (params.height) q.set('height', String(params.height));
    if (params.mode) q.set('mode', params.mode);
    if (params.seed) q.set('seed', String(params.seed));
    if (params.style) q.set('style', params.style);
    if (params.mode === 'video' && params.duration) q.set('duration', String(params.duration));
    const newUrl = `/generate/${sessionId}?${q.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  useEffect(() => {
    if (hasGenerated.current) return;
    hasGenerated.current = true;

    const stored = sessionStorage.getItem(`gen_${sessionId}`);

    // Build params from sessionStorage or URL query params
    let p;
    if (stored) {
      p = JSON.parse(stored);
      // Query params override stored values
      if (searchParams.get('model')) p.model = searchParams.get('model');
      if (searchParams.get('width')) p.width = Number(searchParams.get('width'));
      if (searchParams.get('height')) p.height = Number(searchParams.get('height'));
      if (searchParams.get('mode')) p.mode = searchParams.get('mode');
      if (searchParams.get('duration')) p.duration = Number(searchParams.get('duration'));
      if (searchParams.get('seed')) p.seed = Number(searchParams.get('seed'));
      if (searchParams.get('style')) p.style = searchParams.get('style');
    } else if (searchParams.get('prompt')) {
      // URL-only visit — build session from query params (shareable link)
      p = {
        prompt: searchParams.get('prompt'),
        model: searchParams.get('model') || 'flux',
        width: Number(searchParams.get('width')) || 1024,
        height: Number(searchParams.get('height')) || 576,
        mode: searchParams.get('mode') || 'image',
        duration: searchParams.get('duration') ? Number(searchParams.get('duration')) : null,
        seed: searchParams.get('seed') ? Number(searchParams.get('seed')) : null,
        style: searchParams.get('style') || null,
      };
    } else {
      setError('Session not found. Please start a new generation.');
      setLoading(false);
      return;
    }

    setPrompt(p.prompt);
    setModel(p.model);
    setWidth(p.width);
    setHeight(p.height);
    setMode(p.mode || 'image');
    if (p.style) setGenStyle(p.style);
    setDuration(p.duration);
    setImageUrl(p.imageUrl);
    if (p.seed) setSeed(p.seed);
    if (p.videoData) setVideoSrc(p.videoData);
    if (p.resultSrc) {
      setResultSrc(p.resultSrc);
      setGenerationTime(p.generationTime);
      setSeed(p.seed);
      setLoading(false);
      updateUrlParams(p);
      return;
    }

    generate(p);
  }, [sessionId]);

  const generate = async (p) => {
    setLoading(true);
    setError(null);
    setResultSrc(null);
    setGenerationTime(null);
    const start = Date.now();

    try {
      const isVideo = p.mode === 'video';
      const usedSeed = p.seed || Math.floor(Math.random() * 2147483647);
      setSeed(usedSeed);

      let blobUrl;
      if (isVideo) {
        const res = await fetch(`${API_BASE}/generate/video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: p.prompt, model: p.model, width: p.width, height: p.height,
            duration: p.duration, imageUrl: p.imageUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Video generation failed');
        blobUrl = data.videoData;
      } else {
        const res = await fetch(`${API_BASE}/generate/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: p.prompt, model: p.model, width: p.width, height: p.height,
            seed: usedSeed, style: p.style, imageUrl: p.imageUrl, imageUrls: p.imageUrls,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        blobUrl = data.imageData || data.imageUrl;
        if (data.seed) setSeed(data.seed);
      }

      const genTime = Date.now() - start;
      setResultSrc(blobUrl);
      setGenerationTime(genTime);

      saveSession({ ...p, seed: usedSeed, resultSrc: blobUrl, generationTime: genTime });
      updateUrlParams({ ...p, seed: usedSeed });

      // Create blob for thumbnail
      try {
        const thumbRes = await fetch(blobUrl);
        const blob = await thumbRes.blob();
        saveThumbnailToLibrary(blob, { ...p, seed: usedSeed, generationTime: genTime });
      } catch {}
    } catch (err) {
      setError(err.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const saveSession = (data) => {
    sessionStorage.setItem(`gen_${sessionId}`, JSON.stringify({
      prompt: data.prompt || prompt,
      model: data.model || model,
      width: data.width || width,
      height: data.height || height,
      mode: data.mode || mode,
      duration: data.duration || duration,
      imageUrl: data.imageUrl || imageUrl,
      seed: data.seed || seed,
      resultSrc: data.resultSrc || resultSrc,
      generationTime: data.generationTime || generationTime,
      timestamp: Date.now(),
    }));
  };

  const saveThumbnailToLibrary = async (blob, data) => {
    try {
      // Create a small thumbnail (300px wide) to keep localStorage lightweight
      const bitmap = await createImageBitmap(blob);
      const scale = 300 / bitmap.width;
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

      saveToLibrary({
        sessionId,
        thumbnail,
        prompt: data.prompt || prompt,
        model: data.model || model,
        width: data.width || width,
        height: data.height || height,
        mode: data.mode || mode,
        duration: data.duration || duration,
        seed: data.seed || seed,
        generationTime: data.generationTime || generationTime,
      });
    } catch {
      // Fallback — save without thumbnail
      saveToLibrary({
        sessionId,
        prompt: data.prompt || prompt,
        model: data.model || model,
        width: data.width || width,
        height: data.height || height,
        mode: data.mode || mode,
        seed: data.seed || seed,
      });
    }
  };

  const handleRegenerate = () => {
    generate({ prompt, model, width, height, mode, duration, imageUrl });
  };

  const handleRefImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setNewRefImage(url);
    setNewRefPreview(url);
  };

  const clearRefImage = () => {
    setNewRefImage(null);
    setNewRefPreview(null);
    if (refInputRef.current) refInputRef.current.value = '';
  };

  const handleNewGeneration = () => {
    if (!newPrompt.trim()) return;
    const id = crypto.randomUUID();
    sessionStorage.setItem(`gen_${id}`, JSON.stringify({
      prompt: newPrompt.trim(), model, width, height, mode, duration, imageUrl: newRefImage || null, timestamp: Date.now(),
    }));
    router.push(`/generate/${id}`);
  };

  const handleDownload = () => {
    if (!resultSrc) return;
    const a = document.createElement('a');
    a.href = resultSrc;
    a.download = `elixpo-${sessionId.slice(0, 8)}.${mode === 'video' ? 'mp4' : 'png'}`;
    a.click();
  };

  const handleCopyImage = async () => {
    if (!resultSrc) return;
    try {
      const res = await fetch(resultSrc);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch { /* clipboard may not support image */ }
    setMoreMenuOpen(false);
  };

  const handleCopySeed = () => {
    navigator.clipboard.writeText(String(seed));
    setMoreMenuOpen(false);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt);
  };

  const handleCreateVideo = async () => {
    if (!resultSrc || generatingVideo) return;
    setGeneratingVideo(true);
    setPreviewTab('video');

    try {
      // Auto-generate a video prompt from the image if no custom prompt
      let videoPrompt = prompt;
      if (!videoPrompt || videoPrompt.length < 5) {
        videoPrompt = await generateVideoPrompt(resultSrc);
        console.log('[video] Auto-prompt:', videoPrompt);
      }

      const result = await generateVideo({
        prompt: videoPrompt,
        model: 'ltx-2',
        width,
        height,
        duration: 5,
        imageUrl: resultSrc,
      });

      if (result.success) {
        setVideoSrc(result.videoData);
        setPreviewTab('video');
        saveSession({ videoData: result.videoData });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingVideo(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!resultSrc) return;
    setActionsOpen(false);
    setLoading(true);
    try {
      const editPrompt = 'Remove the background completely, make it transparent, keep only the main subject';
      const res = await fetch(`${API_BASE}/generate/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editPrompt, imageUrl: resultSrc, model: 'gptimage', width, height }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Background removal failed');
      const blobUrl = data.imageData || data.imageUrl;
      setResultSrc(blobUrl);
      setModel('gptimage');
      saveSession({ prompt: editPrompt, model: 'gptimage', resultSrc: blobUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUnzoomed = () => {
    if (!resultSrc) return;
    window.open(resultSrc, '_blank');
    setActionsOpen(false);
  };

  const handleEditPose = async () => {
    if (!resultSrc) return;
    setActionsOpen(false);
    setLoading(true);
    try {
      const editPrompt = 'Edit the character pose in this image, adjust the body position naturally while keeping the same character and style';
      const res = await fetch(`${API_BASE}/generate/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editPrompt, imageUrl: resultSrc, model: 'gptimage', width, height }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pose edit failed');
      const blobUrl = data.imageData || data.imageUrl;
      setResultSrc(blobUrl);
      setModel('gptimage');
      saveSession({ prompt: editPrompt, model: 'gptimage', resultSrc: blobUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReportImage = () => {
    setActionsOpen(false);
    alert('Image has been reported. Thank you for helping keep Elixpo safe.');
  };

  const handleDeleteImage = () => {
    if (!resultSrc) return;
    URL.revokeObjectURL(resultSrc);
    setResultSrc(null);
    sessionStorage.removeItem(`gen_${sessionId}`);
    // Remove from library
    try {
      const lib = JSON.parse(localStorage.getItem('elixpo_library') || '[]');
      const updated = lib.filter((item) => item.sessionId !== sessionId);
      localStorage.setItem('elixpo_library', JSON.stringify(updated));
    } catch {}
    router.push('/generate');
  };

  const handleShareImage = async () => {
    if (!resultSrc) return;
    try {
      const res = await fetch(resultSrc);
      const blob = await res.blob();
      const file = new File([blob], `elixpo-${sessionId.slice(0, 8)}.png`, { type: blob.type });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Elixpo Art', text: prompt, files: [file] });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    } catch {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNewGeneration(); }
  };

  // ── Remix brush logic ──
  const startRemix = () => {
    setRemixMode(true);
    setMoreMenuOpen(false);
    // Init canvas after render
    requestAnimationFrame(() => initCanvas());
  };

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const lastPoint = useRef(null);

  const onBrushDown = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    const { x, y } = getCanvasCoords(e);
    lastPoint.current = { x, y };
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = '#06d6a0';
    ctx.fillStyle = '#06d6a0';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const onBrushMove = (e) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = '#06d6a0';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPoint.current = { x, y };
  };

  const onBrushUp = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  const cancelRemix = () => {
    setRemixMode(false);
    setRemixPrompt('');
  };

  const submitRemix = async () => {
    if (!remixPrompt.trim() || !resultSrc) return;
    setRemixLoading(true);

    try {
      const editPrompt = remixPrompt.trim();
      const res = await fetch(`${API_BASE}/generate/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editPrompt, imageUrl: resultSrc, model: 'gptimage', width, height }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edit failed');
      const blobUrl = data.imageData || data.imageUrl;

      setResultSrc(blobUrl);
      setModel('gptimage');
      setRemixMode(false);
      setRemixPrompt('');
      saveSession({ prompt: editPrompt, model: 'gptimage', resultSrc: blobUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setRemixLoading(false);
    }
  };

  const sel = ALL_MODELS.find((m) => m.id === model) || { label: model };
  const activeModels = mode === 'video' ? VIDEO_MODELS : IMAGE_MODELS;

  return (
    <div className={styles.page}>
      <Navbar />

      <div className={styles.layout}>
        <div className={styles.content}>
          {resultSrc && !loading && (videoSrc || generatingVideo) && (
            <div className={styles.previewTabs}>
              <button
                className={`${styles.previewTab} ${previewTab === 'image' ? styles.previewTabActive : ''}`}
                onClick={() => setPreviewTab('image')}
              >
                Image
              </button>
              <button
                className={`${styles.previewTab} ${previewTab === 'video' ? styles.previewTabActive : ''}`}
                onClick={() => setPreviewTab('video')}
              >
                Video
                {generatingVideo && <span className={styles.tabSpinner} />}
              </button>
            </div>
          )}
          <div className={styles.imageContainer}>
            <div className={styles.ambientBlob1} aria-hidden="true" />
            <div className={styles.ambientBlob2} aria-hidden="true" />

            {loading && (
              <div className={styles.bokehFill}>
                <div className={styles.bokehOrb} style={{ '--x': '15%', '--y': '20%', '--s': '180px', '--c': 'rgba(141,73,253,0.18)', '--d': '8s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '70%', '--y': '30%', '--s': '220px', '--c': 'rgba(86,145,243,0.15)', '--d': '11s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '40%', '--y': '65%', '--s': '160px', '--c': 'rgba(6,214,160,0.12)', '--d': '9s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '80%', '--y': '75%', '--s': '140px', '--c': 'rgba(236,72,153,0.1)', '--d': '13s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '25%', '--y': '80%', '--s': '120px', '--c': 'rgba(86,145,243,0.12)', '--d': '7s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '55%', '--y': '15%', '--s': '100px', '--c': 'rgba(141,73,253,0.14)', '--d': '10s' }} />
                <div className={styles.bokehOrb} style={{ '--x': '90%', '--y': '50%', '--s': '90px', '--c': 'rgba(6,214,160,0.1)', '--d': '12s' }} />
                <div className={styles.bokehShimmer} />
                <div className={styles.bokehContent}>
                  <p className={styles.bokehTitle}>Creating your vision</p>
                  <div className={styles.bokehDots}>
                    <span /><span /><span />
                  </div>
                  <p className={styles.bokehHint}>this may take a moment</p>
                </div>
              </div>
            )}

            {error && !loading && (
              <div className={styles.errorState}>
                <div className={styles.errorIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <p className={styles.errorTitle}>Something went wrong</p>
                <p className={styles.errorText}>{error}</p>
                <div className={styles.errorActions}>
                  <button className={styles.retryBtn} onClick={handleRegenerate}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
                    </svg>
                    Try Again
                  </button>
                  <button className={styles.retryAltBtn} onClick={() => {
                    const alt = model === 'flux' ? 'gptimage' : 'flux';
                    setModel(alt);
                    generate({ prompt, model: alt, width, height, mode, duration, imageUrl });
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
                    </svg>
                    Try Different Model
                  </button>
                </div>
              </div>
            )}



            {resultSrc && !loading && previewTab === 'video' && (
              <div className={styles.imageWrap}>
                {videoSrc ? (
                  <video src={videoSrc} className={styles.generatedImage} controls autoPlay loop />
                ) : generatingVideo ? (
                  <div className={styles.videoLoading}>
                    <div className={styles.bokehSpinner}><div /><div /><div /></div>
                    <p>Generating video...</p>
                  </div>
                ) : null}
              </div>
            )}

            {resultSrc && !loading && previewTab === 'image' && (
              <div className={styles.imageWrap}>
                {mode === 'video' ? (
                  <video src={resultSrc} className={styles.generatedImage} controls autoPlay loop />
                ) : (
                  <>
                    <img ref={imgRef} src={resultSrc} alt={prompt} className={styles.generatedImage} onLoad={remixMode ? initCanvas : undefined} />
                    {remixMode && (
                      <>
                        <canvas
                          ref={canvasRef}
                          className={styles.remixCanvas}
                          onMouseDown={onBrushDown}
                          onMouseMove={onBrushMove}
                          onMouseUp={onBrushUp}
                          onMouseLeave={onBrushUp}
                          onTouchStart={onBrushDown}
                          onTouchMove={onBrushMove}
                          onTouchEnd={onBrushUp}
                        />
                        <button className={styles.exitEditBtn} onClick={cancelRemix} title="Exit edit mode">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}
                    {/* Edit button floating on preview */}
                    {!remixMode && (
                      <button className={styles.editFloatBtn} onClick={() => router.push(`/edit/${sessionId}`)} title="Edit with canvas">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Edit
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Remix bar */}
          {remixMode && (
            <div className={styles.remixBar}>
              <div className={styles.remixPromptRow}>
                <input
                  type="text"
                  className={styles.remixInput}
                  placeholder="Describe the changes..."
                  value={remixPrompt}
                  onChange={(e) => setRemixPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRemix(); }}
                />
                <button className={styles.remixSubmit} onClick={submitRemix} disabled={!remixPrompt.trim() || remixLoading}>
                  {remixLoading ? 'Editing...' : 'Apply'}
                </button>
                <button className={styles.remixCancel} onClick={cancelRemix}>Cancel</button>
              </div>
            </div>
          )}

          {/* Bottom prompt bar (hidden during remix) */}
          {!remixMode && (
            <div className={styles.bottomBar}>
              {newRefPreview && (
                <div className={styles.refPreviewWrap}>
                  <img src={newRefPreview} alt="Reference" className={styles.refPreviewImg} />
                  <button className={styles.refRemoveBtn} onClick={clearRefImage} title="Remove reference">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <div className={styles.promptBar}>
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleRefImage}
                  style={{ display: 'none' }}
                />
                <div className={styles.attachWrap}>
                  <button className={styles.attachBtn} onClick={() => refInputRef.current?.click()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </button>
                  <div className={styles.attachTooltip}>
                    Attach reference image
                    <span className={styles.tooltipHint}>or paste from clipboard</span>
                  </div>
                </div>
                <textarea
                  className={styles.promptInput}
                  placeholder="Type a prompt..."
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <div className={styles.promptActions}>
                  <div className={styles.inlineModel}>
                    <button className={styles.modelBtn} onClick={() => setModelOpen(!modelOpen)}>
                      <span className={styles.modelLabel}>Model</span>
                      <span className={styles.modelName}>{sel.label}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {modelOpen && (
                      <div className={styles.modelDropdown}>
                        {activeModels.map((m) => (
                          <button key={m.id} className={`${styles.modelOption} ${model === m.id ? styles.modelOptionActive : ''}`}
                            onClick={() => { setModel(m.id); setModelOpen(false); }}>{m.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className={styles.generateBtn} onClick={handleNewGeneration} disabled={!newPrompt.trim()}>
                    Generate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar / Property panel */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>

          {sidebarOpen && (
            <div className={styles.sidebarContent}>
              {/* Session */}
              <div className={styles.sessionBlock}>
                <div className={styles.sessionRow}>
                  <span className={`${styles.statusDot} ${loading ? styles.statusLoading : error ? styles.statusError : styles.statusDone}`} />
                  <span className={styles.sessionId}>{sessionId.slice(0, 8)}</span>
                </div>
                {resultSrc && (
                  <div className={styles.quickActions}>
                    <button className={styles.quickActionBtn} onClick={handleShareImage} title="Share">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </button>
                    <button className={styles.quickActionBtn} onClick={handleCopyImage} title="Copy image">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    </button>
                    <button className={styles.quickActionBtn} onClick={handleDownload} title="Download">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button className={`${styles.quickActionBtn} ${styles.quickActionDanger}`} onClick={handleDeleteImage} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Prompt */}
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionLabel}>Prompt</h3>
                  <button className={styles.iconBtn} onClick={handleCopyPrompt} title="Copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
                <p className={styles.promptText}>{prompt}</p>
              </div>

              {/* Properties */}
              <div className={styles.section}>
                <h3 className={styles.sectionLabel}>Properties</h3>
                <div className={styles.propGrid}>
                  <div className={styles.propItem}>
                    <span className={styles.propKey}>Model</span>
                    <span className={styles.propVal}>{sel?.label}</span>
                  </div>
                  <div className={styles.propItem}>
                    <span className={styles.propKey}>Resolution</span>
                    <span className={styles.propVal}>{width}x{height}</span>
                  </div>
                  <div className={styles.propItem}>
                    <span className={styles.propKey}>Seed</span>
                    <span className={styles.propVal}>{seed}</span>
                  </div>
                  {duration && (
                    <div className={styles.propItem}>
                      <span className={styles.propKey}>Duration</span>
                      <span className={styles.propVal}>{duration}s</span>
                    </div>
                  )}
                  {generationTime && (
                    <div className={styles.propItem}>
                      <span className={styles.propKey}>Gen Time</span>
                      <span className={styles.propVal}>{(generationTime / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  <div className={styles.propItem}>
                    <span className={styles.propKey}>Mode</span>
                    <span className={styles.propVal}>{mode === 'video' ? 'Video' : 'Image'}</span>
                  </div>
                  {genStyle && (
                    <div className={styles.propItem}>
                      <span className={styles.propKey}>Style</span>
                      <span className={styles.propVal}>{genStyle.charAt(0).toUpperCase() + genStyle.slice(1)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Brush size — visible in remix mode */}
              {remixMode && (
                <div className={styles.section}>
                  <h3 className={styles.sectionLabel}>Brush</h3>
                  <div className={styles.brushControl}>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className={styles.brushSlider}
                    />
                    <span className={styles.brushVal}>{brushSize}px</span>
                  </div>
                </div>
              )}

              {/* Actions — icon bar */}
              <div className={styles.actionBar}>
                <button className={styles.actionIcon} onClick={handleDownload} disabled={!resultSrc} title="Download image">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button className={styles.actionIcon} onClick={handleCopyImage} disabled={!resultSrc} title="Copy image">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
                <button className={styles.actionIcon} onClick={handleCopySeed} disabled={!seed} title="Copy seed">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </button>
                <div className={styles.actionBarDivider} />
                <button className={styles.actionIcon} onClick={() => { if (resultSrc) router.push(`/edit/${sessionId}`); }} disabled={!resultSrc || mode === 'video'} title="Edit with canvas">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button className={styles.actionIcon} onClick={handleCreateVideo} disabled={!resultSrc || mode === 'video' || generatingVideo} title="Create video from this image">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
                <div className={styles.actionBarDivider} />
                <button className={styles.actionIcon} onClick={() => {/* TODO */}} disabled={!resultSrc} title="Use as reference">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {videoMaintenance && (
        <div className={styles.maintenanceOverlay} onClick={() => setVideoMaintenance(false)}>
          <div className={styles.maintenanceModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.maintenanceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h2 className={styles.maintenanceTitle}>Under Maintenance</h2>
            <p className={styles.maintenanceDesc}>Video generation is currently undergoing maintenance and will be back soon.</p>
            <button className={styles.maintenanceBtn} onClick={() => setVideoMaintenance(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
