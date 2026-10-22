export function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function extractHeadings(md) {
  const lines = md.split('\n');
  const headings = [];
  for (const line of lines) {
    const match = /^(##|###)\s+(.*)/.exec(line);
    if (match) {
      const level = match[1].length; // 2 or 3
      const text = match[2].trim();
      headings.push({ level, text, id: slugifyHeading(text) });
    }
  }
  return headings;
}
