'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { IMAGE_ACCEPT_ATTR } from '../../../utils/allowedImageTypes';
import { createMediaUploadId, enqueueMediaUpload, resumeMediaUpload } from '../../../utils/mediaUploadQueue';

const IMAGE_MODELS = ['gptimage', 'flux', 'klein'];

export const BlogImageUploadContext = createContext({ blogId: null });

export const BlogImageBlock = createReactBlockSpec(
  {
    type: 'image',
    propSchema: {
      url: { default: '' },
      caption: { default: '' },
      previewWidth: { default: 740 },
      name: { default: '' },
      showPreview: { default: true },
      _imageId: { default: '' },
      _mediaId: { default: '' },
      _uploading: { default: '' },
      _uploadJobId: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => <BlogImageRenderer {...props} />,
  }
);

function BlogImageRenderer({ block, editor }) {
  const { blogId, mediaStorageStatus } = useContext(BlogImageUploadContext);
  const { url, caption, _imageId, _uploading, _uploadJobId } = block.props;
  const [mode, setMode] = useState('idle'); // idle | embed | generate | generating
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedError, setEmbedError] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModel, setAiModel] = useState('flux');
  const [aiSeed, setAiSeed] = useState('');
  const [aiReference, setAiReference] = useState(null);
  const [pollinations, setPollinations] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImgLoaded, setIsImgLoaded] = useState(false);

  useEffect(() => {
    if (url) {
      const img = new Image();
      img.src = url;
      if (img.complete) {
        setIsImgLoaded(true);
      } else {
        setIsImgLoaded(false);
      }
    } else {
      setIsImgLoaded(false);
    }
  }, [url]);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(caption || '');
  const blockRef = useRef(null);
  const embedInputRef = useRef(null);
  const aiInputRef = useRef(null);
  const aiReferenceRef = useRef(null);

  useEffect(() => {
    if (mode !== 'generate' || pollinations) return;
    fetch('/api/integrations/pollinations', { cache: 'no-store' })
      .then((response) => response.json())
      .then(setPollinations)
      .catch(() => setPollinations({ connected: false, status: 'unavailable' }));
  }, [mode, pollinations]);

  useEffect(() => {
    if (_uploading !== 'uploading' || !_uploadJobId) return;
    let cancelled = false;
    resumeMediaUpload(_uploadJobId).then((data) => {
      if (!cancelled) editor.updateBlock(block.id, { props: { url: data.url, _mediaId: data.id || '', _uploading: '', _uploadJobId: '' } });
    }).catch(() => {
      if (!cancelled) editor.updateBlock(block.id, { props: { _uploading: 'error' } });
    });
    return () => { cancelled = true; };
  }, [_uploading, _uploadJobId, block.id, editor]);

  useEffect(() => {
    if (mode === 'embed') setTimeout(() => embedInputRef.current?.focus(), 50);
    if (mode === 'generate') setTimeout(() => aiInputRef.current?.focus(), 50);
  }, [mode]);

  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    function handleKey(e) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && mode === 'idle' && !url) {
        e.preventDefault();
        try { editor.removeBlocks([block.id]); } catch {}
      }
    }
    el.addEventListener('keydown', handleKey);
    return () => el.removeEventListener('keydown', handleKey);
  }, [editor, block.id, mode, url]);

  const uploadFile = useCallback(async (file) => {
    if (!file) return;
    const { isAllowedImage } = await import('../../../utils/allowedImageTypes');
    if (!isAllowedImage(file)) {
      showFailToast('Unsupported file type. Allowed: AVIF, JPEG, PNG, BMP, SVG, WebP.');
      return;
    }
    const uploadJobId = createMediaUploadId();
    editor.updateBlock(block.id, { props: { _uploading: 'uploading', _uploadJobId: uploadJobId } });

    try {
      const doc = editor.document;
      const idx = doc.findIndex((b) => b.id === block.id);
      if (idx !== -1) {
        let nextBlock = doc[idx + 1];
        if (!nextBlock || nextBlock.type !== 'paragraph') {
          editor.insertBlocks([{ type: 'paragraph', content: [] }], block.id, 'after');
          const updatedDoc = editor.document;
          nextBlock = updatedDoc[idx + 1];
        }
        if (nextBlock) {
          requestAnimationFrame(() => {
            try {
              editor.setTextCursorPosition(nextBlock.id, 'start');
              editor._tiptapEditor?.commands?.focus();
            } catch {}
          });
        }
      }
    } catch {}
    try {
      const { compressBlogImage } = await import('../../../utils/compressImage');
      const { blob } = await compressBlogImage(file);
      const data = await enqueueMediaUpload(blob, {
        id: uploadJobId,
        filename: `img_${uploadJobId}.webp`,
        type: 'image',
        blogId,
      });
      editor.updateBlock(block.id, { props: { url: data.url, _mediaId: data.id || '', _uploading: '', _uploadJobId: '' } });
    } catch (err) {
      console.error('Upload failed:', err);
      editor.updateBlock(block.id, { props: { _uploading: 'error' } });
      if (file.size > 0) showFailToast('Image upload failed');
    }
  }, [editor, block.id, blogId]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        uploadFile(item.getAsFile());
        return;
      }
    }
  }, [uploadFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) uploadFile(file);
  }, [uploadFile]);

  const handleEmbed = useCallback(() => {
    const trimmed = embedUrl.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('https://')) {
      setEmbedError('URL must start with https://');
      return;
    }
    editor.updateBlock(block.id, { props: { url: trimmed } });
    setMode('idle');
    setEmbedUrl('');
    setEmbedError('');
  }, [embedUrl, editor, block.id]);

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setMode('generating');
    try {
      const generation = { prompt: aiPrompt.trim(), model: aiModel, generationId: crypto.randomUUID(), destination: 'inline', width: 1280, height: 720, seed: aiSeed || undefined };
      let body;
      let headers;
      if (aiReference) {
        body = new FormData();
        Object.entries(generation).forEach(([key, value]) => value !== undefined && body.append(key, String(value)));
        body.append('referenceImage', aiReference);
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify(generation);
      }
      const res = await fetch('/api/ai/image', { method: 'POST', headers, body });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate image');
      }
      
      const blob = await res.blob();
      const file = new File([blob], `ai_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
      
      setMode('idle');
      setAiPrompt('');
      setAiReference(null);
      uploadFile(file);
    } catch (err) {
      console.error('AI image generation failed:', err);
      showFailToast(err.message || 'Image generation failed');
      setMode('idle');
    }
  }, [aiPrompt, aiModel, aiSeed, aiReference, uploadFile]);

  const showFailToast = useCallback((msg) => {
    const toast = document.createElement('div');
    toast.className = 'blog-img-fail-toast';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><circle cx="8" cy="8" r="7" stroke="#f87171" stroke-width="1.5"/><path d="M8 4.5v4" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r=".75" fill="#f87171"/></svg>`;
    const label = document.createElement('span');
    label.textContent = msg;
    toast.append(icon, label);
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('blog-img-fail-toast--out'); }, 3200);
    setTimeout(() => { toast.remove(); }, 3600);
  }, []);

  const handleDelete = useCallback(() => {
    const mediaId = block.props._mediaId;
    if (mediaId) {
      fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      }).catch(() => {});
    }
    try { editor.removeBlocks([block.id]); } catch {}
  }, [editor, block.id, block.props._mediaId]);

  const handleRetry = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files?.[0]) {
        editor.updateBlock(block.id, { props: { _uploading: 'uploading' } });
        uploadFile(input.files[0]);
      }
    };
    input.click();
  }, [editor, block.id, uploadFile]);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT_ATTR;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        uploadFile(file);
      }
    };
    input.click();
  }, [uploadFile]);

  const handleReplace = useCallback(() => {
    const mediaId = block.props._mediaId;
    if (mediaId) {
      fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      }).catch(() => {});
    }
    editor.updateBlock(block.id, { props: { url: '', _mediaId: '' } });
    setMode('idle');
  }, [editor, block.id, block.props._mediaId]);

  const handleCaptionSave = useCallback(() => {
    editor.updateBlock(block.id, { props: { caption: captionText } });
    setEditingCaption(false);
  }, [editor, block.id, captionText]);

  const isAiPlaceholder = !!_imageId && !url;
  const showSkeleton = _uploading === 'uploading' || (url && !isImgLoaded);

  if (!url || showSkeleton) {
    if (showSkeleton) {
      return (
        <div ref={blockRef} className="blog-img-upload-skeleton" tabIndex={-1}>
          <div className="blog-img-skel-image">
            <div className="blog-img-skel-shimmer" />
            <div className="blog-img-skel-icon">
              <span className="blog-img-upload-orbit">
                <ion-icon name="cloud-upload-outline" />
              </span>
              {_uploading === 'uploading' && (
                <>
                  <span className="mt-2 text-xs font-semibold">Uploading image</span>
                  <small className="blog-img-upload-destination">
                    {mediaStorageStatus?.useForUploads && mediaStorageStatus?.cloudName
                      ? `to ${mediaStorageStatus.cloudName}`
                      : 'to LixBlogs storage'}
                  </small>
                  <span className="blog-img-upload-track"><span /></span>
                </>
              )}
            </div>
          </div>
          <div className="blog-img-skel-caption">
            <div className="blog-img-skel-caption-line" />
            <div className="blog-img-skel-caption-line blog-img-skel-caption-short" />
          </div>
          {url && (
            <img
              src={url}
              onLoad={() => setIsImgLoaded(true)}
              onError={() => setIsImgLoaded(true)}
              decoding="async"
              style={{ display: 'none' }}
            />
          )}
        </div>
      );
    }

    if (_uploading === 'error') {
      return (
        <div ref={blockRef} className="blog-img-upload-error" tabIndex={0}>
          <div className="blog-img-upload-error-inner">
            <svg className="blog-img-upload-error-x" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span className="blog-img-upload-error-text">Failed to upload</span>
            <div className="blog-img-upload-error-actions">
              <button className="blog-img-upload-error-retry" onClick={handleRetry}>Retry</button>
              <button className="blog-img-upload-error-remove" onClick={handleDelete}>Remove</button>
            </div>
          </div>
        </div>
      );
    }

    if (isAiPlaceholder || mode === 'generating') {
      return (
        <div ref={blockRef} className="blog-img-empty blog-img-empty--generating" tabIndex={-1} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div className="blog-img-generating">
            <div className="blog-img-gen-shimmer" />
            <div className="blog-img-gen-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
              </svg>
              Generating image...
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={blockRef}
        className="blog-img-empty"
        tabIndex={0}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        data-drag-over={isDragOver}
      >
        {mode === 'idle' && (
          <button className="blog-img-dismiss" onClick={handleDelete} title="Remove image block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {mode === 'idle' && (
          <>
            <div className="blog-img-actions-row">
              <button className="blog-img-action" onClick={handleUploadClick}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload
              </button>
              <button className="blog-img-action" onClick={() => setMode('embed')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                Embed URL
              </button>
              <button className="blog-img-action blog-img-action-ai" onClick={() => setMode('generate')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
                </svg>
                AI Generate
              </button>
            </div>
            <p className="blog-img-hint">or drag & drop / paste an image</p>
          </>
        )}

        {mode === 'embed' && (
          <div className="blog-img-input-row">
            <input
              ref={embedInputRef}
              type="url"
              value={embedUrl}
              onChange={(e) => { setEmbedUrl(e.target.value); setEmbedError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEmbed();
                if (e.key === 'Escape') { setMode('idle'); setEmbedUrl(''); setEmbedError(''); }
              }}
              placeholder="https://example.com/image.jpg"
              className="blog-img-url-input"
            />
            <button className="blog-img-submit-btn" onClick={handleEmbed} disabled={!embedUrl.trim()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button className="blog-img-cancel-btn" onClick={() => { setMode('idle'); setEmbedUrl(''); setEmbedError(''); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {embedError && <span className="blog-img-error">{embedError}</span>}
          </div>
        )}

        {mode === 'generate' && (
          <div className="w-full space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
            {pollinations?.connected ? (
              <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[var(--text-muted)]"><span className="font-semibold text-emerald-500">Pollinations connected</span><span>{pollinations.balance ?? '—'} Pollen</span></div>
            ) : pollinations && (
              <div className="flex justify-between gap-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600"><span>Connect Pollinations to generate images.</span><a href="/settings?tab=integrations" className="font-semibold underline">Connect</a></div>
            )}
            <textarea
              ref={aiInputRef}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && aiPrompt.trim()) handleGenerate();
                if (e.key === 'Escape') { setMode('idle'); setAiPrompt(''); }
              }}
              rows={3}
              placeholder="Describe the subject, composition, lighting, and style…"
              className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)]">{IMAGE_MODELS.map((model) => <option key={model}>{model}</option>)}</select>
              <input type="number" min="0" max="2147483647" value={aiSeed} onChange={(e) => setAiSeed(e.target.value)} placeholder="Seed (optional)" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)]" />
              <button type="button" onClick={() => aiReferenceRef.current?.click()} className="truncate rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-left text-xs text-[var(--text-primary)]">{aiReference?.name || 'Reference image'}</button>
              <input ref={aiReferenceRef} type="file" accept={IMAGE_ACCEPT_ATTR} className="hidden" onChange={(e) => setAiReference(e.target.files?.[0] || null)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-[var(--text-faint)]">One billable request · no automatic retries</span>
              <div className="flex gap-2">
                <button className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-muted)]" onClick={() => { setMode('idle'); setAiPrompt(''); setAiReference(null); }}>Cancel</button>
                <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={handleGenerate} disabled={!aiPrompt.trim() || !pollinations?.connected}>Generate</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={blockRef} className="blog-img-loaded blog-img-fadein" tabIndex={0} onPaste={handlePaste}>
      <div className="blog-img-wrapper">
        <img
          src={url}
          alt={caption || 'Blog image'}
          className="blog-img-main"
          draggable={false}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
        <div className="blog-img-hover-overlay">
          <div className="blog-img-hover-actions">
            <button className="blog-img-hover-btn" onClick={handleReplace}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
            <button className="blog-img-hover-btn" onClick={() => setEditingCaption(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className="blog-img-hover-btn blog-img-hover-delete" onClick={handleDelete}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      {editingCaption ? (
        <input
          type="text"
          value={captionText}
          onChange={(e) => setCaptionText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCaptionSave(); if (e.key === 'Escape') { setEditingCaption(false); setCaptionText(caption || ''); } }}
          onBlur={handleCaptionSave}
          placeholder="Add a caption..."
          className="blog-img-caption-input"
          autoFocus
        />
      ) : (
        <p
          className={`blog-img-caption ${caption ? '' : 'blog-img-caption--empty'}`}
          onClick={() => { setCaptionText(caption || ''); setEditingCaption(true); }}
        >
          {caption || 'Add a caption...'}
        </p>
      )}
    </div>
  );
}
