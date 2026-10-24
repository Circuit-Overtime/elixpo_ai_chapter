// BlockNote links keep their text one level down: { type: 'link', content: [{ text }] }.
const inlineText = (c) => {
  if (typeof c === 'string') return c;
  if (c?.type === 'link') return (c.content || []).map(inlineText).join('');
  return c?.text || '';
};

// Extract a short plain-text excerpt ("starting lines") from BlockNote blocks.
export function excerptFromBlocks(blocks, max = 200) {
  if (!Array.isArray(blocks)) return '';
  const out = [];
  const walk = (list) => {
    for (const b of list || []) {
      if (out.join(' ').length >= max) return;
      // Skip non-prose blocks.
      if (b?.type && ['image', 'video', 'audio', 'file', 'codeBlock', 'table', 'equation'].includes(b.type)) continue;
      const txt = (b?.content || [])
        .map(inlineText)
        .join('')
        .trim();
      if (txt) out.push(txt);
      if (b?.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  const text = out.join(' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('').replace(/\s+\S*$/, '') + '…' : text;
}
