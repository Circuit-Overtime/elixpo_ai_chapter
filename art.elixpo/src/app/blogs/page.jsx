'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar/Navbar';
import styles from './Blogs.module.css';

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

export default function BlogsPage() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    // Load blog manifest
    const blogFiles = ['elixpo_art'];
    Promise.all(
      blogFiles.map(async (slug) => {
        try {
          const res = await fetch(`/content/blogs/${slug}.md`);
          if (!res.ok) return null;
          const raw = await res.text();
          const { meta } = parseFrontmatter(raw);
          return { slug, ...meta };
        } catch {
          return null;
        }
      })
    ).then((results) => setPosts(results.filter(Boolean)));
  }, []);

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.brushStroke1} aria-hidden="true" />
        <div className={styles.brushStroke2} aria-hidden="true" />

        <div className={styles.header}>
          <h1 className={styles.title}>
            <span className={styles.brushAccent}>Blog</span>
          </h1>
          <p className={styles.subtitle}>Stories, updates, and creative insights from the Elixpo team</p>
        </div>

        <div className={styles.grid}>
          {posts.map((post) => (
            <a key={post.slug} href={`/blogs/${post.slug}`} className={styles.card}>
              <div className={styles.cardInner}>
                {post.cover && (
                  <div className={styles.cardCover}>
                    <img src={post.cover} alt="" className={styles.cardCoverImg} />
                    <div className={styles.cardCoverOverlay} />
                  </div>
                )}
                <div className={styles.cardContent}>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardDate}>{post.date}</span>
                    {post.author && <span className={styles.cardAuthor}>{post.author}</span>}
                  </div>
                  <h2 className={styles.cardTitle}>{post.title}</h2>
                  {post.excerpt && <p className={styles.cardExcerpt}>{post.excerpt}</p>}
                  {Array.isArray(post.tags) && (
                    <div className={styles.cardTags}>
                      {post.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.cardGlow} />
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
