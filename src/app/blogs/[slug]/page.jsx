'use client';

import { useState, useEffect, use } from 'react';
import Navbar from '../../components/Navbar/Navbar';
import styles from '../Blogs.module.css';

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };
  const meta = {};
  match[1].split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/"/g, ''));
    }
    meta[key] = val;
  });
  return { meta, content: match[2] };
}

function renderMarkdown(md) {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr />')
    // Paragraphs
    .split('\n\n')
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h') || block.startsWith('<hr') || block.startsWith('<li>')) {
        // Wrap consecutive <li> in <ul>
        if (block.includes('<li>')) {
          return `<ul>${block}</ul>`;
        }
        return block;
      }
      return `<p>${block.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');

  return html;
}

export default function BlogPostPage({ params }) {
  const { slug } = use(params);
  const [meta, setMeta] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/content/blogs/${slug}.md`);
        if (!res.ok) throw new Error('Not found');
        const raw = await res.text();
        const parsed = parseFrontmatter(raw);
        setMeta(parsed.meta);
        setContent(parsed.content);
      } catch {
        setMeta(null);
        setContent('');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className={styles.page}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.loading}>Loading...</div>
        </main>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className={styles.page}>
        <Navbar />
        <main className={styles.main}>
          <div className={styles.notFound}>
            <h1>Post not found</h1>
            <a href="/blogs" className={styles.backLink}>Back to Blog</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.brushStroke1} aria-hidden="true" />
        <div className={styles.brushStroke2} aria-hidden="true" />

        <article className={styles.article}>
          <a href="/blogs" className={styles.backLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            All posts
          </a>

          <header className={styles.articleHeader}>
            <div className={styles.articleMeta}>
              <span className={styles.cardDate}>{meta.date}</span>
              {meta.author && <span className={styles.cardAuthor}>{meta.author}</span>}
            </div>
            <h1 className={styles.articleTitle}>{meta.title}</h1>
            {meta.excerpt && <p className={styles.articleExcerpt}>{meta.excerpt}</p>}
            {Array.isArray(meta.tags) && (
              <div className={styles.cardTags}>
                {meta.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            )}
          </header>

          <div className={styles.articleDivider}>
            <svg viewBox="0 0 200 12" className={styles.brushDivider}>
              <path d="M0 6 Q 25 0, 50 6 T 100 6 T 150 6 T 200 6" stroke="url(#brushGrad)" strokeWidth="3" fill="none" strokeLinecap="round" />
              <defs>
                <linearGradient id="brushGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8d49fd" stopOpacity="0.6" />
                  <stop offset="50%" stopColor="#5691f3" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06d6a0" stopOpacity="0.3" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div
            className={styles.articleBody}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </article>
      </main>
    </div>
  );
}
