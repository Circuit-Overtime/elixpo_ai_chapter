import { diffWordsWithSpace } from 'diff';

function inlineText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item?.text === 'string') return item.text;
    return inlineText(item?.content);
  }).join('');
}

function blockText(block) {
  const content = inlineText(block?.content);
  const type = block?.type;

  if (type === 'image' || type === 'file') {
    return content || `[${type === 'image' ? 'Image' : 'File'}]`;
  }
  if (type === 'divider') return '[Divider]';

  const level = Math.max(1, Math.min(6, Number(block?.props?.level) || 2));
  const prefix = type === 'heading' ? `${'#'.repeat(level)} `
    : type === 'bulletListItem' ? '- '
      : type === 'numberedListItem' ? '1. '
        : type === 'quote' ? '> '
          : '';
  const children = Array.isArray(block?.children) ? block.children.map(blockText).filter(Boolean) : [];
  return [content ? `${prefix}${content}` : '', ...children].filter(Boolean).join('\n');
}

export function revisionText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(blockText).filter(Boolean).join('\n\n');
}

export function diffRevisionBlocks(previousBlocks, currentBlocks) {
  return diffWordsWithSpace(revisionText(previousBlocks), revisionText(currentBlocks));
}