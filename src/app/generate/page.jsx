'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar/Navbar';
import { isSignedIn, getGuestSessionId, getSignInUrl, spendCredits, fetchCredits } from '../lib/auth';
import { getImageCost, getVideoCost } from '../lib/credits';
import { useModels } from '../lib/useModels';
import styles from './Generate.module.css';

const ASPECTS = [
  { id: '1:1', w: 1024, h: 1024, label: '1:1' },
  { id: '16:9', w: 1024, h: 576, label: '16:9' },
  { id: '9:16', w: 576, h: 1024, label: '9:16' },
  { id: '4:3', w: 1024, h: 768, label: '4:3' },
  { id: '3:4', w: 768, h: 1024, label: '3:4' },
];

const VIDEO_ASPECTS = [
  { id: '1:1', w: 1024, h: 1024, label: '1:1' },
  { id: '16:9', w: 1024, h: 576, label: '16:9' },
  { id: '9:16', w: 576, h: 1024, label: '9:16' },
];

const DURATIONS = [
  { id: '4', label: '4s' },
  { id: '6', label: '6s' },
  { id: '10', label: '10s' },
];


const STYLES = [
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'creative', label: 'Creative' },
  { id: 'vibrant', label: 'Vibrant' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'anime', label: 'Anime' },
];

const RANDOM_SUBJECTS = [
  'a celestial dragon coiled around a dying star',
  'an ancient library floating in the clouds at sunset',
  'a cyberpunk samurai standing in neon rain',
  'a crystal palace growing from a frozen waterfall',
  'a bioluminescent deep-sea city with jellyfish lanterns',
  'a time traveler stepping through a shattered mirror',
  'a forest of giant mushrooms under aurora borealis',
  'an ethereal phoenix rising from volcanic glass',
  'a steampunk airship docked at a sky island',
  'a witch brewing potions in a cozy treehouse',
  'a massive titan sleeping beneath a mountain range',
  'an underwater temple guarded by spectral whales',
  'a lone astronaut discovering alien flowers on Mars',
  'a floating marketplace above a city of canals',
  'a knight made of starlight fighting shadow creatures',
];

const API_BASE = '/api';

export default function GeneratePage() {
  const router = useRouter();
  const { imageModels: MODELS, videoModels: VIDEO_MODELS } = useModels();
  const [mode, setMode] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('flux');
  const [aspect, setAspect] = useState('16:9');
  const [style, setStyle] = useState('dynamic');
  const [generating, setGenerating] = useState(false);
  const [duration, setDuration] = useState('6');
  const [videoModel, setVideoModel] = useState('grok-video');
  const [modelOpen, setModelOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [starMenuOpen, setStarMenuOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedPreviews, setUploadedPreviews] = useState([]);
  const [aiWorking, setAiWorking] = useState(false);
  const [limitWarning, setLimitWarning] = useState('');
  const [describeArtifact, setDescribeArtifact] = useState(null);
  const [artifactModal, setArtifactModal] = useState(false);
  const [videoMaintenance, setVideoMaintenance] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const describeInputRef = useRef(null);
  const optionsBarRef = useRef(null);
  const pendingDescribe = useRef(false);

  const signedIn = isSignedIn();
  const [credits, setCredits] = useState(null);

  const currentCost = mode === 'video' ? getVideoCost(videoModel) : getImageCost(model);

  useEffect(() => {
    fetchCredits().then((data) => { if (data) setCredits(data); });
  }, []);

  const selectedModel = MODELS.find((m) => m.id === model);
  const selectedVideoModel = VIDEO_MODELS.find((m) => m.id === videoModel);
  const selectedAspect = (mode === 'video' ? VIDEO_ASPECTS : ASPECTS).find((a) => a.id === aspect) || ASPECTS[1];
  const selectedStyle = STYLES.find((s) => s.id === style);
  const selectedDuration = DURATIONS.find((d) => d.id === duration);

  const getRefImageLimit = () => {
    if (!signedIn) return 1;
    const tier = credits?.tier || 'free';
    if (tier === 'free') return 2;
    return 5;
  };

  // Close all dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (optionsBarRef.current && !optionsBarRef.current.contains(e.target)) {
        closeAllDropdowns();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Paste image from clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          if (uploadedImages.length >= getRefImageLimit()) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            setUploadedImages((prev) => [...prev, file]);
            setUploadedPreviews((prev) => [...prev, ev.target.result]);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [uploadedImages]);

  const closeAllDropdowns = () => {
    setModelOpen(false);
    setStyleOpen(false);
    setDurationOpen(false);
    setStarMenuOpen(false);
  };

  const handleRandomPrompt = async () => {
    if (aiWorking) return;
    setAiWorking(true);
    setStarMenuOpen(false);
    const subject = RANDOM_SUBJECTS[Math.floor(Math.random() * RANDOM_SUBJECTS.length)];
    try {
      const res = await fetch(`${API_BASE}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: subject }),
      });
      const data = await res.json();
      setPrompt(data.enhanced || subject);
    } catch {
      setPrompt(subject);
    } finally {
      setAiWorking(false);
      autoResize();
    }
  };

  const handleImprovePrompt = async () => {
    if (aiWorking || !prompt.trim()) return;
    setAiWorking(true);
    setStarMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (data.enhanced) setPrompt(data.enhanced);
    } catch {
      /* silent */
    } finally {
      setAiWorking(false);
      autoResize();
    }
  };

  const handleDescribeImage = () => {
    setStarMenuOpen(false);
    pendingDescribe.current = true;
    describeInputRef.current?.click();
  };

  const handleDescribeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (describeInputRef.current) describeInputRef.current.value = '';

    // Save preview for the artifact
    const reader = new FileReader();
    reader.onload = (ev) => setDescribeArtifact(ev.target.result);
    reader.readAsDataURL(file);

    setAiWorking(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/describe`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.description) {
        setPrompt(data.description);
        autoResize();
      }
    } catch {
      /* silent */
    } finally {
      setAiWorking(false);
      pendingDescribe.current = false;
    }
  };

  const handleReplaceArtifact = () => {
    setArtifactModal(false);
    pendingDescribe.current = true;
    describeInputRef.current?.click();
  };

  const handleRemoveArtifact = () => {
    setDescribeArtifact(null);
    setArtifactModal(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedImages.length >= getRefImageLimit()) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImages((prev) => [...prev, file]);
      setUploadedPreviews((prev) => [...prev, ev.target.result]);
    };
    reader.readAsDataURL(file);
  };

  const clearUploadedImage = (index) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    setUploadedPreviews((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const autoResize = () => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 250) + 'px';
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    const genType = mode === 'video' ? 'video' : 'image';
    const genModel = mode === 'video' ? videoModel : model;
    const check = await spendCredits(genType, genModel);
    if (!check.allowed) {
      setLimitWarning(check.error || 'Not enough credits.');
      return;
    }

    setGenerating(true);
    setLimitWarning('');

    // Refresh credit balance after spending
    fetchCredits().then((data) => { if (data) setCredits(data); });

    const sessionId = signedIn ? crypto.randomUUID() : getGuestSessionId();
    const { w, h } = selectedAspect;

    let imageUrls = [];
    for (const img of uploadedImages) {
      try {
        const formData = new FormData();
        formData.append('file', img);
        const uploadRes = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) imageUrls.push(uploadData.url);
      } catch { /* continue */ }
    }

    sessionStorage.setItem(
      `gen_${sessionId}`,
      JSON.stringify({
        prompt: prompt.trim(),
        model: mode === 'video' ? videoModel : model,
        width: w,
        height: h,
        style,
        mode,
        duration: mode === 'video' ? duration : null,
        imageUrl: imageUrls[0] || null,
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
        timestamp: Date.now(),
      })
    );

    router.push(`/generate/${sessionId}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        {/* Ambient background blobs */}
        <div className={styles.bgBlob1} aria-hidden="true" />
        <div className={styles.bgBlob2} aria-hidden="true" />
        <div className={styles.bgBlob3} aria-hidden="true" />
        <div className={styles.gridOverlay} aria-hidden="true" />

        <div className={styles.center}>
          <h1 className={styles.title}>
            What will you <span className={styles.accent}>create</span> today?
          </h1>
          <p className={styles.subtitle}>
            Describe your vision and let AI bring it to life
          </p>

          {/* Uploaded image previews */}
          {uploadedPreviews.length > 0 && (
            <div className={styles.uploadPreviewRow}>
              {uploadedPreviews.map((preview, i) => (
                <div key={i} className={styles.uploadPreview}>
                  <img src={preview} alt={`Reference ${i + 1}`} className={styles.uploadThumb} />
                  <button className={styles.uploadRemove} onClick={() => clearUploadedImage(i)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <span className={styles.uploadLabel}>
                {uploadedPreviews.length}/{getRefImageLimit()} {mode === 'video' ? 'start frames' : 'reference images'}
              </span>
            </div>
          )}

          {/* Artifact zone — above prompt bar */}
          {describeArtifact && (
            <div className={styles.artifactZone}>
              <div className={styles.artifactWrap}>
                <button className={styles.artifact} onClick={() => setArtifactModal(true)} title="Source image — click to manage">
                  <img src={describeArtifact} alt="Source" className={styles.artifactImg} />
                  <span className={styles.artifactBadge}>AI</span>
                </button>
                <button className={styles.artifactClose} onClick={(e) => { e.stopPropagation(); handleRemoveArtifact(); }} title="Remove">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <span className={styles.artifactLabel}>Described with AI</span>
            </div>
          )}

          {/* Prompt input bar */}
          <div className={styles.promptBar}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <input
              ref={describeInputRef}
              type="file"
              accept="image/*"
              onChange={handleDescribeUpload}
              style={{ display: 'none' }}
            />
            <div className={styles.tooltipWrap}>
              <button
                className={styles.promptIconBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
              <span className={styles.tooltip}>
                {mode === 'video' ? 'Upload start frame' : 'Upload reference image'}
              </span>
            </div>
            <textarea
              ref={inputRef}
              className={styles.promptInput}
              placeholder="Type a prompt or paste an image..."
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 250) + 'px';
              }}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            {aiWorking && <span className={styles.promptSpinner} />}
          </div>

          {/* Options bar */}
          <div className={styles.optionsBar} ref={optionsBarRef}>
            <div className={styles.optionsLeft}>
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${mode === 'image' ? styles.modeActive : ''}`}
                  onClick={() => { setMode('image'); closeAllDropdowns(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  Image
                </button>
                <button
                  className={styles.modeBtn}
                  onClick={() => { setVideoMaintenance(true); closeAllDropdowns(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Video
                </button>
              </div>
            </div>

            <div className={styles.optionsRight}>
              <div className={styles.aspectGroup}>
                {(mode === 'video' ? VIDEO_ASPECTS : ASPECTS).map((a) => (
                  <button
                    key={a.id}
                    className={`${styles.aspectBtn} ${aspect === a.id ? styles.aspectActive : ''}`}
                    onClick={() => setAspect(a.id)}
                    title={`${a.w}x${a.h}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {mode === 'video' ? (
                <>
                  <div className={styles.dropdownWrap}>
                    <button className={styles.optionBtn} onClick={() => { setDurationOpen(!durationOpen); setModelOpen(false); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      {selectedDuration.label}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {durationOpen && (
                      <div className={styles.dropdown}>
                        {DURATIONS.map((d) => (
                          <button key={d.id} className={`${styles.dropdownItem} ${duration === d.id ? styles.dropdownItemActive : ''}`}
                            onClick={() => { setDuration(d.id); setDurationOpen(false); }}>
                            {d.label}
                            {duration === d.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.dropdownWrap}>
                    <button className={styles.optionBtn} onClick={() => { setModelOpen(!modelOpen); setDurationOpen(false); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                      </svg>
                      {selectedVideoModel.label}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {modelOpen && (
                      <div className={styles.dropdown}>
                        {VIDEO_MODELS.map((m) => (
                          <button key={m.id} className={`${styles.dropdownItem} ${videoModel === m.id ? styles.dropdownItemActive : ''}`}
                            onClick={() => { setVideoModel(m.id); setModelOpen(false); }}>
                            <span>{m.label}</span><span className={styles.dropdownDesc}>{m.desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.dropdownWrap}>
                    <button className={styles.optionBtn} onClick={() => { setStyleOpen(!styleOpen); setModelOpen(false); setStarMenuOpen(false); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                      {selectedStyle.label}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {styleOpen && (
                      <div className={styles.dropdown}>
                        {STYLES.map((s) => (
                          <button key={s.id} className={`${styles.dropdownItem} ${style === s.id ? styles.dropdownItemActive : ''}`}
                            onClick={() => { setStyle(s.id); setStyleOpen(false); }}>
                            {s.label}
                            {style === s.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.dropdownWrap}>
                    <button className={styles.optionBtn} onClick={() => { setModelOpen(!modelOpen); setStyleOpen(false); setStarMenuOpen(false); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                      </svg>
                      {selectedModel.label}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {modelOpen && (
                      <div className={styles.dropdown}>
                        {MODELS.map((m) => (
                          <button key={m.id} className={`${styles.dropdownItem} ${model === m.id ? styles.dropdownItemActive : ''}`}
                            onClick={() => { setModel(m.id); setModelOpen(false); }}>
                            <span>{m.label}</span><span className={styles.dropdownDesc}>{m.desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Star menu */}
              <div className={styles.starMenuWrap}>
                <button
                  className={`${styles.enhanceBtn} ${aiWorking ? styles.enhanceSpin : ''}`}
                  onClick={() => { setStarMenuOpen(!starMenuOpen); setModelOpen(false); setStyleOpen(false); setDurationOpen(false); }}
                  disabled={aiWorking}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                  </svg>
                </button>

                {starMenuOpen && (
                  <div className={styles.starDropdown}>
                    <button className={styles.starItem} onClick={handleRandomPrompt}>
                      <div className={styles.starItemIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                        </svg>
                      </div>
                      <div className={styles.starItemText}>
                        <span className={styles.starItemTitle}>New Random Prompt</span>
                        <span className={styles.starItemDesc}>Generate a random prompt with AI.</span>
                      </div>
                    </button>
                    <button className={styles.starItem} onClick={handleImprovePrompt} disabled={!prompt.trim()}>
                      <div className={styles.starItemIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </div>
                      <div className={styles.starItemText}>
                        <span className={styles.starItemTitle}>Improve Prompt</span>
                        <span className={styles.starItemDesc}>Improve your current prompt.</span>
                      </div>
                    </button>
                    <button className={styles.starItem} onClick={handleDescribeImage}>
                      <div className={styles.starItemIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </div>
                      <div className={styles.starItemText}>
                        <span className={styles.starItemTitle}>Describe With AI</span>
                        <span className={styles.starItemDesc}>Upload an image and generate its description.</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Generate button */}
              <button
                className={styles.generateBtn}
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                title="Generate"
              >
                {generating ? (
                  <span className={styles.spinner} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Credit cost display */}
          <div className={styles.usageBar}>
            <span className={styles.usageLabel}>
              Cost: {currentCost} credit{currentCost !== 1 ? 's' : ''}
              {credits ? ` — ${credits.credits - (credits.creditsUsed || 0)} credits remaining` : ''}
            </span>
            {!signedIn && (
              <a href={getSignInUrl()} className={styles.usageLink}>Sign in for more credits</a>
            )}
          </div>

          {/* Limit warning */}
          {limitWarning && (
            <div className={styles.limitWarning}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {limitWarning}
            </div>
          )}
        </div>
      </main>

      {/* Artifact modal */}
      {artifactModal && describeArtifact && (
        <div className={styles.artifactOverlay} onClick={() => setArtifactModal(false)}>
          <div className={styles.artifactModal} onClick={(e) => e.stopPropagation()}>
            <img src={describeArtifact} alt="Source image" className={styles.artifactModalImg} />
            <div className={styles.artifactModalInfo}>
              <p className={styles.artifactModalTitle}>Source Image</p>
              <p className={styles.artifactModalHint}>This image was used to generate the prompt description</p>
            </div>
            <div className={styles.artifactModalActions}>
              <button className={styles.artifactModalBtn} onClick={handleReplaceArtifact}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
                </svg>
                Replace
              </button>
              <button className={`${styles.artifactModalBtn} ${styles.artifactModalBtnDanger}`} onClick={handleRemoveArtifact}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Remove
              </button>
              <button className={styles.artifactModalBtn} onClick={() => setArtifactModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {videoMaintenance && (
        <div className={styles.maintenanceOverlay} onClick={() => setVideoMaintenance(false)}>
          <div className={styles.maintenanceModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.maintenanceIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="1.5">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h2 className={styles.maintenanceTitle}>Under Maintenance</h2>
            <p className={styles.maintenanceDesc}>
              Video generation is currently undergoing maintenance and will be back soon. Thank you for your patience.
            </p>
            <button className={styles.maintenanceBtn} onClick={() => setVideoMaintenance(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
