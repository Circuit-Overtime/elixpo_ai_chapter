"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* Hand-rolled minimal Markdown → HTML renderer.
 *
 * Why not react-markdown / marked / micromark?
 *   • ~30-80 KB gzipped — too much for what's effectively a
 *     CONTRIBUTING.md panel that renders once on one route.
 *   • Most of the bundle is feature-completeness we don't need
 *     (math, mermaid, smart quotes, footnotes).
 *
 * Supported subset (what CONTRIBUTING.md actually uses):
 *   • # / ## / ### / #### headings
 *   • bullet lists (`- ` and `* `)
 *   • numbered lists (`1. `)
 *   • bold `**`, italic `*`, inline code `` ` ``
 *   • fenced code blocks ``` lang
 *   • blockquotes (`> `)
 *   • links `[text](url)`
 *   • horizontal rules `---`
 *   • paragraphs
 *
 * Everything else falls through as a plain paragraph — safe because
 * we sanitise raw HTML in the source on the way in.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // inline code first so its content isn't re-interpreted
  out = out.replace(/`([^`]+)`/g,
    '<code class="rounded bg-bg-raised px-1.5 py-0.5 font-mono text-[0.92em] text-primary">$1</code>');
  // bold (avoid clobbering italics underneath)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // links — only inline form, [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">$1</a>');
  return out;
}

function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="my-3 leading-relaxed text-text-dim">${renderInline(para.join(" "))}</p>`);
      para = [];
    }
  };

  for (let raw of lines) {
    // ── fenced code blocks ──
    const fence = raw.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inCode) {
        out.push(
          `<pre class="my-4 overflow-x-auto rounded-md border border-border bg-bg-raised p-4 text-sm leading-relaxed"><code class="font-mono text-text">` +
          escapeHtml(codeBuf.join("\n")) +
          `</code></pre>`,
        );
        inCode = false;
        codeBuf = [];
        codeLang = "";
      } else {
        flushPara(); closeList();
        inCode = true;
        codeLang = fence[1] || "";
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    // ── horizontal rule ──
    if (/^---+\s*$/.test(raw)) {
      flushPara(); closeList();
      out.push(`<hr class="my-8 border-border/60" />`);
      continue;
    }

    // ── headings ──
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const lvl = h[1].length;
      const text = renderInline(h[2]);
      const klass = {
        1: "mt-10 mb-4 font-display text-4xl tracking-tight text-text",
        2: "mt-10 mb-3 font-display text-2xl tracking-tight text-text",
        3: "mt-7 mb-2 font-display text-xl tracking-tight text-text",
        4: "mt-5 mb-2 font-display text-lg tracking-tight text-text-dim",
      }[lvl as 1 | 2 | 3 | 4];
      out.push(`<h${lvl} class="${klass}">${text}</h${lvl}>`);
      continue;
    }

    // ── blockquote ──
    const bq = raw.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara(); closeList();
      out.push(
        `<blockquote class="my-4 border-l-2 border-primary/50 bg-bg-raised/40 px-4 py-2 text-text-dim italic">${renderInline(bq[1])}</blockquote>`,
      );
      continue;
    }

    // ── list items ──
    const ul = raw.match(/^[-*]\s+(.*)$/);
    const ol = raw.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want: "ul" | "ol" = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        const klass = want === "ul"
          ? "my-3 list-disc space-y-1 pl-6 text-text-dim marker:text-primary/70"
          : "my-3 list-decimal space-y-1 pl-6 text-text-dim marker:text-primary/70";
        out.push(`<${want} class="${klass}">`);
        listType = want;
      }
      out.push(`<li>${renderInline((ul ?? ol)![1])}</li>`);
      continue;
    }

    // ── blank line → paragraph break ──
    if (!raw.trim()) {
      flushPara(); closeList();
      continue;
    }

    // ── plain paragraph text (join consecutive lines) ──
    para.push(raw);
  }
  flushPara(); closeList();
  if (inCode) {
    // Unclosed fence — best-effort flush so we don't drop content.
    out.push(
      `<pre class="my-4 overflow-x-auto rounded-md border border-border bg-bg-raised p-4 text-sm"><code class="font-mono text-text">` +
      escapeHtml(codeBuf.join("\n")) +
      `</code></pre>`,
    );
  }
  return out.join("\n");
}

export default function MarkdownView({
  url, fallback,
}: {
  url: string;
  fallback?: string;
}) {
  const [html, setHtml]       = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const md = await r.text();
        if (!aborted) setHtml(renderMarkdown(md));
      } catch (e) {
        if (!aborted) setError((e as Error).message);
      }
    })();
    return () => { aborted = true; };
  }, [url]);

  if (error) {
    return (
      <div className="rounded-md border border-border bg-bg-raised/60 p-6 text-sm text-text-dim">
        Couldn't load <code className="text-text">{url}</code>: {error}.
        {fallback && <p className="mt-3 text-muted">{fallback}</p>}
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-card-sub"
            style={{ width: `${90 - (i % 4) * 15}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
