// Helper for sub-page deletion. If the sub-page has authored content (a
// non-empty doc, or a canvas with shapes), prompt the user before deleting
// so they don't blow away work by accidentally clicking the trash button.

function docHasContent(content) {
  if (!content) return false;
  let blocks = content;
  if (typeof content === 'string') {
    try { blocks = JSON.parse(content); } catch { return content.trim().length > 4; }
  }
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => {
    if (!b) return false;
    // Custom blocks with non-empty props
    if (b.props) {
      if (b.props.diagram) return true;       // mermaid
      if (b.props.latex) return true;         // equation
      if (b.props.url) return true;           // image / pdf
      if (b.props.subpageId) return true;     // tabs / canvas chip
      if (b.props.tabs && b.props.tabs !== '[]') return true;
    }
    // Inline content with text
    const text = (b.content || []).map((c) => c?.text || '').join('').trim();
    return text.length > 0;
  });
}

function canvasHasContent(content) {
  if (!content) return false;
  let scene = content;
  if (typeof content === 'string') {
    try { scene = JSON.parse(content); } catch { return false; }
  }
  return Array.isArray(scene?.shapes) && scene.shapes.length > 0;
}

/**
 * Fetch the sub-page, decide whether it has content, and ask the user to
 * confirm if so. Resolves true when the caller should proceed with DELETE,
 * false when the user backed out.
 *
 * Network failures are treated as "go ahead" — better to allow the user to
 * remove a stale chip than block them on a transient error.
 */
export async function confirmSubpageDelete(subpageId, { fallbackKind = 'doc' } = {}) {
  if (!subpageId) return true;
  try {
    const res = await fetch(`/api/subpages?id=${subpageId}`);
    if (!res.ok) return true;
    const data = await res.json();
    const kind = data.kind || fallbackKind;
    const has = kind === 'canvas' ? canvasHasContent(data.content) : docHasContent(data.content);
    if (!has) return true;
    const label = kind === 'canvas' ? 'canvas' : 'sub-page';
    const title = data.title ? `“${data.title}”` : `this ${label}`;
    return window.confirm(
      `${title} has content. Delete the ${label} permanently? This cannot be undone.`
    );
  } catch {
    return true;
  }
}
