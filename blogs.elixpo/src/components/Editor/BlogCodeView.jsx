'use client';

import { useEffect, useRef, useState } from 'react';

export default function BlogCodeView({ blocks, markdown }) {
  const [viewMode, setViewMode] = useState('markdown');
  const [copied, setCopied] = useState(false);
  const copiedResetRef = useRef(null);

  useEffect(() => () => clearTimeout(copiedResetRef.current), []);

  const content = viewMode === 'markdown' ? markdown : JSON.stringify(blocks, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(content || '').then(() => {
      clearTimeout(copiedResetRef.current);
      setCopied(true);
      copiedResetRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="blog-code-view">
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-[#1D202A] rounded-lg p-1 gap-1">
          <button
            onClick={() => setViewMode('markdown')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'markdown'
                ? 'bg-[#7ba8f0] text-[#030712]'
                : 'text-[#888] hover:text-[var(--text-primary)]'
            }`}
          >
            Markdown
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'json'
                ? 'bg-[#7ba8f0] text-[#030712]'
                : 'text-[#888] hover:text-[var(--text-primary)]'
            }`}
          >
            JSON Blocks
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1D202A] rounded-lg transition-colors ${
            copied ? 'text-[#4ade80]' : 'text-[#888] hover:text-[#7ba8f0]'
          }`}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      <pre className="bg-[#0a0e17] border border-[#1D202A] rounded-xl p-5 overflow-auto max-h-[calc(100vh-260px)] text-sm leading-relaxed">
        <code className={viewMode === 'markdown' ? 'text-[var(--text-secondary)]' : 'text-[#7ba8f0]'}>
          {content || (viewMode === 'markdown' ? '# Start writing...' : '[]')}
        </code>
      </pre>
    </div>
  );
}
