function normalizeBlock(block) {
  const children = Array.isArray(block?.children)
    ? normalizeLegacyChecklistBlocks(block.children)
    : block?.children;

  if (block?.type !== 'bulletListItem' || !Array.isArray(block.content)) {
    return children === block?.children ? block : { ...block, children };
  }

  const content = block.content.map((item) => ({ ...item }));
  let leadingText = '';
  let leadingItems = 0;
  for (const item of content) {
    if (typeof item?.text !== 'string') break;
    leadingText += item.text;
    leadingItems += 1;
    if (leadingText.length >= 8) break;
  }

  const marker = leadingText.match(/^\s*\[([ xX])\](?:\s+|$)/);
  if (!marker) return children === block.children ? block : { ...block, children };

  let remaining = marker[0].length;
  for (let index = 0; index < leadingItems && remaining > 0; index += 1) {
    const consumed = Math.min(remaining, content[index].text.length);
    content[index].text = content[index].text.slice(consumed);
    remaining -= consumed;
  }

  return {
    ...block,
    type: 'checkListItem',
    props: { ...block.props, checked: marker[1].toLowerCase() === 'x' },
    content: content.filter((item) => typeof item.text !== 'string' || item.text.length > 0),
    children,
  };
}

export function normalizeLegacyChecklistBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(normalizeBlock);
}
