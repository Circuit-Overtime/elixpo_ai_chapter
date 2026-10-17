const MAX_CONTENT_BYTES = 1_500_000;

export function countWords(blocks) {
  const words = [];
  const walk = (items) => {
    for (const block of items || []) {
      for (const item of block?.content || []) {
        const value = typeof item === 'string' ? item : item?.text || '';
        words.push(...value.trim().split(/\s+/).filter(Boolean));
      }
      if (block?.children) walk(block.children);
    }
  };
  walk(blocks);
  return words.length;
}

export function validateBlogInput(input, { publishing = false } = {}) {
  if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 300)) {
    throw new Error('Title must be 300 characters or fewer.');
  }
  if (input.subtitle !== undefined && (typeof input.subtitle !== 'string' || input.subtitle.length > 500)) {
    throw new Error('Subtitle must be 500 characters or fewer.');
  }
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.length > 5)) {
    throw new Error('Use at most five tags.');
  }
  if (input.coverUrl && !/^https:\/\//i.test(input.coverUrl)) {
    throw new Error('Cover URLs must use HTTPS.');
  }
  if (input.publishedAs && input.publishedAs !== 'personal' && !/^org:[^:]+$/.test(input.publishedAs)) {
    throw new Error('Publication must be personal or org:<id>.');
  }
  if (input.content !== undefined) {
    if (!Array.isArray(input.content)) throw new Error('Blog content must be a block array.');
    if (Buffer.byteLength(JSON.stringify(input.content), 'utf8') > MAX_CONTENT_BYTES) {
      throw new Error('Blog content exceeds the 1.5 MB limit.');
    }
  }
  if (publishing) {
    if (!input.title?.trim()) throw new Error('A title is required before publishing.');
    if (countWords(input.content) < 20) throw new Error('A post needs at least 20 words before publishing.');
  }
  return input;
}
