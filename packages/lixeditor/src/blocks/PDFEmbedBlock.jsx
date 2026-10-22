'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState } from 'react';

export const PDFEmbedBlock = createReactBlockSpec(
  {
    type: 'pdfEmbed',
    propSchema: {
      url: { default: '' },
      title: { default: '' },
      fileSize: { default: '' },
      pageCount: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { url, title, fileSize, pageCount } = block.props;
      const [inputUrl, setInputUrl] = useState(url || '');
      const [loading, setLoading] = useState(false);

      const handleSubmit = () => {
        const trimmed = inputUrl.trim();
        if (!trimmed) return;

        setLoading(true);
        // Extract filename from URL
        const fileName = decodeURIComponent(trimmed.split('/').pop()?.split('?')[0] || 'document.pdf');

        editor.updateBlock(block, {
          props: {
            url: trimmed,
            title: fileName,
            fileSize: fileSize || '',
            pageCount: pageCount || '',
          },
        });
        setLoading(false);
      };

      const handleReplace = () => {
        editor.updateBlock(block, {
          props: { url: '', title: '', fileSize: '', pageCount: '' },
        });
      };

      const handleDelete = () => {
        editor.removeBlocks([block]);
      };

      // Empty state — show URL input
      if (!url) {
        return (
          <div style={{
            background: 'rgba(155, 123, 247, 0.04)',
            border: '1.5px dashed rgba(155, 123, 247, 0.25)',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Embed PDF</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Paste PDF link..."
                style={{
                  flex: 1, background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid #232d3f',
                  borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!inputUrl.trim() || loading}
                style={{
                  padding: '8px 16px', background: '#9b7bf7', color: 'white', border: 'none',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  opacity: !inputUrl.trim() || loading ? 0.4 : 1,
                }}
              >
                {loading ? '...' : 'Embed'}
              </button>
            </div>
          </div>
        );
      }

      // PDF preview card
      return (
        <div style={{
          display: 'flex', borderRadius: '12px', overflow: 'hidden',
          border: '1px solid #232d3f', background: 'var(--bg-surface)',
        }}>
          {/* Left — PDF preview iframe */}
          <div style={{
            width: '200px', minHeight: '160px', flexShrink: 0,
            background: '#0d1117', position: 'relative', overflow: 'hidden',
          }}>
            <iframe
              src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={title || 'PDF'}
              style={{
                width: '100%', height: '100%', border: 'none',
                pointerEvents: 'none',
              }}
            />
            {/* Overlay gradient */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(155,123,247,0.08) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />
            {/* PDF badge */}
            <div style={{
              position: 'absolute', bottom: '8px', left: '8px',
              background: 'rgba(155, 123, 247, 0.2)', backdropFilter: 'blur(8px)',
              borderRadius: '6px', padding: '3px 8px',
              fontSize: '10px', fontWeight: 700, color: '#c4b5fd',
              letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              PDF
            </div>
          </div>

          {/* Right — metadata */}
          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title || 'Document'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {fileSize && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    {fileSize}
                  </span>
                )}
                {pageCount && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                    {pageCount} pages
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 12px', background: 'rgba(155,123,247,0.1)',
                  border: '1px solid rgba(155,123,247,0.25)', borderRadius: '6px',
                  fontSize: '12px', color: '#a78bfa', fontWeight: 500,
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                Open PDF
              </a>
              <button onClick={handleReplace} style={{
                padding: '6px 12px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid #232d3f', borderRadius: '6px',
                fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
              }}>
                Replace
              </button>
              <button onClick={handleDelete} style={{
                padding: '6px 12px', background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: '6px',
                fontSize: '12px', color: '#f87171', cursor: 'pointer',
              }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      );
    },
  }
);
