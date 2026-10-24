'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useRef, useEffect } from 'react';

const GENERATE_TYPES = [
  { value: 'custom', label: 'Custom output', icon: 'create-outline' },
  { value: 'summary', label: 'Summary', icon: 'document-text-outline' },
  { value: 'continue', label: 'Continue writing', icon: 'arrow-forward-outline' },
  { value: 'rewrite', label: 'Rewrite', icon: 'refresh-outline' },
  { value: 'translate', label: 'Translate', icon: 'language-outline' },
  { value: 'explain', label: 'Explain', icon: 'bulb-outline' },
];

const CONTEXT_TYPES = [
  { value: 'current', label: 'Current page only' },
  { value: 'new', label: 'New page' },
];

export const AIBlock = createReactBlockSpec(
  {
    type: 'aiBlock',
    propSchema: {
      prompt: { default: '' },
      generateType: { default: 'custom' },
      context: { default: 'current' },
      status: { default: 'idle' },
      result: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [generateType, setGenerateType] = useState(block.props.generateType || 'custom');
      const [context, setContext] = useState(block.props.context || 'current');
      const [prompt, setPrompt] = useState(block.props.prompt || '');
      const [status, setStatus] = useState(block.props.status || 'idle');
      const [result, setResult] = useState(block.props.result || '');
      const [showTypeDropdown, setShowTypeDropdown] = useState(false);
      const [showContextDropdown, setShowContextDropdown] = useState(false);
      const textareaRef = useRef(null);
      const typeRef = useRef(null);
      const contextRef = useRef(null);

      useEffect(() => {
        if (status === 'idle') textareaRef.current?.focus();
      }, []);

      // Close dropdowns on outside click
      useEffect(() => {
        function handler(e) {
          if (typeRef.current && !typeRef.current.contains(e.target)) setShowTypeDropdown(false);
          if (contextRef.current && !contextRef.current.contains(e.target)) setShowContextDropdown(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, []);

      const handleDone = () => {
        if (status === 'done' && result) {
          // Replace AI block with the result as paragraphs
          const lines = result.split('\n').filter(Boolean);
          const blocks = lines.map((line) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          }));
          editor.replaceBlocks([block.id], blocks);
        } else if (prompt.trim()) {
          // Start generation
          setStatus('generating');
          editor.updateBlock(block, {
            props: { prompt, generateType, context, status: 'generating' },
          });

          // TODO: call AI API here — for now simulate
          setTimeout(() => {
            const fakeResult = `AI-generated content for: "${prompt}" (${GENERATE_TYPES.find(t => t.value === generateType)?.label})`;
            setResult(fakeResult);
            setStatus('done');
            editor.updateBlock(block, {
              props: { prompt, generateType, context, status: 'done', result: fakeResult },
            });
          }, 1500);
        }
      };

      const selectedType = GENERATE_TYPES.find((t) => t.value === generateType) || GENERATE_TYPES[0];
      const selectedContext = CONTEXT_TYPES.find((c) => c.value === context) || CONTEXT_TYPES[0];

      // Generating state
      if (status === 'generating') {
        return (
          <div className="border border-[#9b7bf730] rounded-xl bg-[var(--bg-surface)] p-5 my-2">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[#9b7bf7] border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px] text-[#9b7bf7]">Generating...</span>
            </div>
          </div>
        );
      }

      // Done state — show result
      if (status === 'done') {
        return (
          <div className="border border-[#9b7bf730] rounded-xl bg-[var(--bg-surface)] p-5 my-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-[#9b7bf7] font-bold uppercase tracking-wider">AI Result</span>
              <button onClick={handleDone} className="px-3 py-1 text-[12px] bg-[#9b7bf7] text-[var(--text-primary)] rounded-md font-medium hover:bg-[#b69aff] transition-colors">
                Insert
              </button>
            </div>
            <div className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{result}</div>
          </div>
        );
      }

      // Idle state — input form
      return (
        <div className="border border-dashed border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] p-5 my-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-[var(--text-primary)] font-bold">AI block</span>
            <button
              onClick={handleDone}
              disabled={!prompt.trim()}
              className="px-3 py-1 text-[12px] bg-[#9b7bf7] text-[var(--text-primary)] rounded-md font-medium hover:bg-[#b69aff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Done
            </button>
          </div>

          {/* Generate type dropdown */}
          <p className="text-[12px] text-[#9b7bf7] font-medium mb-2">Generate</p>
          <div className="relative mb-4" ref={typeRef}>
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="w-full flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <ion-icon name={selectedType.icon} style={{ fontSize: '15px', color: '#9b7bf7' }} />
                {selectedType.label}
              </span>
              <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showTypeDropdown && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg shadow-xl z-10 overflow-hidden">
                {GENERATE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => { setGenerateType(t.value); setShowTypeDropdown(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-[var(--bg-hover)] transition-colors ${
                      t.value === generateType ? 'text-[#9b7bf7]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <ion-icon name={t.icon} style={{ fontSize: '15px' }} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Prompt textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the content that should be generated. Use '@' to mention people, pages, or dates"
            rows={4}
            className="w-full bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg p-3 text-[13px] text-[var(--text-primary)] resize-none outline-none focus:border-[var(--border-hover)] transition-colors placeholder-[#6b7a8d] mb-4"
          />

          {/* Context dropdown */}
          <p className="text-[12px] text-[#9b7bf7] font-medium mb-2 flex items-center gap-1">
            Using
            <span className="text-[var(--text-muted)] cursor-help" title="Choose the context for AI generation">
              <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><path d="M12 16v-4M12 8h.01" strokeWidth={2} /></svg>
            </span>
          </p>
          <div className="relative" ref={contextRef}>
            <button
              onClick={() => setShowContextDropdown(!showContextDropdown)}
              className="w-full flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <ion-icon name="document-outline" style={{ fontSize: '14px', color: '#888' }} />
                {selectedContext.label}
                {context === 'current' && <span className="text-[var(--text-muted)]">&mdash;</span>}
                {context === 'new' && null}
                {context === 'current' && <span className="flex items-center gap-1 text-[var(--text-muted)]"><ion-icon name="document-outline" style={{ fontSize: '13px' }} /> New page</span>}
              </span>
              <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showContextDropdown && (
              <div className="absolute bottom-full mb-1 left-0 right-0 bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg shadow-xl z-10 overflow-hidden">
                {CONTEXT_TYPES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => { setContext(c.value); setShowContextDropdown(false); }}
                    className={`w-full px-3 py-2.5 text-[13px] text-left hover:bg-[var(--bg-hover)] transition-colors ${
                      c.value === context ? 'text-[#9b7bf7]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    },
  }
);
