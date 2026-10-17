'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useUploadConfig } from '../editor/uploadConfig';

/**
 * Image block for @elixpo/lixeditor.
 * Supports: Upload (base64), Embed URL, Paste, Drag & Drop, Captions.
 * Same class names as LixBlogs for CSS compatibility.
 *
 * For custom upload (e.g. cloud storage), consumers should use the LixBlogs
 * BlogImageBlock or override via extraBlockSpecs.
 */
export const BlogImageBlock = createReactBlockSpec(
  {
    type: 'image',
    propSchema: {
      url: { default: '' },
      caption: { default: '' },
      previewWidth: { default: 740 },
      name: { default: '' },
      showPreview: { default: true },
      // email/export fields (2.7.0)
      alt: { default: '' },
      width: { default: '' },
      align: { default: '' },
      link: { default: '' },
      // upload state: '' = idle, 'uploading' = in-flight, 'error' = failed
      _uploading: { default: '' },
      _mediaId: { default: '' },
      _imageId: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => <ImageRenderer {...props} />,
  }
);

function ImageRenderer({ block, editor }) {
  const { url, caption, _uploading } = block.props;
  const { uploadFile: hostUpload, acceptImageTypes, maxFileSizeBytes, onUploadError, imageInsert } = useUploadConfig();
  const [mode, setMode] = useState('idle'); // idle | embed
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedError, setEmbedError] = useState('');
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

  // Focus input when mode changes
  useEffect(() => {
    if (mode === 'embed') setTimeout(() => embedInputRef.current?.focus(), 50);
  }, [mode]);

  // Keyboard: backspace to delete when focused
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

  // Upload helper — sets _uploading prop so placeholder persists across re-renders.
  // When hostUpload is provided, the host resolves the URL. Otherwise falls back
  // to base64 data URL so the package works with zero config.
  const uploadFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (acceptImageTypes?.length && !acceptImageTypes.includes(file.type)) {
      showFailToast('Unsupported image type');
      return;
    }
    if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
      showFailToast(`Image exceeds ${Math.round(maxFileSizeBytes / 1024 / 1024)}MB limit`);
      return;
    }
    editor.updateBlock(block.id, { props: { _uploading: 'uploading' } });

    // Move caret to next line / paragraph below so the user can continue typing
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

    if (hostUpload) {
      try {
        const resultUrl = await hostUpload(file);
        if (!resultUrl || typeof resultUrl !== 'string') throw new Error('uploadFile did not return a URL');
        editor.updateBlock(block.id, { props: { url: resultUrl, name: file.name, _uploading: '' } });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        onUploadError?.(e, file);
        editor.updateBlock(block.id, { props: { _uploading: 'error' } });
      }
      return;
    }

    // Base64 fallback (standalone / zero-config)
    try {
      const reader = new FileReader();
      reader.onload = () => {
        editor.updateBlock(block.id, { props: { url: reader.result, name: file.name, _uploading: '' } });
      };
      reader.onerror = () => {
        editor.updateBlock(block.id, { props: { _uploading: 'error' } });
      };
      reader.readAsDataURL(file);
    } catch {
      editor.updateBlock(block.id, { props: { _uploading: 'error' } });
    }
  }, [editor, block.id, hostUpload, acceptImageTypes, maxFileSizeBytes, onUploadError]);

  // Paste handler
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

  // Drag and drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) uploadFile(file);
  }, [uploadFile]);

  // Embed URL submit
  const handleEmbed = useCallback(() => {
    const trimmed = embedUrl.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http')) {
      setEmbedError('URL must start with http:// or https://');
      return;
    }
    editor.updateBlock(block.id, { props: { url: trimmed } });
    setMode('idle');
    setEmbedUrl('');
    setEmbedError('');
  }, [embedUrl, editor, block.id]);

  // Toast on failure
  const showFailToast = useCallback((msg) => {
    const toast = document.createElement('div');
    toast.className = 'blog-img-fail-toast';
    toast.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><circle cx="8" cy="8" r="7" stroke="#f87171" stroke-width="1.5"/><path d="M8 4.5v4" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r=".75" fill="#f87171"/></svg><span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('blog-img-fail-toast--out'); }, 3200);
    setTimeout(() => { toast.remove(); }, 3600);
  }, []);

  const handleDelete = useCallback(() => {
    try { editor.removeBlocks([block.id]); } catch {}
  }, [editor, block.id]);

  const handleReplace = useCallback(() => {
    editor.updateBlock(block.id, { props: { url: '' } });
    setMode('idle');
  }, [editor, block.id]);

  const handleCaptionSave = useCallback(() => {
    editor.updateBlock(block.id, { props: { caption: captionText } });
    setEditingCaption(false);
  }, [editor, block.id, captionText]);

  // Open file picker to upload image dynamically (in-memory input avoids focus loss issues)
  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (acceptImageTypes || ['image/png', 'image/jpeg', 'image/gif', 'image/webp']).join(',');
    input.onchange = () => {
      if (input.files?.[0]) {
        uploadFile(input.files[0]);
      }
    };
    input.click();
  }, [uploadFile, acceptImageTypes]);

  // Retry after error — open file picker to re-select
  const handleRetry = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files?.[0]) {
        // Reset to uploading first so the skeleton re-appears
        editor.updateBlock(block.id, { props: { _uploading: 'uploading' } });
        uploadFile(input.files[0]);
      }
    };
    input.click();
  }, [editor, block.id, uploadFile]);

  const showSkeleton = _uploading === 'uploading' || (url && !isImgLoaded);

  // ─── No image yet / Image loading in background ───
  if (!url || showSkeleton) {
    if (showSkeleton) {
      return (
        <div ref={blockRef} className="blog-img-upload-skeleton" tabIndex={-1}>
          <div className="blog-img-skel-image">
            <div className="blog-img-skel-shimmer" />
            <div className="blog-img-skel-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
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
              style={{ display: 'none' }}
            />
          )}
        </div>
      );
    }

    // Upload failed — error card with retry/remove
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

    // Host-driven insert: never show the default Upload/Embed-URL card. The host
    // inserts ready image blocks (with a URL) via its own toolbar / insertImage().
    if (imageInsert === 'host') return null;
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
        {/* Idle — 2 action buttons (no AI) */}
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
            </div>
            <p className="blog-img-hint">or drag & drop / paste an image</p>
          </>
        )}

        {/* Embed URL input */}
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
      </div>
    );
  }

  // ─── Image loaded ───
  return (
    <div ref={blockRef} className="blog-img-loaded blog-img-fadein" tabIndex={0} onPaste={handlePaste}>
      <div className="blog-img-wrapper">
        <img src={url} alt={caption || 'Image'} className="blog-img-main" draggable={false} />
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
