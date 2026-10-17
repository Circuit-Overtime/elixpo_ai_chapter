'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLixTheme } from '../hooks/useLixTheme';
import LinkPreviewTooltip, { useLinkPreview } from '../editor/LinkPreviewTooltip';
import { renderBlocksToHTML } from './renderBlocks';
import { getMermaidConfig, normalizeMermaidSource, prepareMermaidSvg } from '../utils/mermaidConfig';

/**
 * LixPreview — Renders BlockNote content as styled HTML with post-processing.
 *
 * @param {Object} props
 * @param {Array} props.blocks - BlockNote document blocks
 * @param {string} [props.html] - Fallback raw HTML (used if blocks not provided)
 * @param {Object} [props.features] - Enable/disable features (same keys as LixEditor)
 * @param {string} [props.className] - Additional CSS class
 */
export default function LixPreview({ blocks, html, features = {}, className = '' }) {
  const { isDark } = useLixTheme();
  const contentRef = useRef(null);
  const linkPreview = useLinkPreview();
  const linkPreviewRef = useRef(linkPreview);
  linkPreviewRef.current = linkPreview;

  const f = {
    equations: true, mermaid: true, codeHighlighting: true, linkPreview: true,
    ...features,
  };

  const renderedHTML = blocks && blocks.length > 0 ? renderBlocksToHTML(blocks) : (html || '');

  // Set innerHTML via ref so React doesn't overwrite post-processed content
  const effectGenRef = useRef(0);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const gen = ++effectGenRef.current;
    root.innerHTML = renderedHTML || '';

    function isStale() { return effectGenRef.current !== gen; }

    // ── KaTeX rendering ──
    if (f.equations) {
      const eqEls = root.querySelectorAll('.lix-block-equation[data-latex]');
      const inlineEls = root.querySelectorAll('.lix-inline-equation[data-latex]');
      if (eqEls.length || inlineEls.length) {
        import('katex').then((mod) => {
          if (isStale()) return;
          const katex = mod.default || mod;
          const strip = (raw) => {
            let s = raw.trim();
            if (s.startsWith('\\[') && s.endsWith('\\]')) return s.slice(2, -2).trim();
            if (s.startsWith('$$') && s.endsWith('$$')) return s.slice(2, -2).trim();
            if (s.startsWith('\\(') && s.endsWith('\\)')) return s.slice(2, -2).trim();
            if (s.startsWith('$') && s.endsWith('$') && s.length > 2) return s.slice(1, -1).trim();
            return s;
          };
          eqEls.forEach(el => {
            if (!el.isConnected) return;
            try { el.innerHTML = katex.renderToString(strip(decodeURIComponent(el.dataset.latex)), { displayMode: true, throwOnError: false }); }
            catch (err) { el.innerHTML = `<span style="color:#f87171">${err.message}</span>`; }
          });
          inlineEls.forEach(el => {
            if (!el.isConnected) return;
            try { el.innerHTML = katex.renderToString(strip(decodeURIComponent(el.dataset.latex)), { displayMode: false, throwOnError: false }); }
            catch (err) { el.innerHTML = `<span style="color:#f87171">${err.message}</span>`; }
          });
        }).catch(() => {});
      }
    }

    // ── Mermaid rendering ──
    if (f.mermaid) {
      const mermaidEls = root.querySelectorAll('.lix-mermaid-block[data-diagram]');
      if (mermaidEls.length) {
        import('mermaid').then((mod) => {
          if (isStale()) return;
          const mermaid = mod.default || mod;
          mermaid.initialize(getMermaidConfig(isDark));
          (async () => {
            for (const el of mermaidEls) {
              const id = `lix-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              try {
                const diagram = normalizeMermaidSource(decodeURIComponent(el.dataset.diagram));
                const tempDiv = document.createElement('div');
                tempDiv.id = 'c-' + id;
                tempDiv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;opacity:0;pointer-events:none;z-index:-9999;';
                document.body.appendChild(tempDiv);
                const { svg } = await mermaid.render(id, diagram, tempDiv);
                tempDiv.remove();
                if (el.isConnected && !isStale()) {
                  el.innerHTML = '';
                  const viewport = document.createElement('div');
                  viewport.className = 'lix-mermaid-viewport';
                  const svgContainer = document.createElement('div');
                  svgContainer.className = 'lix-mermaid-svg-container';
                  svgContainer.innerHTML = prepareMermaidSvg(svg);
                  const controls = document.createElement('div');
                  controls.className = 'lix-mermaid-controls';
                  const zoomOut = document.createElement('button');
                  zoomOut.type = 'button';
                  zoomOut.title = 'Zoom out';
                  zoomOut.textContent = '−';
                  const zoomLabel = document.createElement('span');
                  zoomLabel.textContent = '100%';
                  const zoomIn = document.createElement('button');
                  zoomIn.type = 'button';
                  zoomIn.title = 'Zoom in';
                  zoomIn.textContent = '+';
                  const fit = document.createElement('button');
                  fit.type = 'button';
                  fit.title = 'Fit diagram';
                  fit.textContent = 'Fit';
                  let zoom = 1;
                  const updateZoom = () => {
                    svgContainer.style.transform = `scale(${zoom})`;
                    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                  };
                  zoomOut.onclick = () => { zoom = Math.max(0.5, zoom - 0.2); updateZoom(); };
                  zoomIn.onclick = () => { zoom = Math.min(3, zoom + 0.2); updateZoom(); };
                  fit.onclick = () => { zoom = 1; updateZoom(); };
                  controls.append(zoomOut, zoomLabel, zoomIn, fit);
                  viewport.append(svgContainer, controls);
                  el.appendChild(viewport);
                }
              } catch (err) {
                if (el.isConnected) el.innerHTML = `<pre style="color:#f87171;font-size:12px">${err.message || 'Diagram error'}</pre>`;
                try { document.getElementById(id)?.remove(); document.getElementById('c-' + id)?.remove(); } catch {}
              }
            }
          })();
        }).catch(() => {});
      }
    }

    // ── Shiki code highlighting ──
    if (f.codeHighlighting) {
      const codeEls = root.querySelectorAll('pre > code[class*="language-"]');
      if (codeEls.length) {
        import('shiki').then(({ createHighlighter }) => {
          if (isStale()) return;
          const langs = new Set();
          codeEls.forEach(el => { const m = el.className.match(/language-(\w+)/); if (m?.[1] && m[1] !== 'text') langs.add(m[1]); });
          return createHighlighter({ themes: ['vitesse-dark', 'vitesse-light'], langs: [...langs] }).then(hl => {
            if (isStale()) return;
            const theme = isDark ? 'vitesse-dark' : 'vitesse-light';
            codeEls.forEach(codeEl => {
              const pre = codeEl.parentElement;
              if (!pre || pre.dataset.highlighted) return;
              pre.dataset.highlighted = 'true';
              const m = codeEl.className.match(/language-(\w+)/);
              const lang = m?.[1] || 'text';
              const code = codeEl.textContent || '';
              if (lang !== 'text' && langs.has(lang)) {
                try {
                  const html = hl.codeToHtml(code, { lang, theme });
                  const tmp = document.createElement('div'); tmp.innerHTML = html;
                  const shikiPre = tmp.querySelector('pre');
                  if (shikiPre) codeEl.innerHTML = shikiPre.querySelector('code')?.innerHTML || codeEl.innerHTML;
                } catch {}
              }
              // Language label
              pre.style.position = 'relative';
              const label = document.createElement('span');
              label.className = 'lix-code-lang-label';
              label.textContent = lang;
              pre.appendChild(label);
              // Copy button
              const btn = document.createElement('button');
              btn.className = 'lix-code-copy-btn';
              btn.title = 'Copy code';
              btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
              btn.onclick = () => {
                navigator.clipboard.writeText(code);
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                btn.style.color = '#86efac';
                setTimeout(() => { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; btn.style.color = ''; }, 1500);
              };
              pre.appendChild(btn);
            });
          });
        }).catch(() => {});
      }
    }

    // ── Link preview on hover ──
    if (f.linkPreview) {
      const externalLinks = root.querySelectorAll('a[href^="http"]');
      const handlers = [];
      externalLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const onEnter = () => linkPreviewRef.current.show(link, href);
        const onLeave = () => linkPreviewRef.current.cancel();
        link.addEventListener('mouseenter', onEnter);
        link.addEventListener('mouseleave', onLeave);
        handlers.push({ el: link, onEnter, onLeave });
      });
      return () => handlers.forEach(({ el, onEnter, onLeave }) => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      });
    }
  }, [renderedHTML, isDark]);

  return (
    <div className={`lix-preview ${className}`}>
      <div ref={contentRef} className="lix-preview-content" />
      {f.linkPreview && linkPreview.preview && (
        <LinkPreviewTooltip
          anchorEl={linkPreview.preview.anchorEl}
          url={linkPreview.preview.url}
          onClose={linkPreview.hide}
        />
      )}
    </div>
  );
}
