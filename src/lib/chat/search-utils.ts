import type { DisplayMessage } from "./use-chat";

export interface SearchResult {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  highlights: { start: number; end: number }[]; // Character positions for highlighting
  matchCount: number; // Number of matches in this message
}

/**
 * Search messages by query string with case-insensitive matching.
 * Returns messages with match highlights.
 */
export function searchMessages(
  messages: DisplayMessage[],
  query: string
): SearchResult[] {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  messages.forEach((msg) => {
    const normalizedContent = msg.content.toLowerCase();
    const highlights: { start: number; end: number }[] = [];
    let matchCount = 0;

    // Find all occurrences
    let index = 0;
    while ((index = normalizedContent.indexOf(normalizedQuery, index)) !== -1) {
      highlights.push({
        start: index,
        end: index + normalizedQuery.length,
      });
      matchCount++;
      index += normalizedQuery.length;
    }

    if (matchCount > 0) {
      results.push({
        messageId: msg.id,
        role: msg.role,
        content: msg.content,
        images: msg.images,
        highlights,
        matchCount,
      });
    }
  });

  return results;
}

/**
 * Extract snippet around highlight (e.g., 50 chars before/after)
 */
export function getHighlightSnippet(
  content: string,
  highlight: { start: number; end: number },
  contextLength: number = 50
): { snippet: string; highlightStart: number; highlightEnd: number } {
  const start = Math.max(0, highlight.start - contextLength);
  const end = Math.min(content.length, highlight.end + contextLength);

  const snippet = content.slice(start, end);
  const highlightStart = highlight.start - start;
  const highlightEnd = highlightStart + (highlight.end - highlight.start);

  return { snippet, highlightStart, highlightEnd };
}

/**
 * Highlight text in a string with HTML markers.
 * Safe for display in JSX.
 */
export function highlightText(
  text: string,
  highlights: { start: number; end: number }[]
): (string | { type: "highlight"; text: string })[] {
  if (highlights.length === 0) return [text];

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  const result: (string | { type: "highlight"; text: string })[] = [];
  let lastEnd = 0;

  sorted.forEach((hl) => {
    // Add text before highlight
    if (hl.start > lastEnd) {
      result.push(text.slice(lastEnd, hl.start));
    }
    // Add highlighted text
    result.push({
      type: "highlight",
      text: text.slice(hl.start, hl.end),
    });
    lastEnd = hl.end;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }

  return result;
}
