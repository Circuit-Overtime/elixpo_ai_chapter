function trimSurroundingBlankLines(value) {
  return String(value)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}

export function extractMermaidFences(markdown = '') {
  const diagrams = [];
  const lines = String(markdown).split(/(?<=\n)/);
  const output = [];
  for (let i = 0; i < lines.length;) {
    const opening = lines[i].replace(/\r?\n$/, '').match(/^[ \t]*(`{3,}|~{3,})[ \t]*([^ \t`~\r\n]*)[^\r\n]*$/);
    if (!opening) {
      output.push(lines[i++]);
      continue;
    }

    const fence = opening[1];
    const closing = new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !closing.test(lines[end].replace(/\r?\n$/, ''))) end++;

    // Skip *all* fenced blocks as a unit. A Mermaid-looking line inside a
    // normal code sample must remain literal text.
    if (opening[2].toLowerCase() !== 'mermaid' || end === lines.length) {
      output.push(...lines.slice(i, end < lines.length ? end + 1 : end));
      i = end < lines.length ? end + 1 : end;
      continue;
    }

    // Remove only empty wrapper lines; trimming all whitespace changes the
    // indentation of the diagram's first and last source lines.
    diagrams.push(trimSurroundingBlankLines(lines.slice(i + 1, end).join('')));
    output.push(`MERMAIDPLACEHOLDER${diagrams.length - 1}END${lines[end].endsWith('\n') ? '\n' : ''}`);
    i = end + 1;
  }
  return { content: output.join(''), diagrams };
}

export function extractMermaidPaste(text = '', html = '') {
  const fenced = extractMermaidFences(text);
  if (fenced.diagrams.length > 0) return fenced;

  // Rich clipboard formats (GitHub, documentation sites, IDEs) often expose a
  // Mermaid language marker only in HTML and put the raw diagram in text/plain.
  // Treat that single code block as Mermaid instead of letting BlockNote create
  // a generic code block.
  if (
    String(text).trim() &&
    /(?:language|lang)[-_]mermaid|data-(?:language|lang)\s*=\s*["']?mermaid\b|class\s*=\s*["'][^"']*\bmermaid\b/i.test(String(html))
  ) {
    return {
      content: 'MERMAIDPLACEHOLDER0END',
      diagrams: [trimSurroundingBlankLines(text)],
    };
  }

  return fenced;
}
