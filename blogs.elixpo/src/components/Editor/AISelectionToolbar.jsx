'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { streamAI, getOrCreateSession } from '../../ai/agent';
import { EDIT_SYSTEM_PROMPT } from '../../ai/prompts';
import { computeWordDiff, diffToBlocks, diffToKeepBlocks } from './wordDiff';

/**
 * AI toolbar button injected into BlockNote's native formatting toolbar.
 * Star icon click → inline AI prompt below selection →
 * AI edits inline with word-level diff (strikethrough deletions, purple additions) → keep/undo.
 */
export default function AISelectionToolbar({ editor, onTitleChange, blogId }) {
  const [mode, setMode] = useState('idle'); // idle | prompting | streaming | done
  const [prompt, setPrompt] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState([]); // full block snapshots for undo
  const [selectedBlockIds, setSelectedBlockIds] = useState([]);
  const [diffBlockIds, setDiffBlockIds] = useState([]); // IDs of diff blocks that replaced originals
  const [aiResponseText, setAiResponseText] = useState(''); // AI's full response for keep
  const [diffResult, setDiffResult] = useState(null); // word-level diff array for keep/undo
  const [streamingText, setStreamingText] = useState(''); // live SSE text feed for streaming bar
  const [statusText, setStatusText] = useState(''); // lixsearch task status text
  const [promptPos, setPromptPos] = useState({ top: 0 });
  const abortRef = useRef(null);
  const promptRef = useRef(null);
  const menuRef = useRef(null);
  const injectedRef = useRef(false);
  const savedSelectionRef = useRef(null); // Save native DOM selection range

  // Inject star button + color buttons into BlockNote's native toolbar
  useEffect(() => {
    if (!editor) return;

    function tryInject() {
      const toolbar = document.querySelector('.blog-editor-wrapper .bn-toolbar');
      if (!toolbar) {
        injectedRef.current = false;
        return;
      }

      if (toolbar.querySelector('.ai-star-btn')) return;
      injectedRef.current = true;

      // --- Text Color button ---
      const colorSep = document.createElement('div');
      colorSep.className = 'ai-toolbar-sep';

      const colorBtn = document.createElement('button');
      colorBtn.className = 'toolbar-color-btn';
      colorBtn.title = 'Text Color';
      colorBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M7 16l5-12 5 12"/><path d="M9.5 11h5"/></svg><span class="toolbar-color-indicator" style="background:#e0e0e0"></span>';

      const colorPalette = [
        { label: 'Default', value: 'default' },
        { label: 'White', value: '#ffffff' },
        { label: 'Gray', value: '#9ca3af' },
        { label: 'Red', value: '#f87171' },
        { label: 'Orange', value: '#fb923c' },
        { label: 'Yellow', value: '#fbbf24' },
        { label: 'Green', value: '#4ade80' },
        { label: 'Blue', value: '#60a5fa' },
        { label: 'Purple', value: '#a78bfa' },
        { label: 'Pink', value: '#f472b6' },
      ];

      colorBtn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
      colorBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.toolbar-color-popover').forEach(el => el.remove());
        const pop = document.createElement('div');
        pop.className = 'toolbar-color-popover';
        const rect = colorBtn.getBoundingClientRect();
        pop.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;z-index:10000;`;
        pop.innerHTML = '<div class="toolbar-color-popover-label">Text Color</div>' +
          '<div class="toolbar-color-grid">' +
          colorPalette.map(c =>
            `<button class="toolbar-color-swatch" data-color="${c.value}" title="${c.label}" style="background:${c.value === 'default' ? 'transparent' : c.value};${c.value === 'default' ? 'border:1.5px dashed #6b7a8d;' : ''}"></button>`
          ).join('') + '</div>';
        pop.addEventListener('mousedown', (ev) => {
          const swatch = ev.target.closest('.toolbar-color-swatch');
          if (!swatch) return;
          ev.preventDefault();
          const color = swatch.dataset.color;
          try {
            editor.focus();
            if (color === 'default') {
              editor.removeStyles({ textColor: '' });
            } else {
              editor.addStyles({ textColor: color });
            }
            // Deselect so user can see the applied color
            setTimeout(() => { window.getSelection()?.removeAllRanges(); }, 50);
          } catch (err) { console.error('Failed to apply text color:', err); }
          pop.remove();
        });
        document.body.appendChild(pop);
        setTimeout(() => {
          const dismiss = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', dismiss); } };
          document.addEventListener('mousedown', dismiss);
        }, 0);
      };

      // --- Highlight button ---
      const highlightBtn = document.createElement('button');
      highlightBtn.className = 'toolbar-highlight-btn';
      highlightBtn.title = 'Highlight Color';
      highlightBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span class="toolbar-color-indicator" style="background:#fbbf24"></span>';

      const highlightPalette = [
        { label: 'None', value: 'default' },
        { label: 'Gray', value: 'rgba(156,163,175,0.25)' },
        { label: 'Red', value: 'rgba(248,113,113,0.25)' },
        { label: 'Orange', value: 'rgba(251,146,60,0.25)' },
        { label: 'Yellow', value: 'rgba(251,191,36,0.25)' },
        { label: 'Green', value: 'rgba(74,222,128,0.25)' },
        { label: 'Blue', value: 'rgba(96,165,250,0.25)' },
        { label: 'Purple', value: 'rgba(167,139,250,0.25)' },
        { label: 'Pink', value: 'rgba(244,114,182,0.25)' },
      ];

      highlightBtn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
      highlightBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.toolbar-color-popover').forEach(el => el.remove());
        const pop = document.createElement('div');
        pop.className = 'toolbar-color-popover';
        const rect = highlightBtn.getBoundingClientRect();
        pop.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;z-index:10000;`;
        pop.innerHTML = '<div class="toolbar-color-popover-label">Highlight</div>' +
          '<div class="toolbar-color-grid">' +
          highlightPalette.map(c =>
            `<button class="toolbar-color-swatch" data-color="${c.value}" title="${c.label}" style="background:${c.value === 'default' ? 'transparent' : c.value};${c.value === 'default' ? 'border:1.5px dashed #6b7a8d;' : ''}"></button>`
          ).join('') + '</div>';
        pop.addEventListener('mousedown', (ev) => {
          const swatch = ev.target.closest('.toolbar-color-swatch');
          if (!swatch) return;
          ev.preventDefault();
          const color = swatch.dataset.color;
          try {
            editor.focus();
            if (color === 'default') {
              editor.removeStyles({ backgroundColor: '' });
            } else {
              editor.addStyles({ backgroundColor: color });
            }
            // Deselect so user can see the applied highlight
            setTimeout(() => { window.getSelection()?.removeAllRanges(); }, 50);
          } catch (err) { console.error('Failed to apply highlight:', err); }
          pop.remove();
        });
        document.body.appendChild(pop);
        setTimeout(() => {
          const dismiss = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', dismiss); } };
          document.addEventListener('mousedown', dismiss);
        }, 0);
      };

      // --- AI Star button ---
      const sep = document.createElement('div');
      sep.className = 'ai-toolbar-sep';

      const btn = document.createElement('button');
      btn.className = 'ai-star-btn';
      btn.title = 'Edit with AI';
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>';

      btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
          // Save the native DOM selection range before anything else
          const nativeSel = window.getSelection();
          if (nativeSel && nativeSel.rangeCount > 0) {
            savedSelectionRef.current = nativeSel.getRangeAt(0).cloneRange();
          }

          const sel = editor.getSelection();
          if (!sel?.blocks?.length) return;

          const text = sel.blocks
            .map((b) => (b.content && Array.isArray(b.content)) ? b.content.map((c) => c.text || '').join('') : '')
            .join('\n')
            .trim();
          if (!text) return;

          // Save full block snapshots for undo
          const blockSnapshots = sel.blocks.map((b) => JSON.parse(JSON.stringify(b)));
          const blockIds = sel.blocks.map((b) => b.id);

          setSelectedText(text);
          setSelectedBlocks(blockSnapshots);
          setSelectedBlockIds(blockIds);

          // Get position below selected blocks for the prompt
          const wrapperEl = document.querySelector('.blog-editor-wrapper');
          const wrapperRect = wrapperEl?.getBoundingClientRect();
          const lastBlockId = blockIds[blockIds.length - 1];
          const lastBlockEl = wrapperEl?.querySelector(`[data-id="${lastBlockId}"]`);

          let top = 0;
          if (lastBlockEl && wrapperRect) {
            const blockRect = lastBlockEl.getBoundingClientRect();
            top = blockRect.bottom - wrapperRect.top + 6;
          }

          setPromptPos({ top });
          setMode('prompting');
          setPrompt('');
          setDiffBlockIds([]);
          setAiResponseText('');

          // Lock editor and hide toolbar so user can't edit during AI work
          const wrapper2 = document.querySelector('.blog-editor-wrapper');
          if (wrapper2) wrapper2.classList.add('ai-editor-locked');
          const tb = document.querySelector('.blog-editor-wrapper .bn-toolbar');
          if (tb) tb.style.display = 'none';

          // Add highlight on selected blocks
          requestAnimationFrame(() => {
            const wrapper = document.querySelector('.blog-editor-wrapper');
            if (wrapper) {
              blockIds.forEach((id) => {
                const el = wrapper.querySelector(`[data-id="${id}"]`);
                if (el) el.classList.add('ai-edit-selection-highlight');
              });
            }
          });
        } catch { /* editor not ready */ }
      };

      toolbar.appendChild(colorSep);
      toolbar.appendChild(colorBtn);
      toolbar.appendChild(highlightBtn);
      toolbar.appendChild(sep);
      toolbar.appendChild(btn);
    }

    // Toolbar is a tippy popup created on text selection — inject buttons when it appears.
    // Use selectionchange (fires when toolbar would appear) instead of MutationObserver+subtree
    // which fires on every keystroke and causes high CPU/memory usage.
    tryInject();
    let rafId = null;
    const onSelect = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        tryInject();
      });
    };
    document.addEventListener('selectionchange', onSelect);

    return () => { document.removeEventListener('selectionchange', onSelect); if (rafId) cancelAnimationFrame(rafId); };
  }, [editor]);

  // Focus prompt input when entering prompting mode
  // The selected blocks stay visually highlighted via CSS class, and pointer events
  // are blocked on the editor to prevent the user from accidentally deselecting
  useEffect(() => {
    if (mode === 'prompting') {
      setTimeout(() => {
        promptRef.current?.focus();
      }, 50);
    }
  }, [mode]);

  // Close prompt on click outside (only in prompting mode)
  useEffect(() => {
    if (mode !== 'prompting') return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        resetState();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mode]);

  // (Old block-level helpers removed — diff is now inline via word-level diff)

  // Hide the native toolbar
  const hideToolbar = useCallback(() => {
    const toolbar = document.querySelector('.blog-editor-wrapper .bn-toolbar');
    if (toolbar) toolbar.style.display = 'none';
  }, []);

  const showToolbar = useCallback(() => {
    const toolbar = document.querySelector('.blog-editor-wrapper .bn-toolbar');
    if (toolbar) toolbar.style.display = '';
  }, []);

  // Lock/unlock editor editing
  const lockEditor = useCallback(() => {
    const wrapper = document.querySelector('.blog-editor-wrapper');
    if (wrapper) wrapper.classList.add('ai-editor-locked');
  }, []);

  const unlockEditor = useCallback(() => {
    const wrapper = document.querySelector('.blog-editor-wrapper');
    if (wrapper) wrapper.classList.remove('ai-editor-locked');
  }, []);

  const clearSelectedLavender = useCallback(() => {
    const wrapper = document.querySelector('.blog-editor-wrapper');
    wrapper?.querySelectorAll('.ai-edit-selected-block, .ai-edit-selection-highlight').forEach((el) => {
      el.classList.remove('ai-edit-selected-block', 'ai-edit-selection-highlight');
    });
  }, []);

  // Add skeleton loading to nearby lines below selection
  const addSkeletonLoading = useCallback((blockIds) => {
    const wrapper = document.querySelector('.blog-editor-wrapper');
    if (!wrapper) return;
    const lastId = blockIds[blockIds.length - 1];
    const lastEl = wrapper.querySelector(`[data-id="${lastId}"]`);
    if (!lastEl) return;
    let sibling = lastEl.nextElementSibling;
    let count = 0;
    while (sibling && count < 2) {
      sibling.classList.add('ai-skeleton-nearby');
      sibling = sibling.nextElementSibling;
      count++;
    }
  }, []);

  const removeSkeletonLoading = useCallback(() => {
    const wrapper = document.querySelector('.blog-editor-wrapper');
    wrapper?.querySelectorAll('.ai-skeleton-nearby').forEach((el) => {
      el.classList.remove('ai-skeleton-nearby');
    });
  }, []);

  const handleKeep = useCallback(() => {
    removeSkeletonLoading();
    clearSelectedLavender();

    // Build clean blocks from diff: remove deleted words, keep additions, reset colors
    const ids = [...diffBlockIds];
    if (ids.length > 0 && diffResult) {
      try {
        const keepBlocks = diffToKeepBlocks(diffResult);
        if (keepBlocks.length > 0) {
          editor.replaceBlocks(ids, keepBlocks);
        }
      } catch (err) { console.error('Keep failed:', err); }
    }

    unlockEditor();
    showToolbar();
    resetState();
  }, [editor, diffBlockIds, diffResult, showToolbar, unlockEditor, removeSkeletonLoading, clearSelectedLavender]);

  const handleUndo = useCallback(() => {
    abortRef.current?.abort();
    removeSkeletonLoading();
    clearSelectedLavender();

    if (diffBlockIds.length > 0 && selectedBlocks.length > 0) {
      // Replace diff blocks with original block snapshots
      try {
        editor.replaceBlocks(diffBlockIds, selectedBlocks);
      } catch (err) { console.error('Undo failed:', err); }
    }

    unlockEditor();
    showToolbar();
    resetState();
  }, [editor, diffBlockIds, selectedBlocks, showToolbar, unlockEditor, removeSkeletonLoading, clearSelectedLavender]);

  function resetState() {
    setMode('idle');
    setPrompt('');
    setSelectedText('');
    setSelectedBlocks([]);
    setSelectedBlockIds([]);
    setDiffBlockIds([]);
    setAiResponseText('');
    setDiffResult(null);
    setStreamingText('');
    setStatusText('');
    savedSelectionRef.current = null;
    // Clean up leftover DOM classes and unlock editor
    const wrapper = document.querySelector('.blog-editor-wrapper');
    wrapper?.classList.remove('ai-editor-locked');
    wrapper?.querySelectorAll('.ai-edit-selected-block, .ai-edit-selection-highlight, .ai-skeleton-nearby').forEach((el) => {
      el.classList.remove('ai-edit-selected-block', 'ai-edit-selection-highlight', 'ai-skeleton-nearby');
    });
    const toolbar = document.querySelector('.blog-editor-wrapper .bn-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  // Core submit logic — streams AI response, then applies word-level diff inline
  const submitWithPrompt = useCallback(async (promptText) => {
    if (!promptText.trim() || !editor) return;

    hideToolbar();
    lockEditor();

    // Highlight selected blocks during streaming (keeps text visible)
    const wrapper = document.querySelector('.blog-editor-wrapper');
    if (wrapper) {
      selectedBlockIds.forEach((id) => {
        const el = wrapper.querySelector(`[data-id="${id}"]`);
        if (el) el.classList.add('ai-edit-selection-highlight');
      });
    }
    addSkeletonLoading(selectedBlockIds);

    setMode('streaming');

    const controller = new AbortController();
    abortRef.current = controller;

    // Build context
    let fullBlogText = '';
    try {
      fullBlogText = editor.document.map((b) => {
        const text = (b.content || []).map((c) => c.text || '').join('');
        if (b.type === 'heading') return `${'#'.repeat(b.props?.level || 1)} ${text}`;
        return text;
      }).filter(Boolean).join('\n');
    } catch {}

    const userPrompt = `## Full blog (for context):\n${fullBlogText}\n\n---\n\nSelected text to edit:\n\`\`\`\n${selectedText}\n\`\`\`\n\nInstruction: ${promptText}`;

    try {
      const sessionId = await getOrCreateSession(blogId);

      await streamAI({
        sessionId,
        systemPrompt: EDIT_SYSTEM_PROMPT,
        userPrompt,
        signal: controller.signal,

        onTask: (taskText) => {
          setStatusText(taskText);
        },

        onChunk: (_chunk, fullText) => {
          removeSkeletonLoading();
          setStreamingText(fullText);
        },

        onDone: (fullText) => {
          removeSkeletonLoading();
          clearSelectedLavender();

          let contentText = fullText;
          // Handle TITLE: prefix
          if (contentText.trim().startsWith('TITLE:')) {
            const lines = contentText.trim().split('\n');
            const titleLine = lines.shift();
            const newTitle = titleLine.replace(/^TITLE:\s*/, '').trim();
            if (onTitleChange && newTitle) onTitleChange(newTitle);
            contentText = lines.join('\n').trim();
          }

          if (!contentText) {
            // No content — just clean up
            setMode('idle');
            unlockEditor();
            showToolbar();
            return;
          }

          // Store AI response for reference
          setAiResponseText(contentText);

          // Strip markdown syntax for clean diff comparison
          const cleanAiText = contentText
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '');

          // Compute word-level diff and store it for keep/undo
          const diff = computeWordDiff(selectedText, cleanAiText);
          setDiffResult(diff);
          const diffBlocks = diffToBlocks(diff);

          // Find the block before the first selected block (anchor for finding new IDs)
          const doc = editor.document;
          const firstSelIdx = doc.findIndex((b) => b.id === selectedBlockIds[0]);
          const beforeBlockId = firstSelIdx > 0 ? doc[firstSelIdx - 1].id : null;

          // Replace original blocks with diff blocks
          try {
            editor.replaceBlocks(selectedBlockIds, diffBlocks);
          } catch { /* blocks may have been removed */ }

          // Track the new diff block IDs
          const newDoc = editor.document;
          const startIdx = beforeBlockId
            ? newDoc.findIndex((b) => b.id === beforeBlockId) + 1
            : 0;
          const newDiffIds = newDoc
            .slice(startIdx, startIdx + diffBlocks.length)
            .map((b) => b.id);
          setDiffBlockIds(newDiffIds);

          setMode('done');
          abortRef.current = null;

          // Scroll to diff
          requestAnimationFrame(() => {
            const firstEl = document.querySelector(`.blog-editor-wrapper [data-id="${newDiffIds[0]}"]`);
            if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        },

        onError: (err) => {
          console.error('AI stream error:', err);
          removeSkeletonLoading();
          clearSelectedLavender();
          unlockEditor();
          showToolbar();
          resetState();
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('AI error:', err);
        removeSkeletonLoading();
        clearSelectedLavender();
        unlockEditor();
        showToolbar();
        resetState();
      }
    }
  }, [selectedText, selectedBlockIds, editor, hideToolbar, lockEditor, addSkeletonLoading, removeSkeletonLoading, clearSelectedLavender, unlockEditor, showToolbar, onTitleChange, blogId]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || !editor) return;
    submitWithPrompt(prompt);
  }, [prompt, editor, submitWithPrompt]);

  // Quick-action: submit preset instruction directly
  const handleQuickAction = useCallback((instruction) => {
    submitWithPrompt(instruction);
  }, [submitWithPrompt]);

  // Quick action presets
  const quickActions = [
    { label: 'Fix Grammar', instruction: 'Fix all grammar, spelling, and punctuation errors. Keep the original meaning and tone intact.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { label: 'Paraphrase', instruction: 'Paraphrase this text while preserving the original meaning. Use different word choices and sentence structures.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
    { label: 'Improve Writing', instruction: 'Improve the clarity, flow, and readability of this text. Make the language more polished and professional while keeping the original voice.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg> },
    { label: 'Make Concise', instruction: 'Make this text more concise and to the point. Remove unnecessary words and redundancy without losing meaning.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h10"/></svg> },
    { label: 'Make Formal', instruction: 'Rewrite this text in a more formal and professional tone.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg> },
    { label: 'Simplify', instruction: 'Simplify this text so it is easy to understand. Use shorter sentences and simpler vocabulary.', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg> },
  ];

  // Render the inline AI prompt (same style as space-trigger AICommandMenu)
  if (mode === 'prompting') {
    return (
      <div
        ref={menuRef}
        style={{
          position: 'absolute',
          top: promptPos.top,
          left: 0,
          right: 0,
          zIndex: 100,
        }}
      >
        <div className="mx-auto w-full max-w-[600px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden">
              <img src="/logo-mark.png" alt="AI" className="w-full h-full object-cover" />
            </div>
            <input
              ref={promptRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && prompt.trim()) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') resetState();
              }}
              placeholder="Edit: improve, fix grammar, translate, rewrite..."
              className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[#6b7a8d] outline-none"
              autoComplete="off"
              spellCheck="false"
            />
            <button
              onClick={() => prompt.trim() && handleSubmit()}
              disabled={!prompt.trim()}
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                prompt.trim()
                  ? 'bg-[#9b7bf7] hover:bg-[#b69aff] cursor-pointer'
                  : 'bg-[var(--bg-elevated)] cursor-not-allowed'
              }`}
            >
              <svg className={`w-3.5 h-3.5 ${prompt.trim() ? 'text-[var(--text-primary)]' : 'text-[#4a5568]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Quick action buttons — floating below the input card */}
        <div className="mx-auto w-full max-w-[600px] flex flex-col mt-1 py-1">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.instruction)}
              className="ai-quick-action-btn"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Streaming: inline status card (same style as content creation)
  if (mode === 'streaming') {
    return (
      <div
        style={{
          position: 'absolute',
          top: promptPos.top,
          left: 0,
          right: 0,
          zIndex: 100,
        }}
      >
        <div className="mx-auto w-full max-w-[600px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border-[1.5px] border-[rgba(196,181,253,0.3)]">
              <img src="/logo-mark.png" alt="Elixpo" className="w-full h-full object-cover" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold text-[#c4b5fd]">Elixpo</span>
              <span className="text-[13px] text-[#8b8fa3] ai-status-text-fade">
                {statusText || (streamingText ? 'is editing' : 'is thinking')}
                <span className="elixpo-typing-dots"><span /><span /><span /></span>
              </span>
            </div>
            <button
              onClick={handleUndo}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.25)] hover:bg-[rgba(248,113,113,0.15)] transition-colors cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="10" height="10" rx="2" /></svg>
              Stop
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Done: inline keep/undo card (same style as content creation)
  if (mode === 'done') {
    return (
      <div
        style={{
          position: 'absolute',
          top: promptPos.top,
          left: 0,
          right: 0,
          zIndex: 100,
        }}
      >
        <div className="mx-auto w-full max-w-[600px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border-[1.5px] border-[rgba(196,181,253,0.3)]">
              <img src="/logo-mark.png" alt="Elixpo" className="w-full h-full object-cover" />
            </div>
            <span className="text-[13px] text-[#c4b5fd]">Elixpo finished editing</span>
            <div className="ml-auto flex items-center gap-2">
              <button className="elixpo-done-keep" onClick={handleKeep} title="Keep">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Keep
              </button>
              <button className="elixpo-done-discard" onClick={handleUndo} title="Undo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Undo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
