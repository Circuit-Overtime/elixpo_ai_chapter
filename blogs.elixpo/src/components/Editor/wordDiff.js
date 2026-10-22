/**
 * Word-level diff utility for inline AI edit comparison.
 * Uses LCS (Longest Common Subsequence) to produce a word-by-word diff.
 */

/**
 * Tokenize text into words and newline markers.
 * Spaces between words are discarded (re-added during block construction).
 * Newlines preserved as '\n' tokens for paragraph boundary detection.
 */
function tokenize(text) {
  const tokens = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].trim().split(/\s+/).filter(Boolean);
    tokens.push(...words);
    if (i < lines.length - 1) tokens.push('\n');
  }
  while (tokens.length > 0 && tokens[tokens.length - 1] === '\n') tokens.pop();
  return tokens;
}

/**
 * Merge consecutive same-type diff items (joining words with spaces).
 * Newline tokens are never merged.
 */
function mergeDiff(diff) {
  if (diff.length === 0) return diff;
  const merged = [{ ...diff[0] }];
  for (let i = 1; i < diff.length; i++) {
    const last = merged[merged.length - 1];
    const cur = diff[i];
    if (last.type === cur.type && cur.text !== '\n' && last.text !== '\n') {
      merged[merged.length - 1] = { type: last.type, text: last.text + ' ' + cur.text };
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * Compute word-level diff between old and new text.
 * @returns {Array<{ type: 'equal'|'delete'|'add', text: string }>}
 */
export function computeWordDiff(oldText, newText) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const m = oldTokens.length;
  const n = newTokens.length;

  // LCS dynamic programming
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Uint16Array(n + 1);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ type: 'equal', text: oldTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: newTokens[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'delete', text: oldTokens[i - 1] });
      i--;
    }
  }

  return mergeDiff(result);
}

/**
 * Convert merged diff result into BlockNote paragraph blocks.
 * - Block-level props: textColor 'purple', backgroundColor 'purple'
 *   (BlockNote renders these as colored block background + text)
 * - Deleted words: strike inline style (strikethrough)
 * - Added/equal words: no extra inline style
 * - Paragraph breaks at '\n' tokens
 */
export function diffToBlocks(diffResult) {
  const blocks = [];
  let currentContent = [];

  for (const item of diffResult) {
    if (item.text === '\n') {
      if (currentContent.length > 0) {
        blocks.push({
          type: 'paragraph',
          content: currentContent,
          props: { textColor: 'purple', backgroundColor: 'purple' },
        });
        currentContent = [];
      }
      continue;
    }

    // Only inline style we can use is 'strike' for deleted words
    const styles = {};
    if (item.type === 'delete') {
      styles.strike = true;
    }

    const needsSpace = currentContent.length > 0;
    currentContent.push({ type: 'text', text: (needsSpace ? ' ' : '') + item.text, styles });
  }

  if (currentContent.length > 0) {
    blocks.push({
      type: 'paragraph',
      content: currentContent,
      props: { textColor: 'purple', backgroundColor: 'purple' },
    });
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }];
}

/**
 * Build clean "keep" blocks from a diff result — removes deleted words,
 * keeps only equal + added words, resets block props to default.
 */
export function diffToKeepBlocks(diffResult) {
  const blocks = [];
  let currentContent = [];

  for (const item of diffResult) {
    if (item.text === '\n') {
      if (currentContent.length > 0) {
        blocks.push({ type: 'paragraph', content: currentContent });
        currentContent = [];
      }
      continue;
    }

    // Skip deleted words — they are being removed
    if (item.type === 'delete') continue;

    const needsSpace = currentContent.length > 0;
    currentContent.push({ type: 'text', text: (needsSpace ? ' ' : '') + item.text, styles: {} });
  }

  if (currentContent.length > 0) {
    blocks.push({ type: 'paragraph', content: currentContent });
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }];
}
