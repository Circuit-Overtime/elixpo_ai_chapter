// LixBlogs search protocol — a GitHub-style qualifier syntax for blog search.
//
//   hacktoberfest                free text
//   "exact phrase"               quoted literal
//   tag:open-source              qualifier
//   -tag:nonsense                negated qualifier
//   created:>2025-10-01          date comparison
//   sort:likes                   ordering
//
// Parsing is separated from SQL building so the grammar can be unit-tested without
// a database. See docs/search-syntax.md for the user-facing reference.
//
// IMPORTANT — searchable text. A blog's `content` is gzip-compressed in D1, so it
// cannot be matched with SQL LIKE. Only title, subtitle, slug and excerpt are
// plain text. `in:body` therefore matches the excerpt (the stored preview), not
// the full post. That limitation is documented rather than papered over: silently
// matching a truncated preview while implying full-text search would be worse.

export const IN_FIELDS = {
  title: 'b.title',
  subtitle: 'b.subtitle',
  slug: 'b.slug',
  body: 'b.excerpt', // excerpt only — see note above
};

const DEFAULT_IN = ['title', 'subtitle', 'slug', 'body'];

export const SORTS = {
  recent: 'b.published_at DESC',
  oldest: 'b.published_at ASC',
  likes: 'b.like_count DESC, b.published_at DESC',
  comments: 'b.comment_count DESC, b.published_at DESC',
  views: 'b.view_count DESC, b.published_at DESC',
};

const IS_STATUS = new Set(['published', 'unlisted', 'draft']);

// key:value | -key:value | "phrase" | bare-word, with optional quoting of values.
const TOKEN_RE = /(-)?(?:([a-zA-Z_]+):)?(?:"([^"]*)"|(\S+))/g;

function dayStart(dateStr) {
  const ts = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isNaN(ts) ? null : Math.floor(ts / 1000);
}
const DAY = 86400;

// created:/published: accept >, >=, <, <=, an exact day, or a YYYY-MM-DD..YYYY-MM-DD
// range. A bare day means "any time that day", not midnight exactly.
function parseDate(field, raw) {
  const col = field === 'created' ? 'b.created_at' : 'b.published_at';

  const range = raw.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (range) {
    const from = dayStart(range[1]);
    const to = dayStart(range[2]);
    if (from === null || to === null) return null;
    return { col, op: 'between', from, to: to + DAY - 1 };
  }

  const cmp = raw.match(/^(>=|<=|>|<)?(\d{4}-\d{2}-\d{2})$/);
  if (!cmp) return null;
  const start = dayStart(cmp[2]);
  if (start === null) return null;
  const end = start + DAY - 1;

  switch (cmp[1]) {
    case '>': return { col, op: '>', ts: end };    // strictly after that day
    case '>=': return { col, op: '>=', ts: start };
    case '<': return { col, op: '<', ts: start };  // strictly before that day
    case '<=': return { col, op: '<=', ts: end };
    default: return { col, op: 'between', from: start, to: end };
  }
}

/**
 * Parse a raw query string into a structured description.
 * Unknown qualifiers are collected (not dropped) so the UI can tell the user that
 * `athor:x` was treated as free text instead of silently ignoring it.
 */
export function parseSearchQuery(raw = '') {
  const out = {
    text: [], phrases: [],
    tags: [], notTags: [],
    authors: [], notAuthors: [],
    orgs: [], notOrgs: [],
    in: [], statuses: [], notStatuses: [],
    secret: null, // true → only secret, false → exclude secret, null → no opinion
    dates: [],
    sort: null,
    unknown: [],
  };

  const handle = (v) => v.replace(/^@/, '').toLowerCase();
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    const neg = m[1] === '-';
    const key = (m[2] || '').toLowerCase();
    const quoted = m[3] !== undefined;
    const val = (quoted ? m[3] : m[4] || '').trim();
    if (!val) continue;

    if (!key) {
      (quoted ? out.phrases : out.text).push(val);
      continue;
    }

    switch (key) {
      case 'tag':
        (neg ? out.notTags : out.tags).push(val.toLowerCase());
        break;
      case 'author':
        (neg ? out.notAuthors : out.authors).push(handle(val));
        break;
      case 'org':
        (neg ? out.notOrgs : out.orgs).push(handle(val));
        break;
      case 'in': {
        const f = val.toLowerCase();
        if (IN_FIELDS[f]) out.in.push(f);
        else out.unknown.push(`in:${val}`);
        break;
      }
      case 'is': {
        const v = val.toLowerCase();
        if (v === 'secret') out.secret = !neg;
        else if (IS_STATUS.has(v)) (neg ? out.notStatuses : out.statuses).push(v);
        else out.unknown.push(`is:${val}`);
        break;
      }
      case 'sort': {
        const v = val.toLowerCase();
        if (SORTS[v]) out.sort = v;
        else out.unknown.push(`sort:${val}`);
        break;
      }
      case 'created':
      case 'published': {
        const d = parseDate(key, val);
        if (d) out.dates.push(d);
        else out.unknown.push(`${key}:${val}`);
        break;
      }
      default:
        // Not a qualifier we know — treat the whole token as free text so the
        // search still does something useful, and report it.
        out.unknown.push(`${key}:${val}`);
        out.text.push(`${key}:${val}`);
    }
  }
  return out;
}

/** True when the query asks for nothing at all (no text, no qualifiers). */
export function isEmptyQuery(p) {
  return !p.text.length && !p.phrases.length && !p.tags.length && !p.notTags.length &&
    !p.authors.length && !p.notAuthors.length && !p.orgs.length && !p.notOrgs.length &&
    !p.statuses.length && !p.notStatuses.length && !p.in.length && !p.dates.length && p.sort === null && p.secret === null;
}

/**
 * Build the WHERE/ORDER BY for a blog search.
 *
 * Assumes the caller's FROM is:
 *   FROM blogs b
 *   JOIN users au ON au.id = b.author_id
 *   LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
 *
 * @param parsed        output of parseSearchQuery
 * @param defaultStatus statuses to apply when the query names none
 * @returns { where, binds, orderBy }
 */
export function buildBlogSearch(parsed, { defaultStatus = ['published', 'unlisted'] } = {}) {
  const where = [];
  const binds = [];
  const ph = (arr) => arr.map(() => '?').join(',');

  // ── free text + phrases ──────────────────────────────────────────────────
  // Each term must match somewhere (AND across terms, OR across fields), so
  // `rookie hacktoberfest` narrows rather than widens.
  const fields = (parsed.in.length ? parsed.in : DEFAULT_IN).map((f) => IN_FIELDS[f]);
  const escapeLike = (s) => s.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`);
  for (const term of [...parsed.text, ...parsed.phrases]) {
    const ors = fields.map((col) => `LOWER(${col}) LIKE ? ESCAPE '\\'`);
    where.push(`(${ors.join(' OR ')})`);
    for (const _ of fields) binds.push(`%${escapeLike(term)}%`);
  }

  // ── tags ─────────────────────────────────────────────────────────────────
  // Repeated tags AND together (tag:a tag:b = has both), matching GitHub's label:.
  for (const t of parsed.tags) {
    where.push('EXISTS (SELECT 1 FROM blog_tags bt WHERE bt.blog_id = b.id AND LOWER(bt.tag) = ?)');
    binds.push(t);
  }
  for (const t of parsed.notTags) {
    where.push('NOT EXISTS (SELECT 1 FROM blog_tags bt WHERE bt.blog_id = b.id AND LOWER(bt.tag) = ?)');
    binds.push(t);
  }

  // ── author ───────────────────────────────────────────────────────────────
  // A secret post exists so its author is unknowable. `author:x` must therefore
  // never match one, or the qualifier becomes a deanonymization tool: filter by a
  // handle and read back that person's anonymous posts.
  if (parsed.authors.length) {
    where.push(`(b.secret = 0 AND LOWER(au.username) IN (${ph(parsed.authors)}))`);
    binds.push(...parsed.authors);
  }
  // Negation is the same hole in reverse: if `-author:x` made x's secret posts
  // vanish, you could confirm authorship by watching a post disappear. Secret posts
  // always survive an author exclusion.
  if (parsed.notAuthors.length) {
    where.push(`(b.secret = 1 OR LOWER(au.username) NOT IN (${ph(parsed.notAuthors)}))`);
    binds.push(...parsed.notAuthors);
  }

  // ── org ──────────────────────────────────────────────────────────────────
  // Orgs are not people: a secret post published under an org already shows the org
  // on its card, so org: may match secret posts without revealing anyone.
  if (parsed.orgs.length) {
    where.push(`LOWER(o.slug) IN (${ph(parsed.orgs)})`);
    binds.push(...parsed.orgs);
  }
  if (parsed.notOrgs.length) {
    where.push(`(o.slug IS NULL OR LOWER(o.slug) NOT IN (${ph(parsed.notOrgs)}))`);
    binds.push(...parsed.notOrgs);
  }

  // ── status / secret ──────────────────────────────────────────────────────
  const statuses = parsed.statuses.length ? parsed.statuses : defaultStatus;
  where.push(`b.status IN (${ph(statuses)})`);
  binds.push(...statuses);
  if (parsed.notStatuses.length) {
    where.push(`b.status NOT IN (${ph(parsed.notStatuses)})`);
    binds.push(...parsed.notStatuses);
  }
  if (parsed.secret === true) where.push('b.secret = 1');
  if (parsed.secret === false) where.push('b.secret = 0');

  // ── dates ────────────────────────────────────────────────────────────────
  for (const d of parsed.dates) {
    if (d.op === 'between') {
      where.push(`${d.col} BETWEEN ? AND ?`);
      binds.push(d.from, d.to);
    } else {
      where.push(`${d.col} ${d.op} ?`);
      binds.push(d.ts);
    }
  }

  return {
    where: where.length ? where.join(' AND ') : '1=1',
    binds,
    orderBy: SORTS[parsed.sort] || 'b.published_at DESC',
  };
}
