'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import LinkPreviewTooltip, { useLinkPreview } from './LinkPreviewTooltip';
import { readTimeFromWords } from '../../../lib/readTime';
import { escapeHtmlAttribute, normalizeCssColor, normalizeImageUrl, normalizeUrl } from '../../utils/linkHelper';
import { normalizeMermaidSource } from '../../utils/mermaidConfig';
import { renderMermaidSvg } from '../../utils/mermaidRenderer';
import { getLixShikiHighlighter, normalizeShikiLanguage } from '../../utils/shikiHighlighter';
import { clearInheritedBlockTextColors } from '../../utils/blockColorNormalization';
import { normalizeLegacyChecklistBlocks } from '../../utils/checklistBlocks';
import TopicInterestChips from '../TopicInterestChips';

let previewLanguageLoadTail = Promise.resolve();
const previewLoadedLanguages = new Set();

async function getPreviewHighlighter(languages) {
  const highlighter = await getLixShikiHighlighter();
  const missing = [...languages]
    .map(normalizeShikiLanguage)
    .filter((language) => !previewLoadedLanguages.has(language));
  if (missing.length) {
    const load = previewLanguageLoadTail.then(async () => {
      for (const language of missing) {
        if (previewLoadedLanguages.has(language)) continue;
        try {
          await highlighter.loadLanguage(language);
          previewLoadedLanguages.add(language);
        } catch {
          // Unknown language identifiers remain readable as plain code.
        }
      }
    });
    previewLanguageLoadTail = load.catch(() => {});
    await load;
  }
  return highlighter;
}

function FloatingTOC({ headings }) {
  const [activeId, setActiveId] = useState('');
  const listRef = useRef(null);
  const itemRefs = useRef({});
  const [sliderStyle, setSliderStyle] = useState({ top: 0, height: 16 });

  useEffect(() => {
    const els = headings.map(h => document.getElementById(h.id)).filter(Boolean);
    if (els.length === 0) return;

    const onScroll = () => {
      const scrollY = window.scrollY + 120;
      let current = headings[0]?.id || '';
      for (const el of els) {
        if (el.offsetTop <= scrollY) current = el.id;
      }
      setActiveId(current);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);

  // Update slider position and auto-scroll TOC to keep active item visible
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    const item = itemRefs.current[activeId];
    if (!item) return;
    const listRect = listRef.current.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    setSliderStyle({
      top: itemRect.top - listRect.top,
      height: itemRect.height,
    });
    // Keep the item visible by scrolling only the TOC container. scrollIntoView
    // may also move the document viewport in Chromium/WebKit.
    const scrollContainer = listRef.current.closest('.preview-floating-toc');
    const containerRect = scrollContainer?.getBoundingClientRect();
    if (scrollContainer && containerRect) {
      if (itemRect.top < containerRect.top) {
        scrollContainer.scrollBy({ top: itemRect.top - containerRect.top - 8, behavior: 'smooth' });
      } else if (itemRect.bottom > containerRect.bottom) {
        scrollContainer.scrollBy({ top: itemRect.bottom - containerRect.bottom + 8, behavior: 'smooth' });
      }
    }
  }, [activeId]);

  return (
    <nav className="preview-floating-toc">
      <p className="preview-floating-toc-label">On this page</p>
      <div className="relative flex">
        {/* Track line + slider */}
        <div className="relative mr-3 flex-shrink-0" style={{ width: '2px' }}>
          <div className="absolute inset-0 rounded-full" style={{ backgroundColor: 'var(--border-default)' }} />
          <div
            className="absolute left-0 w-full rounded-full transition-all duration-300 ease-out"
            style={{
              backgroundColor: '#9b7bf7',
              top: sliderStyle.top,
              height: sliderStyle.height,
            }}
          />
        </div>
        <ul className="preview-floating-toc-list flex-1" ref={listRef}>
          {headings.map(h => (
            <li key={h.id} ref={el => { itemRefs.current[h.id] = el; }}>
              <a
                href={`#${h.id}`}
                className={`preview-floating-toc-link${h.isSubpage ? ' toc-subpage-link' : ''}`}
                style={{
                  paddingLeft: (h.level - 1) * 12,
                  color: h.id === activeId ? 'var(--text-primary)' : undefined,
                  fontWeight: h.id === activeId ? '600' : undefined,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {h.isSubpage && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                )}
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function renderBlocksToHTML(blocks) {
  if (!blocks || !blocks.length) return '';
  blocks = clearInheritedBlockTextColors(normalizeLegacyChecklistBlocks(blocks));

  const publishedTextColor = (value) => {
    // BlockNote can carry its internal named gray mark out of a code block and
    // into following paragraphs. LixBlogs' explicit Gray option is stored as
    // #9ca3af, so named gray/grey is safe to treat as an inherited default.
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'gray' || normalized === 'grey' || normalized === 'default') return '';
    return normalizeCssColor(value);
  };

  function inlineToHTML(content) {
    if (!content || !Array.isArray(content)) return '';
    return content.map((c) => {
      if (c.type === 'inlineEquation' && c.props?.latex) {
        return `<span class="preview-inline-equation" data-latex="${encodeURIComponent(c.props.latex)}"></span>`;
      }
      if (c.type === 'dateInline' && c.props?.date) {
        let formatted;
        try { formatted = new Date(c.props.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
        catch { formatted = c.props.date; }
        return `<span class="preview-date-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${escapeHtmlAttribute(formatted)}</span>`;
      }
      if (c.type === 'mention' && c.props?.username) {
        const username = String(c.props.username).slice(0, 64);
        const name = c.props.displayName || username;
        const avatarUrl = normalizeImageUrl(c.props.avatarUrl || '');
        const avatar = avatarUrl
          ? `<img src="${escapeHtmlAttribute(avatarUrl)}" alt="" class="mention-chip-avatar">`
          : `<span class="mention-chip-initial">${escapeHtmlAttribute((name || '?')[0].toUpperCase())}</span>`;
        return `<a href="/${encodeURIComponent(username)}" class="mention-chip" data-username="${escapeHtmlAttribute(username)}" data-avatar="${escapeHtmlAttribute(avatarUrl)}" data-displayname="${escapeHtmlAttribute(name)}">${avatar}@${escapeHtmlAttribute(username)}</a>`;
      }
      if (c.type === 'blogMention' && (c.props?.slugid || c.props?.slug)) {
        const blogHref = c.props.author && c.props.slug ? `/${encodeURIComponent(c.props.author)}/${encodeURIComponent(c.props.slug)}` : `/${encodeURIComponent(c.props.slugid)}`;
        return `<a href="${blogHref}" class="mention-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>${escapeHtmlAttribute(c.props.title || 'Untitled blog')}</a>`;
      }
      if (c.type === 'orgMention' && c.props?.slug) {
        return `<a href="/${encodeURIComponent(c.props.slug)}" class="mention-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>@${escapeHtmlAttribute(c.props.slug)}</a>`;
      }
      if (c.type === 'inlineButton') {
        const label = (c.props?.label || 'Button').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const href = escapeHtmlAttribute(normalizeUrl(c.props?.href || ''));
        return href
          ? `<a href="${href}" class="inline-button-chip" target="_blank" rel="ugc nofollow noopener noreferrer">${label}</a>`
          : `<span class="inline-button-chip">${label}</span>`;
      }
      // Links wrap child content — recurse into c.content for the link text
      if (c.type === 'link' && c.href) {
        const normalizedHref = normalizeUrl(c.href);
        const linkText = c.content ? inlineToHTML(c.content) : (c.text || c.href).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const external = /^https?:\/\//i.test(normalizedHref);
        return normalizedHref
          ? `<a href="${escapeHtmlAttribute(normalizedHref)}"${external ? ' rel="ugc nofollow noopener noreferrer"' : ''}>${linkText || escapeHtmlAttribute(c.href)}</a>`
          : linkText;
      }
      let text = (c.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      if (!text) return '';
      const s = c.styles || {};
      if (s.bold) text = `<strong>${text}</strong>`;
      if (s.italic) text = `<em>${text}</em>`;
      if (s.strike) text = `<del>${text}</del>`;
      if (s.code) text = `<code>${text}</code>`;
      if (s.underline) text = `<u>${text}</u>`;
      const textColor = publishedTextColor(s.textColor);
      const backgroundColor = normalizeCssColor(s.backgroundColor);
      if (textColor) text = `<span style="color:${textColor}">${text}</span>`;
      if (backgroundColor) text = `<span style="background:${backgroundColor};border-radius:3px;padding:0 2px">${text}</span>`;
      return text;
    }).join('');
  }

  // Collect ALL headings + subpages recursively for TOC
  const headings = [];
  const seenHeadingIds = new Map();
  const headingIds = new WeakMap();
  const headingIdFor = (block, text) => {
    const hit = headingIds.get(block);
    if (hit) return hit;
    const base = `h-${text.trim().toLowerCase().replace(/[^\w]+/g, '-').slice(0, 40)}`;
    const count = (seenHeadingIds.get(base) || 0) + 1;
    seenHeadingIds.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    headingIds.set(block, id);
    return id;
  };
  const subpageIdFor = (t) => `subpage-${String(t.subpageId || t.title).replace(/[^a-z0-9_-]/gi, '-').slice(0, 20)}`;
  function collectHeadings(blockList) {
    for (const block of blockList) {
      if (block.type === 'heading') {
        const text = (Array.isArray(block.content) ? block.content : []).map(c => c.text || '').join('');
        if (text.trim()) {
          const id = headingIdFor(block, text);
          headings.push({ id, text: text.trim(), level: block.props?.level || 1 });
        }
      }
      if (block.type === 'tabsBlock') {
        let subTabs = [];
        try { subTabs = JSON.parse(block.props?.tabs || '[]'); } catch {}
        subTabs.forEach(t => {
          if (t.title) {
            const id = subpageIdFor(t);
            headings.push({ id, text: t.title, level: 2, isSubpage: true, subpageId: t.subpageId });
          }
        });
      }
      if (block.children?.length) collectHeadings(block.children);
    }
  }
  collectHeadings(blocks);

  // Render a single block to HTML, recursing into children
  function renderBlock(block) {
    const content = inlineToHTML(block.content);
    const childrenHTML = block.children?.length ? renderListGroup(block.children) : '';

    switch (block.type) {
      case 'tableOfContents':
        return '__TOC_PLACEHOLDER__';
      case 'heading': {
        const level = Math.max(1, Math.min(6, Number(block.props?.level) || 1));
        const text = (Array.isArray(block.content) ? block.content : []).map(c => c.text || '').join('');
        const id = headingIdFor(block, text);
        // Headings always render in the default color — ignore stray inline text
        // colors (e.g. a pasted #e06c75) so headings stay visually consistent.
        const headingContent = inlineToHTML(
          (Array.isArray(block.content) ? block.content : []).map(c => (c.styles ? { ...c, styles: { ...c.styles, textColor: undefined, backgroundColor: undefined } } : c))
        );
        return `<h${level} id="${id}">${headingContent}</h${level}>${childrenHTML}`;
      }
      case 'bulletListItem':
        return `<li class="preview-bullet">${content}${childrenHTML}</li>`;
      case 'numberedListItem':
        return `<li class="preview-numbered">${content}${childrenHTML}</li>`;
      case 'checkListItem': {
        const checked = !!block.props?.checked;
        const checkboxHTML = `<span class="preview-checkbox${checked ? ' preview-checkbox--checked' : ''}"><span class="preview-checkbox-icon">${checked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span></span>`;
        return `<li class="preview-check${checked ? ' preview-check--checked' : ''}">${checkboxHTML}<span class="preview-check-text">${content}</span>${childrenHTML}</li>`;
      }
      case 'blockEquation':
        if (block.props?.latex) {
          return `<div class="preview-block-equation" data-latex="${encodeURIComponent(block.props.latex)}"></div>${childrenHTML}`;
        }
        return childrenHTML;
      case 'mermaidBlock':
        if (block.props?.diagram) {
          return `<div class="preview-mermaid-block" data-diagram="${encodeURIComponent(block.props.diagram)}"></div>${childrenHTML}`;
        }
        return childrenHTML;
      case 'tabsBlock': {
        let subTabs = [];
        try { subTabs = JSON.parse(block.props?.tabs || '[]'); } catch {}
        if (subTabs.length === 0) return childrenHTML;
        const tabItems = subTabs.map(t => {
          const href = t.subpageId ? `/${encodeURIComponent(t.subpageId)}` : '#';
          const id = subpageIdFor(t);
          return `<a id="${id}" href="${href}" class="subpage-item" target="_blank" rel="noopener"><div class="subpage-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></div><span class="subpage-title">${escapeHtmlAttribute(t.title || 'Untitled')}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="subpage-arrow"><polyline points="9 18 15 12 9 6"/></svg></a>`;
        }).join('');
        return `<div class="subpage-block">${tabItems}</div>${childrenHTML}`;
      }
      case 'quote':
        return `<blockquote>${content}</blockquote>${childrenHTML}`;
      case 'divider':
        return `<hr class="preview-divider" />${childrenHTML}`;
      case 'codeBlock': {
        const lang = String(block.props?.language || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
        const code = (Array.isArray(block.content) ? block.content : []).map((c) => c.text || '').join('');
        return `<pre><code class="language-${lang}">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>${childrenHTML}`;
      }
      case 'image':
        if (block.props?.url) {
          const imageUrl = normalizeImageUrl(block.props.url);
          if (!imageUrl) return childrenHTML;
          const caption = escapeHtmlAttribute(block.props?.caption || block.props?.name || '');
          return `<figure><img src="${escapeHtmlAttribute(imageUrl)}" alt="${caption}" loading="lazy" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>${childrenHTML}`;
        }
        return childrenHTML;
      case 'table': {
        const tableContent = block.content;
        const rows = tableContent?.rows || [];
        if (rows.length) {
          const headerRows = tableContent?.headerRows || 0;
          let table = '<table>';
          rows.forEach((row, ri) => {
            table += '<tr>';
            (row.cells || []).forEach((cell) => {
              const tag = ri < headerRows ? 'th' : 'td';
              let cellContent;
              if (Array.isArray(cell)) {
                cellContent = cell;
              } else if (cell && typeof cell === 'object' && cell.content) {
                cellContent = Array.isArray(cell.content) ? cell.content : [];
              } else {
                cellContent = [];
              }
              const cellHTML = inlineToHTML(cellContent);
              table += `<${tag}>${cellHTML}</${tag}>`;
            });
            table += '</tr>';
          });
          table += '</table>';
          return table + childrenHTML;
        }
        return childrenHTML;
      }
      case 'paragraph':
        if (content) {
          return `<p>${content}</p>${childrenHTML}`;
        }
        return `<p><br></p>${childrenHTML}`;
      default:
        if (content) {
          return `<p>${content}</p>${childrenHTML}`;
        }
        return childrenHTML || '';
    }
  }

  // Group consecutive list items of the same type into proper <ul>/<ol> wrappers
  function renderListGroup(blockList) {
    if (!blockList || !blockList.length) return '';
    const out = [];
    let i = 0;

    while (i < blockList.length) {
      const block = blockList[i];

      if (block.type === 'bulletListItem') {
        let items = '';
        while (i < blockList.length && blockList[i].type === 'bulletListItem') {
          items += renderBlock(blockList[i]);
          i++;
        }
        out.push(`<ul>${items}</ul>`);
      } else if (block.type === 'numberedListItem') {
        let items = '';
        while (i < blockList.length && blockList[i].type === 'numberedListItem') {
          items += renderBlock(blockList[i]);
          i++;
        }
        out.push(`<ol>${items}</ol>`);
      } else if (block.type === 'checkListItem') {
        let items = '';
        while (i < blockList.length && blockList[i].type === 'checkListItem') {
          items += renderBlock(blockList[i]);
          i++;
        }
        out.push(`<ul class="preview-checklist">${items}</ul>`);
      } else {
        out.push(renderBlock(block));
        i++;
      }
    }
    return out.join('\n');
  }

  let html = renderListGroup(blocks);

  // Build inline TOC HTML matching the editor's toc-block style
  let tocHTML = '';
  if (headings.length > 0) {
    const tocItems = headings.map(h => {
      const indent = (h.level - 1) * 16;
      const icon = h.isSubpage ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;margin-right:4px;vertical-align:-1px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' : '';
      return `<li><a href="#${escapeHtmlAttribute(h.id)}" class="preview-toc-link${h.isSubpage ? ' toc-subpage-link' : ''}" style="padding-left:${indent}px">${icon}${escapeHtmlAttribute(h.text)}</a></li>`;
    }).join('');
    tocHTML = `<div class="preview-toc-block"><p class="preview-toc-label">Table of Contents</p><ul class="preview-toc-list">${tocItems}</ul></div>`;
  }

  // Replace TOC placeholder with inline TOC block
  html = html.replace('__TOC_PLACEHOLDER__', tocHTML);

  return html;
}

export default function BlogPreview({
  paywalled = false, title, subtitle, coverPreview, coverZoom, coverPos, pageEmoji, tags, html, blocks, user, org, coAuthorCount, coAuthors = [], wordCount, followSlot = null, memberOnly = false, featured = false, publishedAt = null, headerActions = null, hideHighlights = false, readTimeMinutes = 0, anonymous = false, readerMode = false, readerAside = null }) {
  const { isDark } = useTheme();
  const contentRef = useRef(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const linkPreview = useLinkPreview();
  const linkPreviewRef = useRef(linkPreview);
  linkPreviewRef.current = linkPreview;
  const [mentionCard, setMentionCard] = useState(null);
  const mentionTimerRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setShowBackToTop(window.scrollY > 400);
          const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
          const progress = scrollHeight > 0 ? window.scrollY / scrollHeight : 0;
          setScrollProgress(Math.min(1, Math.max(0, progress)));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Determine which HTML to use — prefer blocks-based rendering
  const safeBlocks = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks]);
  const renderedHTML = useMemo(
    () => (safeBlocks.length > 0 ? renderBlocksToHTML(safeBlocks) : html),
    [safeBlocks, html],
  );

  // Extract headings + subpages for floating TOC
  const headings = useMemo(() => {
    const result = [];
    for (const b of safeBlocks) {
      if (b.type === 'heading' && Array.isArray(b.content) && b.content.length > 0) {
        const text = b.content.map(c => c.text || '').join('');
        if (text.trim()) {
          result.push({ id: `h-${text.trim().toLowerCase().replace(/[^\w]+/g, '-').slice(0, 40)}`, text: text.trim(), level: b.props?.level || 1 });
        }
      }
      if (b.type === 'tabsBlock') {
        let tabs = [];
        try { tabs = JSON.parse(b.props?.tabs || '[]'); } catch {}
        tabs.forEach(t => {
          if (t.title) {
            result.push({ id: `subpage-${(t.subpageId || t.title).slice(0, 20)}`, text: t.title, level: 2, isSubpage: true });
          }
        });
      }
    }
    return result;
  }, [safeBlocks]);

  // Set innerHTML via ref so React never overwrites our post-processed DOM.
  // Then render KaTeX, mermaid, Shiki into the live DOM elements.
  const effectGenRef = useRef(0);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const gen = ++effectGenRef.current;
    const mermaidWindowHandlers = [];
    const mermaidController = new AbortController();
    const mermaidFullscreenCleanups = new Set();

    // Set the base HTML — we own the DOM from here, React won't touch it
    root.innerHTML = renderedHTML || '';

    // Strip \[...\], $$...$$, \(...\), $...$ wrappers — KaTeX expects inner expression only
    function stripDelimiters(raw) {
      let s = raw.trim();
      if (s.startsWith('\\[') && s.endsWith('\\]')) return s.slice(2, -2).trim();
      if (s.startsWith('$$') && s.endsWith('$$')) return s.slice(2, -2).trim();
      if (s.startsWith('\\(') && s.endsWith('\\)')) return s.slice(2, -2).trim();
      if (s.startsWith('$') && s.endsWith('$') && s.length > 2) return s.slice(1, -1).trim();
      return s;
    }

    // Check if this effect is still the current one
    function isStale() { return effectGenRef.current !== gen; }
    function showRenderError(element, message, tag = 'span') {
      const error = document.createElement(tag);
      error.style.color = '#f87171';
      if (tag === 'pre') error.style.fontSize = '12px';
      error.textContent = String(message || 'Render error');
      element.replaceChildren(error);
    }

    // ── KaTeX: block + inline equations ──
    const eqEls = root.querySelectorAll('.preview-block-equation[data-latex]');
    const inlineEls = root.querySelectorAll('.preview-inline-equation[data-latex]');
    if (eqEls.length || inlineEls.length) {
      import('katex').then((mod) => {
        if (isStale()) return;
        const katex = mod.default || mod;
        eqEls.forEach((el) => {
          if (!el.isConnected) return;
          try {
            const latex = stripDelimiters(decodeURIComponent(el.dataset.latex));
            el.innerHTML = katex.renderToString(latex, { displayMode: true, throwOnError: false });
          } catch (err) {
            showRenderError(el, err?.message, 'span');
          }
        });
        inlineEls.forEach((el) => {
          if (!el.isConnected) return;
          try {
            const latex = stripDelimiters(decodeURIComponent(el.dataset.latex));
            el.innerHTML = katex.renderToString(latex, { displayMode: false, throwOnError: false });
          } catch (err) {
            showRenderError(el, err?.message, 'span');
          }
        });
      }).catch(() => {});
    }

    // ── Mermaid diagrams (matches editor MermaidBlock config) ──
    const mermaidEls = root.querySelectorAll('.preview-mermaid-block[data-diagram]');
    if (mermaidEls.length) {
      Promise.resolve().then(() => {
        if (isStale()) return;
        // Render all diagrams — don't bail early on stale, just skip applying to unmounted elements
        async function openFullscreenMermaid(diagramText, isDark) {
          const fullscreenController = new AbortController();
          const overlay = document.createElement('div');
          overlay.className = 'mermaid-fullscreen-overlay';
          overlay.setAttribute('role', 'dialog');
          overlay.setAttribute('aria-modal', 'true');
          overlay.setAttribute('aria-label', 'Fullscreen Mermaid Diagram');

          const header = document.createElement('div');
          header.className = 'mermaid-fullscreen-header';

          const title = document.createElement('span');
          title.className = 'mermaid-fullscreen-title';
          title.textContent = 'Mermaid Diagram';
          header.appendChild(title);

          const controls = document.createElement('div');
          controls.className = 'mermaid-fullscreen-controls';

          const zoomInBtn = document.createElement('button');
          zoomInBtn.className = 'mermaid-fullscreen-btn zoom-in';
          zoomInBtn.title = 'Zoom in';
          zoomInBtn.setAttribute('aria-label', 'Zoom in');
          zoomInBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

          const zoomLabel = document.createElement('span');
          zoomLabel.className = 'mermaid-fullscreen-zoom-label';
          zoomLabel.textContent = '100%';

          const zoomOutBtn = document.createElement('button');
          zoomOutBtn.className = 'mermaid-fullscreen-btn zoom-out';
          zoomOutBtn.title = 'Zoom out';
          zoomOutBtn.setAttribute('aria-label', 'Zoom out');
          zoomOutBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

          const resetBtn = document.createElement('button');
          resetBtn.className = 'mermaid-fullscreen-btn zoom-reset';
          resetBtn.title = 'Reset view';
          resetBtn.setAttribute('aria-label', 'Reset view');
          resetBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="1 4 1 10 7 10"/></svg>`;

          const closeBtn = document.createElement('button');
          closeBtn.className = 'mermaid-fullscreen-btn close-btn';
          closeBtn.title = 'Close fullscreen';
          closeBtn.setAttribute('aria-label', 'Close fullscreen');
          closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

          controls.appendChild(zoomInBtn);
          controls.appendChild(zoomLabel);
          controls.appendChild(zoomOutBtn);
          controls.appendChild(resetBtn);
          controls.appendChild(closeBtn);
          header.appendChild(controls);
          overlay.appendChild(header);

          const contentEl = document.createElement('div');
          contentEl.className = 'mermaid-fullscreen-content';

          const svgContainer = document.createElement('div');
          svgContainer.className = 'mermaid-fullscreen-svg-container';
          contentEl.appendChild(svgContainer);
          overlay.appendChild(contentEl);

          document.body.appendChild(overlay);
          closeBtn.focus();
          document.body.style.overflow = 'hidden';

          const closeFullscreen = () => {
            fullscreenController.abort();
            overlay.remove();
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
            mermaidFullscreenCleanups.delete(closeFullscreen);
          };

          const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
              closeFullscreen();
            }
          };
          window.addEventListener('keydown', handleKeyDown);
          mermaidFullscreenCleanups.add(closeFullscreen);

          closeBtn.addEventListener('click', closeFullscreen);

          let zoom = 1;
          let pan = { x: 0, y: 0 };
          let isDragging = false;
          let dragStart = { x: 0, y: 0 };
          let panStart = { ...pan };

          const updateTransform = () => {
            svgContainer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
            zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
          };

          contentEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            zoom = Math.min(5, Math.max(0.2, zoom + delta));
            updateTransform();
          }, { passive: false });

          contentEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
            panStart = { ...pan };
            contentEl.style.cursor = 'grabbing';
          });

          const handleMouseMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            pan = { x: panStart.x + dx, y: panStart.y + dy };
            updateTransform();
          };

          const handleMouseUp = () => {
            if (isDragging) {
              isDragging = false;
              contentEl.style.cursor = '';
            }
          };

          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.removedNodes.forEach((node) => {
                if (node === overlay) {
                  window.removeEventListener('mousemove', handleMouseMove);
                  window.removeEventListener('mouseup', handleMouseUp);
                  observer.disconnect();
                }
              });
            });
          });
          observer.observe(document.body, { childList: true });

          zoomInBtn.addEventListener('click', () => {
            zoom = Math.min(5, zoom + 0.2);
            updateTransform();
          });

          zoomOutBtn.addEventListener('click', () => {
            zoom = Math.max(0.2, zoom - 0.2);
            updateTransform();
          });

          resetBtn.addEventListener('click', () => {
            zoom = 1;
            pan = { x: 0, y: 0 };
            updateTransform();
          });

          try {
            svgContainer.innerHTML = await renderMermaidSvg(
              diagramText,
              isDark,
              fullscreenController.signal,
            );
          } catch (err) {
            if (err?.name !== 'AbortError') {
              showRenderError(svgContainer, err?.message || 'Diagram error', 'pre');
            }
          }
        }

        (async () => {
          for (const el of mermaidEls) {
            try {
              const diagram = normalizeMermaidSource(
                decodeURIComponent(el.dataset.diagram),
              );
              const svg = await renderMermaidSvg(
                diagram,
                isDark,
                mermaidController.signal,
              );

              // Only apply if element is still in the DOM and this is the current effect
              if (el.isConnected && !isStale()) {
                el.innerHTML = '';

                const wrapper = document.createElement('div');
                wrapper.className = 'preview-mermaid-wrapper';

                const svgContainer = document.createElement('div');
                svgContainer.className = 'preview-mermaid-svg-container';
                svgContainer.innerHTML = svg;

                let zoom = 1;
                let panX = 0;
                let panY = 0;
                const updateView = () => {
                  svgContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
                  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                };

                const controls = document.createElement('div');
                controls.className = 'preview-mermaid-controls';

                const zoomOutBtn = document.createElement('button');
                zoomOutBtn.type = 'button';
                zoomOutBtn.title = 'Zoom out';
                zoomOutBtn.setAttribute('aria-label', 'Zoom out');
                zoomOutBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';

                const zoomLabel = document.createElement('span');
                zoomLabel.className = 'preview-mermaid-zoom-label';
                zoomLabel.textContent = '100%';

                const zoomInBtn = document.createElement('button');
                zoomInBtn.type = 'button';
                zoomInBtn.title = 'Zoom in';
                zoomInBtn.setAttribute('aria-label', 'Zoom in');
                zoomInBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.title = 'Reset view';
                resetBtn.setAttribute('aria-label', 'Reset view');
                resetBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="1 4 1 10 7 10"/></svg>';

                const fsBtn = document.createElement('button');
                fsBtn.type = 'button';
                fsBtn.className = 'preview-mermaid-fullscreen-btn';
                fsBtn.title = 'Open fullscreen';
                fsBtn.setAttribute('aria-label', 'Open fullscreen');
                fsBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;

                fsBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openFullscreenMermaid(diagram, isDark);
                });

                zoomOutBtn.addEventListener('click', () => {
                  zoom = Math.max(0.5, zoom - 0.2);
                  updateView();
                });
                zoomInBtn.addEventListener('click', () => {
                  zoom = Math.min(3, zoom + 0.2);
                  updateView();
                });
                resetBtn.addEventListener('click', () => {
                  zoom = 1;
                  panX = 0;
                  panY = 0;
                  updateView();
                });

                let dragging = false;
                let dragX = 0;
                let dragY = 0;
                let startX = 0;
                let startY = 0;
                svgContainer.addEventListener('mousedown', (event) => {
                  if (event.button !== 0 || zoom <= 1) return;
                  event.preventDefault();
                  dragging = true;
                  startX = event.clientX;
                  startY = event.clientY;
                  dragX = panX;
                  dragY = panY;
                  wrapper.classList.add('is-panning');
                });
                const handleInlineMermaidMove = (event) => {
                  if (!dragging) return;
                  panX = dragX + event.clientX - startX;
                  panY = dragY + event.clientY - startY;
                  updateView();
                };
                const handleInlineMermaidUp = () => {
                  dragging = false;
                  wrapper.classList.remove('is-panning');
                };
                window.addEventListener('mousemove', handleInlineMermaidMove);
                window.addEventListener('mouseup', handleInlineMermaidUp);
                mermaidWindowHandlers.push({
                  move: handleInlineMermaidMove,
                  up: handleInlineMermaidUp,
                });

                wrapper.appendChild(svgContainer);
                controls.appendChild(zoomInBtn);
                controls.appendChild(zoomLabel);
                controls.appendChild(zoomOutBtn);
                controls.appendChild(resetBtn);
                wrapper.appendChild(controls);
                wrapper.appendChild(fsBtn);
                el.appendChild(wrapper);
              }
            } catch (err) {
              if (err?.name !== 'AbortError' && el.isConnected && !isStale()) {
                showRenderError(el, err?.message || 'Diagram error', 'pre');
              }
            }
          }
        })();
      }).catch(() => {});
    }

    // ── Code blocks: Shiki syntax highlighting + language label + copy button ──
    const codeEls = root.querySelectorAll('pre > code[class*="language-"]');
    if (codeEls.length) {
      const langs = new Set();
      codeEls.forEach((el) => {
        const m = el.className.match(/language-(\w+)/);
        if (m && m[1] && m[1] !== 'text') langs.add(m[1]);
      });
      getPreviewHighlighter(langs).then((highlighter) => {
          if (isStale()) return;
          const shikiTheme = isDark ? 'vitesse-dark' : 'vitesse-light';
          codeEls.forEach((codeEl) => {
            const pre = codeEl.parentElement;
            if (!pre || pre.dataset.highlighted) return;
            pre.dataset.highlighted = 'true';
            const m = codeEl.className.match(/language-(\w+)/);
            const lang = m?.[1] || 'text';
            const code = codeEl.textContent || '';

            // Apply Shiki highlighting — use CSS vars for bg/color, only take token spans
            if (lang !== 'text' && langs.has(lang)) {
              try {
                const highlighted = highlighter.codeToHtml(code, { lang, theme: shikiTheme });
                const tmp = document.createElement('div');
                tmp.innerHTML = highlighted;
                const shikiPre = tmp.querySelector('pre');
                if (shikiPre) {
                  codeEl.innerHTML = shikiPre.querySelector('code')?.innerHTML || codeEl.innerHTML;
                }
              } catch {}
            }

            // Language label (matches editor .code-lang-label)
            pre.style.position = 'relative';
            const label = document.createElement('span');
            label.className = 'preview-code-lang-label';
            label.textContent = lang || 'text';
            pre.appendChild(label);

            // Copy button (matches editor .code-copy-btn)
            const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            const btn = document.createElement('button');
            btn.className = 'preview-code-copy-btn';
            btn.title = 'Copy code';
            btn.innerHTML = copyIcon;
            btn.onclick = () => {
              navigator.clipboard.writeText(code);
              btn.innerHTML = checkIcon;
              btn.style.color = '#86efac';
              setTimeout(() => { btn.innerHTML = copyIcon; btn.style.color = ''; }, 1500);
            };
            pre.appendChild(btn);
          });
      }).catch((err) => console.error('Shiki load failed:', err));
    }

    // ── Inline TOC smooth scroll ──
    const tocLinks = root.querySelectorAll('.preview-toc-link');
    tocLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = link.getAttribute('href')?.slice(1);
        if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // ── Link preview on hover (use ref to avoid stale closures) ──
    const externalLinks = root.querySelectorAll('a[href^="http"]:not(.mention-chip):not(.preview-toc-link):not(.link-preview-card)');
    const linkHandlers = [];
    externalLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const onEnter = () => linkPreviewRef.current.show(link, href);
      const onLeave = () => linkPreviewRef.current.cancel();
      link.addEventListener('mouseenter', onEnter);
      link.addEventListener('mouseleave', onLeave);
      linkHandlers.push({ el: link, onEnter, onLeave });
    });

    // ── Mention hover cards ──
    const mentionChips = root.querySelectorAll('.mention-chip[data-username]');
    const mentionHandlers = [];
    mentionChips.forEach((chip) => {
      const onEnter = () => {
        clearTimeout(mentionTimerRef.current);
        mentionTimerRef.current = setTimeout(() => {
          const rect = chip.getBoundingClientRect();
          setMentionCard({
            username: chip.dataset.username,
            displayName: chip.dataset.displayname || chip.dataset.username,
            avatar: chip.dataset.avatar || '',
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
          });
        }, 300);
      };
      const onLeave = () => {
        clearTimeout(mentionTimerRef.current);
        mentionTimerRef.current = setTimeout(() => setMentionCard(null), 200);
      };
      chip.addEventListener('mouseenter', onEnter);
      chip.addEventListener('mouseleave', onLeave);
      mentionHandlers.push({ el: chip, onEnter, onLeave });
    });

    const handleModifierClick = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const link = e.target.closest('a[href]');
      if (!link) return;

      if (link.closest('.mention-chip') || link.closest('.subpage-item') || link.closest('.preview-toc-link')) {
        return;
      }

      const href = link.getAttribute('href');
      if (href) {
        const normalized = normalizeUrl(href);
        if (!normalized || normalized.startsWith('/') || normalized.startsWith('#')) return;
        e.preventDefault();
        e.stopPropagation();
        window.open(normalized, '_blank', 'noopener,noreferrer');
      }
    };
    root.addEventListener('click', handleModifierClick);

    return () => {
      mermaidController.abort();
      [...mermaidFullscreenCleanups].forEach((close) => close());
      root.removeEventListener('click', handleModifierClick);
      linkHandlers.forEach(({ el, onEnter, onLeave }) => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      });
      mentionHandlers.forEach(({ el, onEnter, onLeave }) => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      });
      mermaidWindowHandlers.forEach(({ move, up }) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      });
      clearTimeout(mentionTimerRef.current);
    };
  }, [renderedHTML, isDark]);

  return (
    <div className="blog-preview" id="blog-preview-top">
      {readerMode && (
        <div className="reader-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>
      )}
      {/* Floating TOC with scroll spy */}
      {headings.length >= 2 && <FloatingTOC headings={headings} />}

      {/* Back to top — only visible after scrolling down */}
      {showBackToTop && (
        <button
          className="preview-back-to-top"
          onClick={() => document.getElementById('blog-preview-top')?.scrollIntoView({ behavior: 'smooth' })}
          title="Back to top"
          aria-label="Back to the beginning of this story"
        >
          <svg width="40" height="40" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', transform: 'rotate(-90deg)' }}>
            <circle
              cx="20"
              cy="20"
              r="18"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={2 * Math.PI * 18 * (1 - scrollProgress)}
              strokeLinecap="round"
            />
          </svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
      )}
      <section className="blog-preview-hero" aria-labelledby={readerMode ? 'story-title' : undefined}>
      {/* Cover + emoji */}
      <div className="blog-preview-visual relative mb-2">
        {coverPreview && (
          <div className="blog-preview-cover rounded-xl overflow-hidden">
            <img
              src={coverPreview}
              alt={title ? `${title} cover` : 'Story cover'}
              className="w-full h-full object-cover"
              style={{
                objectPosition: `${coverPos?.x ?? 50}% ${coverPos?.y ?? 50}%`,
                transform: `scale(${coverZoom || 1})`,
              }}
            />
          </div>
        )}

        {pageEmoji && (
          <div
            style={{
              position: coverPreview ? 'absolute' : 'relative',
              bottom: coverPreview ? '-24px' : 'auto',
              left: '16px',
              zIndex: 10,
            }}
          >
            <div className="w-[72px] h-[72px] rounded-full bg-[var(--bg-app)] border-[3px] border-[var(--bg-app)] shadow-lg flex items-center justify-center relative">
              <span className="text-[42px] leading-none select-none">{pageEmoji}</span>
              <div className="absolute inset-[-2px] rounded-full border border-[var(--border-default)]" />
            </div>
          </div>
        )}

        {/* Spacer when emoji overlaps cover */}
        {pageEmoji && coverPreview && <div className="h-8" />}
      </div>

      <div className="blog-preview-header">
      {/* Badges — Member-only / Featured */}
      {(memberOnly || featured) && (
        <div className="blog-preview-badges flex items-center gap-2 mt-6 mb-3">
          {memberOnly && (
            <span className="flex items-center gap-1.5 text-[13px] px-3 py-1 rounded-full" style={{ border: '1px solid var(--border-default)', color: 'var(--text-body)' }}>
              <ion-icon name="sparkles" style={{ fontSize: '13px', color: '#e8a840' }} /> Member-only story
            </span>
          )}
          {featured && (
            <span className="flex items-center gap-1.5 text-[13px] px-3 py-1 rounded-full" style={{ border: '1px solid var(--border-default)', color: 'var(--text-body)' }}>
              <ion-icon name="ribbon-outline" style={{ fontSize: '14px', color: '#9b7bf7' }} /> Featured
            </span>
          )}
        </div>
      )}

      {/* Title */}
      {title && (
        <h1 id={readerMode ? 'story-title' : undefined} className={`blog-preview-title text-[2.2em] font-extrabold leading-tight ${(memberOnly || featured) ? 'mt-0' : 'mt-6'} mb-2`} style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>{title}</h1>
      )}

      {/* Subtitle */}
      {subtitle && (
        <p className="blog-preview-subtitle text-xl mb-3" style={{ color: 'var(--text-muted)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{subtitle}</p>
      )}

      {/* Tags — directly under the title */}
      {tags.length > 0 && (
        <div className="blog-preview-topics">
        {readerMode ? <TopicInterestChips tags={tags} /> : (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag) => (
              <span key={tag} className="px-2.5 py-0.5 bg-[#9b7bf70a] rounded-full text-[13px] text-[#9b7bf7]">
                #{tag}
              </span>
            ))}
          </div>
        )}
        </div>
      )}

      {/* Author bar — under title. Primary author + accepted co-authors, with
          stacked avatars and top-3 names (+ "N more"). */}
      {user && (() => {
        // Secret blog: force a single anonymous byline no matter what the caller
        // passed. The server already strips these fields; refusing to render them
        // here too means a future caller can't reintroduce the leak by accident.
        const authors = anonymous
          ? [{ name: 'Anonymous', avatar_url: null, username: null }]
          : [
            { name: user.display_name || user.username || 'Author', designation: user.designation, avatar_url: user.avatar_url, username: user.username },
            // Co-authors come from /api/resolve with display_name/username — normalize
            // to `name` so their names actually render (not just the primary author).
            ...coAuthors.map((c) => ({
              name: c.name || c.display_name || c.username || 'Author',
              designation: c.designation,
              avatar_url: c.avatar_url,
              username: c.username,
            })),
          ];
        const shownAvatars = authors.slice(0, 3);
        const moreAuthors = authors.length - shownAvatars.length;
        const shownNames = authors.slice(0, 3);
        const moreNames = authors.length - shownNames.length;
        return (
          <div className="blog-preview-byline flex items-center gap-3 mt-1 mb-2">
            <div className="flex -space-x-2 items-center">
              {shownAvatars.map((a, i) => {
                const avatar = a.avatar_url ? (
                  <img src={a.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-[var(--bg-app)]" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--bg-app)] flex items-center justify-center text-[11px] font-bold text-[var(--text-muted)]">
                    {(a.name || '?')[0].toUpperCase()}
                  </span>
                );
                return a.username ? (
                  <a
                    key={a.username}
                    href={`/${encodeURIComponent(a.username)}`}
                    title={`View ${a.name}'s profile`}
                    aria-label={`View ${a.name}'s public profile`}
                    className="relative rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7bf7]"
                  >
                    {avatar}
                  </a>
                ) : (
                  <span key={`anonymous-${i}`} title={a.name} className="relative rounded-full">{avatar}</span>
                );
              })}
              {moreAuthors > 0 && (
                <div title={`${moreAuthors} more`} className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--bg-app)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
                  +{moreAuthors}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-faint)] flex-wrap">
              {org && (
                <>
                  <span className="text-[var(--text-secondary)] font-medium">{org.name}</span>
                  <span className="text-[var(--text-faint)]">·</span>
                </>
              )}
              <span className="text-[var(--text-muted)] font-medium">
                {shownNames.map((a, index) => (
                  <span key={a.username || `anonymous-${index}`}>
                    {index > 0 && ', '}
                    {a.username ? (
                      <a
                        href={`/${encodeURIComponent(a.username)}`}
                        className="hover:text-[#9b7bf7] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7bf7] rounded-sm"
                        aria-label={`View ${a.name}'s public profile`}
                      >
                        {a.name}
                      </a>
                    ) : a.name}
                  </span>
                ))}
              </span>
              {moreNames > 0 && (
                <span className="text-[var(--text-faint)]">+ {moreNames} more</span>
              )}
              {!anonymous && authors.length === 1 && authors[0].designation && (
                <>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-secondary)]">{authors[0].designation}</span>
                </>
              )}
              <span className="text-[var(--text-faint)]">·</span>
              <span>{readTimeMinutes > 0 ? readTimeMinutes : readTimeFromWords(wordCount)} min read</span>
              {publishedAt && (
                <>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span>{new Date(publishedAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </>
              )}
            </div>
            {followSlot && <div className="ml-auto flex items-center gap-2">{followSlot}</div>}
          </div>
        );
      })()}
      </div>
      </section>

      {/* Header action bar (clap / comment / repost / save / share) */}
      {headerActions && (
        <div className="blog-preview-actions py-2 mb-1" style={{ borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
          {headerActions}
        </div>
      )}

      {/* Gap before content */}
      <div style={{ height: '32px' }} />

      <div className={`blog-preview-body ${readerAside ? 'has-reader-aside' : ''}`}>
        {readerAside}
        <div className={hideHighlights ? 'hide-highlights' : ''}>
          {renderedHTML ? (
            <div
              ref={contentRef}
              className={`blog-preview-content max-w-none ${paywalled ? 'relative pb-10 overflow-hidden mask-bottom' : ''}`}
              style={paywalled ? { WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maxHeight: '400px' } : {}}
            />
          ) : (
            <p className="text-[var(--text-faint)] italic">Start writing to see a preview...</p>
          )}
        </div>
      </div>

      {paywalled && (
        <div className="mt-8 p-6 rounded-2xl text-center" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--accent)30' }}>
          <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
             <ion-icon name="lock-closed" style={{ fontSize: '24px', color: 'var(--accent)' }} />
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>This story is for members only.</h3>
          <p className="text-[14px] mb-6" style={{ color: 'var(--text-muted)' }}>Sign up for a member tier to read the full story and support the author.</p>
          <a href="/pricing" className="inline-block px-6 py-2.5 rounded-full text-[14px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)' }}>
            View Plans
          </a>
        </div>
      )}

      {/* Link preview tooltip */}
      {linkPreview.preview && (
        <LinkPreviewTooltip
          anchorEl={linkPreview.preview.anchorEl}
          url={linkPreview.preview.url}
          onClose={linkPreview.hide}
        />
      )}

      {/* Mention hover card */}
      {mentionCard && (
        <div
          className="mention-hover-card"
          style={{ top: mentionCard.top, left: mentionCard.left }}
          onMouseEnter={() => clearTimeout(mentionTimerRef.current)}
          onMouseLeave={() => { mentionTimerRef.current = setTimeout(() => setMentionCard(null), 150); }}
        >
          <div className="mention-hover-card-header">
            {mentionCard.avatar ? (
              <img src={mentionCard.avatar} alt="" className="mention-hover-card-avatar" />
            ) : (
              <div className="mention-hover-card-initial">
                {(mentionCard.displayName || '?')[0].toUpperCase()}
              </div>
            )}
            <div>
              <div className="mention-hover-card-name">{mentionCard.displayName}</div>
              <div className="mention-hover-card-username">@{mentionCard.username}</div>
            </div>
          </div>
          <a href={`/${mentionCard.username}`} className="mention-hover-card-link">
            View profile
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
          </a>
        </div>
      )}
    </div>
  );
}
