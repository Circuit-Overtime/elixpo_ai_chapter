/**
 * Namespace management — ensures usernames and org slugs are globally unique,
 * case-insensitive, and disjoint.
 *
 * Primary source of truth: `namespaces` table (name TEXT PRIMARY KEY).
 * Fallback: checks `users.username` and `orgs.slug` directly.
 */

import { containsProfanity } from './validate.js';

// Reserved names that can't be used as usernames or org slugs
const RESERVED_NAMES = new Set([
  'admin', 'api', 'app', 'auth', 'blog', 'blogs', 'callback', 'cdn',
  'dashboard', 'docs', 'edit', 'explore', 'feed', 'handle', 'help',
  'home', 'intro', 'library', 'login', 'logout', 'mail', 'me', 'media',
  'new', 'new-blog', 'null', 'pricing', 'profile', 'register', 'resolve',
  'search', 'settings', 'sign-in', 'sign-up', 'signin', 'signup', 'stats',
  'status', 'stories', 'support', 'system', 'terms', 'test', 'undefined',
  'user', 'users', 'www',
]);

/**
 * Validate a name format (username or org slug).
 * Returns { valid: boolean, error?: string }
 */
export function validateNameFormat(name) {
  if (!name || typeof name !== 'string') return { valid: false, error: 'Name is required' };
  const clean = name.toLowerCase().trim();
  if (clean.length < 2) return { valid: false, error: 'Must be at least 2 characters' };
  if (clean.length > 40) return { valid: false, error: 'Must be 40 characters or less' };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clean) && clean.length > 1) {
    if (/^[a-z0-9]{2}$/.test(clean)) { /* 2-char names OK */ }
    else return { valid: false, error: 'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number' };
  }
  if (/--/.test(clean)) return { valid: false, error: 'Cannot contain consecutive hyphens' };
  if (RESERVED_NAMES.has(clean)) return { valid: false, error: 'This name is reserved' };
  if (containsProfanity(clean)) return { valid: false, error: 'This name is not allowed' };
  return { valid: true };
}

/**
 * Check if a name is available in the shared namespace.
 * Checks namespaces table first, falls back to users + orgs tables.
 * Returns { available: boolean, takenBy?: 'user' | 'org' | 'reserved' }
 */
export async function checkNameAvailable(db, name) {
  const clean = name.toLowerCase().trim();

  // Check reserved names first (no DB hit)
  const fmt = validateNameFormat(clean);
  if (!fmt.valid) return { available: false, takenBy: 'reserved', error: fmt.error };

  // Check namespaces table (primary)
  const ns = await db.prepare('SELECT owner_type FROM namespaces WHERE name = ?')
    .bind(clean).first();
  if (ns) return { available: false, takenBy: ns.owner_type };

  // Fallback: check users and orgs tables directly (in case namespace wasn't seeded)
  const user = await db.prepare('SELECT id FROM users WHERE LOWER(username) = ?')
    .bind(clean).first();
  if (user) return { available: false, takenBy: 'user' };

  const org = await db.prepare('SELECT id FROM orgs WHERE LOWER(slug) = ?')
    .bind(clean).first();
  if (org) return { available: false, takenBy: 'org' };

  return { available: true };
}

const ACCOUNTS_USERNAME_CHECK = 'https://accounts.elixpo.com/api/auth/username/check';

// Usernames come from Elixpo Accounts and LixBlogs cannot refuse or rename them,
// so an org handle must not collide with any Accounts username, including
// people who have not signed in to LixBlogs yet. Otherwise their first sign-in
// lands on a name the org already holds and their profile and posts 404.
// Returns an error string when the org may not take the name, else null.
export async function orgNameConflict(db, clean) {
  // The namespace row for a user can be missing (sign-up seeds it best-effort).
  const user = await db.prepare('SELECT 1 FROM users WHERE LOWER(username) = ?').bind(clean).first();
  if (user) return 'Taken by a user';
  try {
    const res = await fetch(`${ACCOUNTS_USERNAME_CHECK}?u=${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(4000),
    });
    const body = await res.json();
    if (body?.available) return null;
    const reason = String(body?.reason || '');
    if (/taken|reserved/i.test(reason)) return 'Taken by an Elixpo account';
    // Outside Accounts' username format (e.g. 2 characters), so no account can own it.
    if (res.ok && !/could not/i.test(reason)) return null;
  } catch {}
  // Fail closed: a wrong "available" here is what caused the collision.
  return 'Could not verify this handle right now. Please try again.';
}

/**
 * Reserve a name in the shared namespace.
 * Uses INSERT OR IGNORE to handle race conditions — if two requests
 * try to reserve the same name simultaneously, one will silently fail.
 * Returns { success: boolean }
 */
export async function reserveName(db, name, ownerType, ownerId) {
  const clean = String(name || '').toLowerCase().trim();
  const fmt = validateNameFormat(clean);
  if (!fmt.valid) return { success: false, error: fmt.error };
  if (ownerType === 'org') {
    const conflict = await orgNameConflict(db, clean);
    if (conflict) return { success: false, error: conflict };
  }
  const result = await db.prepare(
    'INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id, created_at) VALUES (?, ?, ?, unixepoch())'
  ).bind(clean, ownerType, ownerId).run();

  // Check if the insert actually happened (changes > 0)
  // If not, someone else reserved it first
  if (result?.meta?.changes === 0) {
    return { success: false };
  }
  return { success: true };
}

/**
 * Atomically check and reserve a name. Returns { success, error? }
 */
export async function tryReserveName(db, name, ownerType, ownerId) {
  const clean = name.toLowerCase().trim();

  const fmt = validateNameFormat(clean);
  if (!fmt.valid) return { success: false, error: fmt.error };
  if (ownerType === 'org') {
    const conflict = await orgNameConflict(db, clean);
    if (conflict) return { success: false, error: conflict };
  }

  // Try to insert — PRIMARY KEY constraint prevents duplicates
  try {
    const result = await db.prepare(
      'INSERT INTO namespaces (name, owner_type, owner_id, created_at) VALUES (?, ?, ?, unixepoch())'
    ).bind(clean, ownerType, ownerId).run();
    return { success: true };
  } catch (e) {
    // UNIQUE/PRIMARY KEY violation = name taken
    if (e.message?.includes('UNIQUE') || e.message?.includes('PRIMARY')) {
      const existing = await db.prepare('SELECT owner_type FROM namespaces WHERE name = ?').bind(clean).first();
      return { success: false, error: existing?.owner_type === 'user' ? 'Taken by a user' : 'Already taken' };
    }
    throw e;
  }
}

/**
 * Release a name from the namespace.
 */
export async function releaseName(db, name) {
  await db.prepare('DELETE FROM namespaces WHERE name = ?')
    .bind(name.toLowerCase().trim()).run();
}

/**
 * Check if a blog slug is available globally (case-insensitive).
 */
// Slugs are unique *per owner* — the public URL is /owner/slug, so the same
// slug may exist under different users/orgs (like GitHub repo names).
// scope: { authorId, publishAs } — personal scopes to (author_id, 'personal');
// an org ('org:<id>') scopes to that published_as. Omit scope = global (legacy).
export async function checkBlogSlugAvailable(db, slug, excludeBlogId, scope) {
  const clean = slug.toLowerCase().trim();
  const where = ['LOWER(slug) = ?'];
  const params = [clean];
  if (scope?.publishAs === 'personal') {
    where.push('(published_as = ? OR published_as IS NULL)', 'author_id = ?');
    params.push('personal', scope.authorId);
  } else if (scope?.publishAs) {
    where.push('published_as = ?');
    params.push(scope.publishAs);
  }
  if (excludeBlogId) {
    where.push('id != ?');
    params.push(excludeBlogId);
  }
  const row = await db
    .prepare(`SELECT id FROM blogs WHERE ${where.join(' AND ')}`)
    .bind(...params)
    .first();
  return { available: !row };
}

/**
 * Generate a unique blog slug within the owner's scope. Appends a short suffix if taken.
 */
export async function ensureUniqueBlogSlug(db, baseSlug, excludeBlogId, scope) {
  const clean = baseSlug.toLowerCase().trim();
  if (!clean) return `post-${Date.now().toString(36)}`;

  const { available } = await checkBlogSlugAvailable(db, clean, excludeBlogId, scope);
  if (available) return clean;

  for (let i = 0; i < 10; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${clean}-${suffix}`;
    const check = await checkBlogSlugAvailable(db, candidate, excludeBlogId, scope);
    if (check.available) return candidate;
  }

  return `${clean}-${Date.now().toString(36)}`;
}
