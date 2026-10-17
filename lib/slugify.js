// Shared slug/name sanitizer for orgs, groups, reading lists, etc.
// Rules: lowercase, spaces and other non-alphanumerics become single hyphens,
// no leading/trailing hyphen, length-bounded.

export const SLUG_MIN = 6;
export const SLUG_MAX = 48;

export function sanitizeSlug(input, { max = SLUG_MAX } = {}) {
  return (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // spaces + specials → hyphen
    .replace(/-{2,}/g, '-')      // collapse repeats
    .replace(/^-+|-+$/g, '')     // trim hyphens
    .slice(0, max)
    .replace(/-+$/g, '');        // re-trim after slicing
}

// Returns { ok, slug, error }. Enforces the min/max length.
export function validateSlug(input, { min = SLUG_MIN, max = SLUG_MAX, label = 'Name' } = {}) {
  const slug = sanitizeSlug(input, { max });
  if (slug.length < min) return { ok: false, slug, error: `${label} must be at least ${min} characters (letters/numbers).` };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, slug, error: `${label} is invalid.` };
  return { ok: true, slug };
}
