'use client';

import { useState, useRef, useEffect } from 'react';
import Navbar from '../components/Navbar/Navbar';
import { BLUEPRINTS, CATEGORIES, STYLE_PRESETS } from '../lib/blueprints';
import { isSignedIn, getSignInUrl, checkAndIncrement } from '../lib/auth';
import { saveToLibrary } from '../lib/library';
import styles from './Blueprints.module.css';

export default function BlueprintsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(0);
  const [refImage, setRefImage] = useState(null);
  const [refPreview, setRefPreview] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generations, setGenerations] = useState([]);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const signedIn = isSignedIn();

  const filtered = BLUEPRINTS.filter((bp) => {
    const matchCat = category === 'All' || bp.category === category;
    const matchSearch = !search || bp.title.toLowerCase().includes(search.toLowerCase()) || bp.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openBlueprint = (bp) => {
    if (!signedIn) {
      window.location.href = getSignInUrl();
      return;
    }
    setSelected(bp);
    setStep(0);
    setRefImage(null);
    setRefPreview(null);
    setSelectedStyle(null);
    setPrompt('');
    setGenerations([]);
    setError('');
  };

  const closeModal = () => {
    setSelected(null);
    setStep(0);
  };

  const handleRefUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setRefPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setRefImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setRefPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const canProceed = () => {
    if (!selected) return false;
    const currentStep = selected.steps[step];
    if (!currentStep) return true;
    if (currentStep.type === 'image' && currentStep.required && !refPreview) return false;
    if (currentStep.type === 'text' && currentStep.required && !prompt.trim()) return false;
    if (currentStep.type === 'style-picker' && currentStep.required && !selectedStyle) return false;
    return true;
  };

  const handleGenerate = async () => {
    if (!selected || !prompt.trim()) return;
    setGenerating(true);
    setError('');

    try {
      const check = await checkAndIncrement('images');
      if (!check.allowed) throw new Error(check.error || 'Daily limit reached.');

      let imageUrl = null;
      if (refImage) {
        try {
          const formData = new FormData();
          formData.append('file', refImage);
          const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
          const upData = await upRes.json();
          if (upData.url) imageUrl = upData.url;
        } catch {}
      }

      const fullPrompt = selected.systemPrompt
        ? `${selected.systemPrompt}. ${selectedStyle ? `Style: ${selectedStyle}.` : ''} ${prompt.trim()}`
        : `${selectedStyle ? `${selectedStyle} style. ` : ''}${prompt.trim()}`;

      const isVideo = selected.type === 'video';
      const endpoint = isVideo ? '/api/generate/video' : '/api/generate/image';
      const body = {
        prompt: fullPrompt,
        model: selected.defaultModel,
        width: 1024,
        height: isVideo ? 576 : 1024,
        ...(isVideo ? { duration: 5 } : { seed: Math.floor(Math.random() * 2147483647) }),
        ...(imageUrl ? { imageUrl } : {}),
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      const result = {
        id: crypto.randomUUID(),
        imageData: data.imageData || data.videoData || data.imageUrl,
        prompt: prompt.trim(),
        model: selected.defaultModel,
        style: selectedStyle,
        seed: data.seed,
        timestamp: Date.now(),
        version: generations.length + 1,
      };

      setGenerations((prev) => [result, ...prev]);
      setStep(selected.steps.length); // go to generations view

      // Save to library
      saveToLibrary({
        sessionId: result.id,
        prompt: prompt.trim(),
        model: selected.defaultModel,
        width: 1024,
        height: isVideo ? 576 : 1024,
        mode: selected.type,
        seed: data.seed,
        blueprintId: selected.id,
        blueprintSessionId: selected.id + '-' + Date.now(),
        version: result.version,
        thumbnail: result.imageData?.slice(0, 500) ? result.imageData : null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const renderStep = () => {
    if (!selected) return null;

    // Generations view (after all steps)
    if (step >= selected.steps.length) {
      return (
        <div className={styles.genView}>
          {generating && (
            <div className={styles.genLoading}>
              <div className={styles.genSpinner} />
              <p className={styles.genLoadingText}>Generating...</p>
            </div>
          )}
          {error && <p className={styles.genError}>{error}</p>}
          {generations.length > 0 && (
            <div className={styles.genResult}>
              <div className={styles.genPreview}>
                {selected.type === 'video' ? (
                  <video src={generations[0].imageData} controls autoPlay loop className={styles.genImage} />
                ) : (
                  <img src={generations[0].imageData} alt="Generated" className={styles.genImage} />
                )}
              </div>
              <div className={styles.genActions}>
                <button className={styles.genActionBtn} onClick={handleRegenerate} disabled={generating}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
                  </svg>
                  Regenerate
                </button>
                <button className={styles.genActionBtn} onClick={() => setStep(selected.steps.length - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Tweak Prompt
                </button>
                <a className={styles.genActionBtn} href={generations[0].imageData} download={`blueprint-${selected.id}.png`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </a>
              </div>
            </div>
          )}
          {generations.length > 1 && (
            <div className={styles.genTimeline}>
              <h4 className={styles.timelineTitle}>Version History</h4>
              <div className={styles.timelineList}>
                {generations.map((gen, i) => (
                  <div key={gen.id} className={`${styles.timelineItem} ${i === 0 ? styles.timelineActive : ''}`}>
                    <img src={gen.imageData} alt={`v${gen.version}`} className={styles.timelineThumb} loading="lazy" decoding="async" />
                    <div className={styles.timelineInfo}>
                      <span className={styles.timelineVersion}>v{gen.version}</span>
                      <span className={styles.timelinePrompt}>{gen.prompt}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    const currentStep = selected.steps[step];

    if (currentStep.type === 'image') {
      return (
        <div className={styles.stepImage}>
          <p className={styles.stepLabel}>{currentStep.hint}</p>
          <div
            className={styles.dropZone}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" onChange={handleRefUpload} style={{ display: 'none' }} />
            {refPreview ? (
              <img src={refPreview} alt="Reference" className={styles.dropPreview} />
            ) : (
              <div className={styles.dropPlaceholder}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
                <p>PNG or JPG up to 5MB</p>
                <p>Drop files here or <span className={styles.dropLink}>Choose an Image</span></p>
              </div>
            )}
          </div>
          <p className={styles.stepOr}>Or Select from Template Styles</p>
          <div className={styles.styleRow}>
            {STYLE_PRESETS.slice(0, 8).map((s) => (
              <button key={s.id} className={styles.styleThumb} onClick={() => {
                setRefPreview(s.image);
                setRefImage(null); // URL-based, no file
              }}>
                <img src={s.image} alt={s.label} loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (currentStep.type === 'style-picker') {
      return (
        <div className={styles.stepStyle}>
          <p className={styles.stepLabel}>Choose a style for your generation</p>
          <div className={styles.styleGrid}>
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                className={`${styles.styleCard} ${selectedStyle === s.id ? styles.styleCardActive : ''}`}
                onClick={() => setSelectedStyle(s.id)}
              >
                <img src={s.image} alt={s.label} className={styles.styleCardImg} loading="lazy" decoding="async" />
                <span className={styles.styleCardLabel}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (currentStep.type === 'text') {
      return (
        <div className={styles.stepText}>
          <p className={styles.stepLabel}>{currentStep.hint}</p>
          <textarea
            className={styles.promptArea}
            placeholder="Describe what you want to create..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>

        <div className={styles.content}>
          <div className={styles.header}>
            <h1 className={styles.title}>
              <span className={styles.brushAccent}>Blueprints</span>
            </h1>
            <p className={styles.subtitle}>Ready Made AI Templates</p>

            <div className={styles.searchBar}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className={styles.searchInput}
                placeholder="Search Blueprints"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.categories}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.catBtn} ${category === cat ? styles.catActive : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.grid}>
            {filtered.map((bp) => (
              <button
                key={bp.id}
                className={styles.card}
                onClick={() => openBlueprint(bp)}
              >
                <img src={bp.cover} alt={bp.title} className={styles.cardImg} loading="lazy" decoding="async" />
                {bp.thumbnailPrompt && (
                  <span className={styles.cardPromptEffect}>{bp.thumbnailPrompt}</span>
                )}
                <div className={styles.cardOverlay}>
                  <span className={styles.cardBadge}>{bp.type === 'video' ? 'Video' : 'Image'}</span>
                  <h3 className={styles.cardTitle}>{bp.title}</h3>
                  <p className={styles.cardDesc}>{bp.description}</p>
                </div>
              </button>
            ))}
          </div>

        </div>
      </main>

      {/* Blueprint Modal */}
      {selected && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={closeModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className={styles.modalHeader}>
              <div className={styles.modalCover}>
                <img src={selected.cover} alt={selected.title} loading="lazy" decoding="async" />
                <div className={styles.modalCoverOverlay}>
                  <span className={styles.modalBadge}>Blueprints</span>
                  <h2 className={styles.modalTitle}>{selected.title}</h2>
                  <p className={styles.modalDesc}>{selected.description}</p>
                </div>
              </div>
            </div>

            <div className={styles.stepIndicator}>
              {selected.steps.map((s, i) => (
                <button
                  key={s.id}
                  className={`${styles.stepDot} ${step === i ? styles.stepDotActive : ''} ${step > i ? styles.stepDotDone : ''}`}
                  onClick={() => step > i && setStep(i)}
                >
                  <span className={styles.stepNum}>{i + 1}</span>
                  <span className={styles.stepName}>{s.label}</span>
                </button>
              ))}
              <button
                className={`${styles.stepDot} ${step >= selected.steps.length ? styles.stepDotActive : ''}`}
                disabled
              >
                <span className={styles.stepNum}>{selected.steps.length + 1}</span>
                <span className={styles.stepName}>Results</span>
              </button>
            </div>

            <div className={styles.modalBody}>
              {renderStep()}
            </div>

            <div className={styles.modalFooter}>
              {step > 0 && step < selected.steps.length && (
                <button className={styles.modalBtnSecondary} onClick={() => setStep(step - 1)}>Back</button>
              )}
              {step < selected.steps.length - 1 && (
                <button className={styles.modalBtnPrimary} onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                  Next
                </button>
              )}
              {step === selected.steps.length - 1 && (
                <button className={styles.modalBtnPrimary} onClick={handleGenerate} disabled={!canProceed() || generating}>
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
