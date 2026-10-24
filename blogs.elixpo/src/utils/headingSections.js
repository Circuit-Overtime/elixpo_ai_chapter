function headingLevel(block) {
  const level = Number(block?.props?.level);
  return Number.isFinite(level) && level > 0 ? level : 1;
}

// A section begins at a heading and ends immediately before the next heading
// at the same or a higher outline level. Lower-level headings belong to it.
export function getHeadingSection(blocks, headingId) {
  if (!Array.isArray(blocks)) return [];
  const start = blocks.findIndex((block) => block.id === headingId);
  if (start < 0 || blocks[start]?.type !== 'heading') return [];

  const level = headingLevel(blocks[start]);
  let end = blocks.length;
  for (let index = start + 1; index < blocks.length; index += 1) {
    const candidate = blocks[index];
    if (candidate?.type === 'heading' && headingLevel(candidate) <= level) {
      end = index;
      break;
    }
  }
  return blocks.slice(start, end);
}
