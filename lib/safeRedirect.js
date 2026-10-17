const REDIRECT_BASE = 'https://blogs.elixpo.com';

// Accept only same-site path references. In particular, reject backslash-based
// network-path references ("/\\example.com"), which URL parsers can normalize
// into an external origin even though the string does not begin with "//".
export function safeRelativeRedirect(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!candidate.startsWith('/') || /^\/[\\/]/.test(candidate)) return '';

  try {
    const parsed = new URL(candidate, REDIRECT_BASE);
    if (parsed.origin !== REDIRECT_BASE) return '';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}
