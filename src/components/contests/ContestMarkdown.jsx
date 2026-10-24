function inline(text, keyPrefix) {
  const parts = String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
  return parts.filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[0.9em] text-[var(--accent)]">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline decoration-[var(--accent-subtle)] underline-offset-4">{link[1]}</a>;
    return part;
  });
}

export default function ContestMarkdown({ children, className = '' }) {
  const lines = String(children || '').replace(/\r/g, '').split('\n');
  const nodes = [];
  let code = null;
  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      if (code) { nodes.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-xl bg-[var(--bg-surface)] p-4 font-mono text-sm leading-6"><code>{code.lines.join('\n')}</code></pre>); code = null; }
      else code = { lines: [] };
      return;
    }
    if (code) { code.lines.push(line); return; }
    if (!line.trim()) { nodes.push(<div key={`space-${index}`} className="h-2" />); return; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const Tag = `h${Math.min(heading[1].length + 1, 5)}`; nodes.push(<Tag key={`heading-${index}`} className="mt-5 font-serif text-xl font-bold text-[var(--text-primary)] first:mt-0">{inline(heading[2], `heading-${index}`)}</Tag>); return; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { nodes.push(<div key={`bullet-${index}`} className="flex gap-3 pl-2"><span aria-hidden="true" className="text-[var(--accent)]">•</span><span>{inline(bullet[1], `bullet-${index}`)}</span></div>); return; }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) { nodes.push(<div key={`ordered-${index}`} className="flex gap-3 pl-2"><span className="font-semibold text-[var(--accent)]">{line.match(/^\d+/)[0]}.</span><span>{inline(ordered[1], `ordered-${index}`)}</span></div>); return; }
    if (line.startsWith('> ')) { nodes.push(<blockquote key={`quote-${index}`} className="border-l-2 border-[var(--accent)] pl-4 italic text-[var(--text-muted)]">{inline(line.slice(2), `quote-${index}`)}</blockquote>); return; }
    nodes.push(<p key={`paragraph-${index}`}>{inline(line, `paragraph-${index}`)}</p>);
  });
  if (code) nodes.push(<pre key="code-final" className="overflow-x-auto rounded-xl bg-[var(--bg-surface)] p-4 font-mono text-sm leading-6"><code>{code.lines.join('\n')}</code></pre>);
  return <div className={`space-y-2 text-[16px] leading-8 text-[var(--text-secondary)] ${className}`}>{nodes}</div>;
}
