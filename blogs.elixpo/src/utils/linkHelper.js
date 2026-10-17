export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (/^(\/|#)/.test(trimmed) || /^(https?:|mailto:|tel:|sms:)/i.test(trimmed)) {
    return trimmed;
  }

  // A localhost host with a port looks like a URI scheme to the generic
  // protocol check below. Preserve it as a normal development URL.
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Reject executable and unsupported explicit protocols instead of turning
  // them into clickable preview HTML.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return '';
  }

  return `https://${trimmed}`;
}

export function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function normalizeImageUrl(url) {
  const normalized = normalizeUrl(url);
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

export function normalizeCssColor(value) {
  if (typeof value !== 'string') return '';
  const color = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\([\d\s.,%]+\)$/i.test(color)) return color;
  if (/^hsla?\([\d\s.,%]+\)$/i.test(color)) return color;
  if (/^[a-z]{3,20}$/i.test(color)) return color;
  return '';
}
