function text(value) {
  return [{ type: 'text', text: value }];
}

function inline(value) {
  const source = String(value || '');
  const content = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)]+)\))/g;
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset) content.push({ type: 'text', text: source.slice(offset, match.index) });
    if (match[2] !== undefined) content.push({ type: 'text', text: match[2], styles: { bold: true } });
    else if (match[3] !== undefined) content.push({ type: 'text', text: match[3], styles: { italic: true } });
    else if (match[4] !== undefined) content.push({ type: 'text', text: match[4], styles: { code: true } });
    else content.push({
      type: 'link',
      href: match[6],
      content: [{ type: 'text', text: match[5], styles: {} }],
    });
    offset = match.index + match[0].length;
  }
  if (offset < source.length) content.push({ type: 'text', text: source.slice(offset) });
  return content.length ? content : text(source);
}

export function markdownToBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', content: inline(paragraph.join(' ').trim()) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    const fence = trimmed.match(/^```([\w+-]*)/);
    if (fence) {
      flush();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) code.push(lines[index++]);
      blocks.push(fence[1].toLowerCase() === 'mermaid'
        ? { type: 'mermaidBlock', props: { diagram: code.join('\n') } }
        : { type: 'codeBlock', props: { language: fence[1].toLowerCase() }, content: text(code.join('\n')) });
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', props: { level: String(heading[1].length) }, content: inline(heading[2]) });
      continue;
    }
    const task = trimmed.match(/^(?:[-*]\s+)?\[([ xX])\](?:\s+(.*))?$/);
    if (task) {
      flush();
      blocks.push({
        type: 'checkListItem',
        props: { checked: task[1].toLowerCase() === 'x' },
        content: inline(task[2] || ''),
      });
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)/);
    if (bullet) { flush(); blocks.push({ type: 'bulletListItem', content: inline(bullet[1]) }); continue; }
    const numbered = trimmed.match(/^\d+\.\s+(.+)/);
    if (numbered) { flush(); blocks.push({ type: 'numberedListItem', content: inline(numbered[1]) }); continue; }
    const quote = trimmed.match(/^>\s?(.*)/);
    if (quote) { flush(); blocks.push({ type: 'quote', content: inline(quote[1]) }); continue; }
    const image = trimmed.match(/^!\[([^\]]*)\]\((https:\/\/[^)]+)\)$/);
    if (image) { flush(); blocks.push({ type: 'image', props: { url: image[2], caption: image[1] } }); continue; }
    if (/^([-*_])\1{2,}$/.test(trimmed)) { flush(); blocks.push({ type: 'divider' }); continue; }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

function blockText(block) {
  return (block?.content || []).map((item) => {
    if (typeof item === 'string') return item;
    if (item?.type === 'link') return blockText(item);
    return item?.text || '';
  }).join('');
}

function inlineMarkdown(block) {
  return (block?.content || []).map((item) => {
    if (typeof item === 'string') return item;
    if (item?.type === 'link') return `[${inlineMarkdown(item)}](${item.href})`;
    let value = item?.text || '';
    if (item?.styles?.code) value = `\`${value}\``;
    if (item?.styles?.italic) value = `*${value}*`;
    if (item?.styles?.bold) value = `**${value}**`;
    return value;
  }).join('');
}

export function blocksToMarkdown(blocks) {
  return (blocks || []).map((block) => {
    const value = inlineMarkdown(block);
    if (block.type === 'heading') return `${'#'.repeat(Number(block.props?.level) || 1)} ${value}`;
    if (block.type === 'checkListItem') return `- [${block.props?.checked ? 'x' : ' '}] ${value}`;
    if (block.type === 'bulletListItem') return `- ${value}`;
    if (block.type === 'numberedListItem') return `1. ${value}`;
    if (block.type === 'quote') return `> ${value}`;
    if (block.type === 'codeBlock') return `\`\`\`${block.props?.language || ''}\n${blockText(block)}\n\`\`\``;
    if (block.type === 'mermaidBlock') return `\`\`\`mermaid\n${block.props?.diagram || ''}\n\`\`\``;
    if (block.type === 'image') return `![${block.props?.caption || ''}](${block.props?.url || ''})`;
    if (block.type === 'divider') return '---';
    return value;
  }).join('\n\n');
}
