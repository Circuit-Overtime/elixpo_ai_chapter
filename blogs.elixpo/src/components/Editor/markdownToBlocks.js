// Parse inline markdown (bold, italic, code, inline LaTeX) into BlockNote styled content

export function parseInlineContent(text) {
  const content = [];
  // Match: \[...\] block LaTeX inline, \(...\) inline LaTeX, ***bold italic***, **bold**, ~~strikethrough~~, *italic*, `code`, $$..$$, $...$
  // Note: \[...\] matched first to extract block equations that appear inline in paragraphs
  // $...$ uses [^$]+ (greedy enough to capture nested braces like \frac{}{})
  const regex = /(\\\[(.+?)\\\]|\\\((.+?)\\\)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|~~(.+?)~~|\*(.+?)\*|`(.+?)`|\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      content.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      // \[...\] — treat as inline equation (will be rendered display-mode by KaTeX)
      content.push({ type: 'inlineEquation', props: { latex: match[2].trim() } });
    } else if (match[3]) {
      // \(...\) inline LaTeX
      content.push({ type: 'inlineEquation', props: { latex: match[3].trim() } });
    } else if (match[4]) {
      content.push({ type: 'text', text: match[4], styles: { bold: true, italic: true } });
    } else if (match[5]) {
      content.push({ type: 'text', text: match[5], styles: { bold: true } });
    } else if (match[6]) {
      // ~~strikethrough~~
      content.push({ type: 'text', text: match[6], styles: { strike: true } });
    } else if (match[7]) {
      content.push({ type: 'text', text: match[7], styles: { italic: true } });
    } else if (match[8]) {
      content.push({ type: 'text', text: match[8], styles: { code: true } });
    } else if (match[9]) {
      // $$...$$ inline — treat as equation
      content.push({ type: 'inlineEquation', props: { latex: match[9].trim() } });
    } else if (match[10]) {
      // $...$ inline math
      content.push({ type: 'inlineEquation', props: { latex: match[10].trim() } });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    content.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return content.length > 0 ? content : [{ type: 'text', text }];
}

// Parse markdown text into BlockNote block array

export function parseMarkdownToBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Code fence: ```lang ... ``` (also match curly/smart backticks)
    const fenceMatch = trimmed.match(/^[`\u2018\u2019\u201C\u201D]{3}[ \t]*(\w*)/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] || '').toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^[`\u2018\u2019\u201C\u201D]{3}/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const codeText = codeLines.join('\n');
      // Mermaid fences → MermaidBlock instead of codeBlock
      if (lang === 'mermaid') {
        blocks.push({
          type: 'mermaidBlock',
          props: { diagram: codeText },
        });
      } else if (!lang && /\\\[[\s\S]*?\\\]/.test(codeText)) {
        // Code block containing LaTeX \[...\] → extract as block equations
        const latexPattern = /\\\[[\s\S]*?\\\]/g;
        const latexMatches = codeText.match(latexPattern);
        const parts = codeText.split(latexPattern);
        let mIdx = 0;
        for (let p = 0; p < parts.length; p++) {
          const segment = parts[p].trim();
          if (segment) {
            for (const line of segment.split('\n').filter(l => l.trim())) {
              const t = line.trim();
              blocks.push({ type: 'paragraph', content: [{ type: 'text', text: t, ...(t.startsWith('%') ? { styles: { italic: true } } : {}) }] });
            }
          }
          if (mIdx < latexMatches.length) {
            const latex = latexMatches[mIdx].replace(/^\\\[/, '').replace(/\\\]$/, '').trim();
            if (latex) blocks.push({ type: 'blockEquation', props: { latex } });
            mIdx++;
          }
        }
      } else {
        blocks.push({
          type: 'codeBlock',
          props: { language: lang },
          content: [{ type: 'text', text: codeText }],
        });
      }
      continue;
    }

    // Block LaTeX: \[ on its own line (multi-line block)
    if (trimmed === '\\[') {
      const latexLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '\\]') {
        latexLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip \]
      const latex = latexLines.join('\n').trim();
      if (latex) {
        blocks.push({ type: 'blockEquation', props: { latex } });
      }
      continue;
    }

    // Block LaTeX: \[ with content on the same line, possibly closing on same or later lines
    if (trimmed.startsWith('\\[')) {
      const firstContent = trimmed.slice(2);
      // Check if it closes on the same line
      const closeIdx = firstContent.indexOf('\\]');
      if (closeIdx !== -1) {
        const latex = firstContent.slice(0, closeIdx).trim();
        if (latex) {
          blocks.push({ type: 'blockEquation', props: { latex } });
        }
        i++; continue;
      }
      // Multi-line: collect until \]
      const latexLines = [firstContent];
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        const ci = l.indexOf('\\]');
        if (ci !== -1) {
          latexLines.push(l.slice(0, ci));
          i++;
          break;
        }
        latexLines.push(lines[i]);
        i++;
      }
      const latex = latexLines.join('\n').trim();
      if (latex) {
        blocks.push({ type: 'blockEquation', props: { latex } });
      }
      continue;
    }

    // Block LaTeX: $$...$$ (may span multiple lines)
    if (trimmed.startsWith('$$')) {
      const afterOpen = trimmed.slice(2);
      // Check if it closes on the same line
      const closeIdx = afterOpen.indexOf('$$');
      if (closeIdx !== -1) {
        const latex = afterOpen.slice(0, closeIdx).trim();
        if (latex) {
          blocks.push({ type: 'blockEquation', props: { latex } });
        }
        i++; continue;
      }
      // Multi-line $$
      const latexLines = [afterOpen];
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        const ci = l.indexOf('$$');
        if (ci !== -1) {
          latexLines.push(l.slice(0, ci));
          i++;
          break;
        }
        latexLines.push(lines[i]);
        i++;
      }
      const latex = latexLines.join('\n').trim();
      if (latex) {
        blocks.push({ type: 'blockEquation', props: { latex } });
      }
      continue;
    }

    // Line that is purely a \[...\] equation (e.g. from reload / saved paragraph)
    const pureBlockMath = trimmed.match(/^\\\[(.+)\\\]$/);
    if (pureBlockMath) {
      blocks.push({ type: 'blockEquation', props: { latex: pureBlockMath[1].trim() } });
      i++; continue;
    }

    // Horizontal rule: ---, ***, ___, ———, ———
    if (/^([-*_])\1{2,}$/.test(trimmed) || /^[—–]{2,}$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      i++; continue;
    }

    // Blockquote: > text (collect consecutive > lines)
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteLines = [];
      while (i < lines.length) {
        const ql = lines[i].trim();
        if (ql.startsWith('> ')) {
          quoteLines.push(ql.slice(2));
        } else if (ql === '>') {
          quoteLines.push('');
        } else {
          break;
        }
        i++;
      }
      const quoteText = quoteLines.join('\n').trim();
      if (quoteText) {
        blocks.push({
          type: 'quote',
          content: parseInlineContent(quoteText),
        });
      }
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', props: { level: headingMatch[1].length.toString() }, content: parseInlineContent(headingMatch[2]) });
      i++; continue;
    }

    // GitHub-style task list. Match before the generic bullet rule so the
    // marker becomes checkbox state instead of visible "[ ]" text.
    const taskMatch = trimmed.match(/^(?:[-*]\s+)?\[([ xX])\](?:\s+(.*))?$/);
    if (taskMatch) {
      blocks.push({
        type: 'checkListItem',
        props: { checked: taskMatch[1].toLowerCase() === 'x' },
        content: parseInlineContent(taskMatch[2] || ''),
      });
      i++; continue;
    }

    // Bullet list
    if (trimmed.match(/^[-*]\s+/)) {
      blocks.push({ type: 'bulletListItem', content: parseInlineContent(trimmed.replace(/^[-*]\s+/, '')) });
      i++; continue;
    }

    // Numbered list
    if (trimmed.match(/^\d+\.\s+/)) {
      blocks.push({ type: 'numberedListItem', content: parseInlineContent(trimmed.replace(/^\d+\.\s+/, '')) });
      i++; continue;
    }

    // Image: ![alt](url) or ![alt](IMG_LOADING:id)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      const isLoading = src.startsWith('IMG_LOADING:');
      const imageId = isLoading ? src.replace('IMG_LOADING:', '') : null;
      blocks.push({
        type: 'image',
        props: {
          url: isLoading ? '' : src,
          caption: alt,
          previewWidth: 740,
          ...(isLoading ? { _loading: true, _imageId: imageId } : {}),
        },
      });
      i++; continue;
    }

    // Default paragraph with inline formatting (including inline LaTeX)
    blocks.push({ type: 'paragraph', content: parseInlineContent(trimmed) });
    i++;
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }];
}
