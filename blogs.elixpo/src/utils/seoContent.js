function inlineText(content) {
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item?.text === 'string') return item.text;
    return inlineText(item?.content);
  }).join(' ');
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function extractBlogText(content, maxLength = 240) {
  let blocks = content;
  if (typeof blocks === 'string') {
    try { blocks = JSON.parse(blocks); } catch { return ''; }
  }
  if (!Array.isArray(blocks)) return '';

  const parts = [];
  const visit = (items) => {
    for (const block of items || []) {
      if (!block || ['codeBlock', 'mermaidBlock', 'blockEquation', 'image'].includes(block.type)) continue;
      const text = normalize(inlineText(block.content));
      if (text) parts.push(text);
      if (Array.isArray(block.children)) visit(block.children);
      if (parts.join(' ').length >= maxLength) return;
    }
  };
  visit(blocks);

  const text = normalize(parts.join(' '));
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`;
}

export function blogExcerpt(blog, maxLength = 240) {
  return normalize(blog?.subtitle) || normalize(blog?.excerpt) || extractBlogText(blog?.content, maxLength);
}

// Search snippets need a page-specific synopsis, not a string of author, tag, and
// reading-time facts. Combine the writer's strongest summary fields while avoiding
// the common case where the stored excerpt simply repeats the subtitle.
export function blogSearchDescription(blog, maxLength = 160) {
  const prose = normalize(blog?.excerpt) || extractBlogText(blog?.content, maxLength * 2);
  const candidates = [
    normalize(blog?.subtitle),
    prose,
  ].filter(Boolean);
  const parts = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const exact = parts.findIndex((part) => part.toLowerCase() === lower);
    if (exact !== -1) continue;
    const expanded = parts.findIndex((part) => lower.startsWith(part.toLowerCase()));
    if (expanded !== -1) {
      parts[expanded] = candidate;
      continue;
    }
    if (parts.some((part) => part.toLowerCase().startsWith(lower))) continue;
    parts.push(candidate);
  }
  const summary = normalize(parts.join(' — '));
  if (summary.length <= maxLength) return summary;
  return `${summary.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`;
}

export function articleImageVariants(url) {
  if (!/^https?:\/\//.test(url || '')) return [];
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return [url];
  const transformations = [
    'q_auto,f_auto,c_fill,g_auto,w_1200,h_1200',
    'q_auto,f_auto,c_fill,g_auto,w_1200,h_900',
    'q_auto,f_auto,c_fill,g_auto,w_1200,h_675',
  ];
  return transformations.map((transform) => url.replace('/upload/', `/upload/${transform}/`));
}

export function safeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
