import { sanitizeSlug } from './slugify.js';
import { decompressBlogContent } from './compress.js';

export const CONTEST_STATUSES = new Set(['draft', 'scheduled', 'live', 'judging', 'completed', 'cancelled']);
export const CONTEST_ROLES = new Set(['moderator', 'judge']);
export const CONTEST_PLACEMENTS = new Set(['winner', 'runner-up', 'honorable-mention']);

export function contestSlug(value) {
  return sanitizeSlug(value, { max: 64 });
}

export function contestState(contest, now = Math.floor(Date.now() / 1000)) {
  if (!contest) return null;
  if (contest.status === 'draft' || contest.status === 'cancelled' || contest.status === 'completed') return contest.status;
  if (now < Number(contest.starts_at)) return 'scheduled';
  if (now < Number(contest.submissions_close_at)) return 'live';
  if (now < Number(contest.judging_closes_at) || !contest.results_at || now < Number(contest.results_at)) return 'judging';
  return 'completed';
}

export function contestCoverUrl(value) {
  const valueString = String(value || '').trim();
  if (!valueString) return null;
  if (valueString.length > 2048) throw new Error('invalid_cover_url');
  try {
    const url = new URL(valueString);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('invalid_cover_url');
    return url.toString();
  } catch {
    throw new Error('invalid_cover_url');
  }
}

export function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function normalizeStringArray(value, { max = 20, itemMax = 80 } = {}) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
    .slice(0, max)
    .map((item) => item.slice(0, itemMax));
}

export function normalizeContestEligibility(value, current = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const result = { ...current };
  if (input.minimumAccountAgeMonths !== undefined) result.minimumAccountAgeMonths = Math.max(0, Math.floor(Number(input.minimumAccountAgeMonths) || 0));
  if (input.minimumAccountAgeDays !== undefined) result.minimumAccountAgeDays = Math.max(0, Math.floor(Number(input.minimumAccountAgeDays) || 0));
  if (input.requireBio !== undefined) result.requireBio = Boolean(input.requireBio);
  if (input.allowedUsernames !== undefined) result.allowedUsernames = normalizeStringArray(input.allowedUsernames, { max: 500, itemMax: 80 });
  return result;
}

export function serializeContest(row, { role = null } = {}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    problemStatement: row.problem_statement || '',
    rules: row.rules || '',
    theme: row.theme || '',
    language: row.language || 'und',
    region: row.region || 'global',
    coverUrl: row.cover_url || null,
    templateContent: row.template_content || '',
    status: contestState(row),
    configuredStatus: row.status,
    startsAt: row.starts_at,
    submissionsCloseAt: row.submissions_close_at,
    judgingClosesAt: row.judging_closes_at,
    resultsAt: row.results_at || null,
    requiredTopics: parseJson(row.required_topics, []),
    tags: parseJson(row.tags, []),
    allowedTargets: parseJson(row.allowed_targets, ['personal']),
    eligibility: parseJson(row.eligibility, {}),
    perAuthorLimit: Number(row.per_author_limit || 1),
    submissionCount: Number(row.submission_count || 0),
    organizer: {
      id: row.organizer_id,
      username: row.organizer_username || null,
      displayName: row.organizer_name || row.organizer_username || null,
      avatarUrl: row.organizer_avatar || null,
    },
    viewerRole: role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getContest(db, idOrSlug) {
  return db.prepare(`
    SELECT c.*, u.username AS organizer_username, u.display_name AS organizer_name,
      u.avatar_url AS organizer_avatar,
      (SELECT COUNT(*) FROM contest_submissions s
        WHERE s.contest_id = c.id AND s.withdrawn_at IS NULL) AS submission_count
    FROM contests c JOIN users u ON u.id = c.organizer_id
    WHERE c.id = ? OR LOWER(c.slug) = LOWER(?) LIMIT 1
  `).bind(idOrSlug, idOrSlug).first();
}

export async function contestRole(db, contest, userId) {
  if (!contest || !userId) return null;
  if (contest.organizer_id === userId) return 'organizer';
  const member = await db.prepare('SELECT role FROM contest_members WHERE contest_id = ? AND user_id = ?')
    .bind(contest.id, userId).first();
  return member?.role || null;
}

export function canManageContest(role) {
  return role === 'organizer' || role === 'moderator';
}

export function canJudgeContest(role) {
  return role === 'organizer' || role === 'judge';
}

export async function checkContestEligibility(db, contest, userId) {
  const rules = parseJson(contest?.eligibility, {});
  const user = await db.prepare('SELECT username, bio, created_at FROM users WHERE id = ?').bind(userId).first();
  if (!user) return 'The author profile was not found.';
  const minimumMonths = rules.minimumAccountAgeMonths !== undefined
    ? Math.max(0, Number(rules.minimumAccountAgeMonths || 0))
    : null;
  const minimumDays = minimumMonths !== null
    ? minimumMonths * 30
    : Math.max(0, Number(rules.minimumAccountAgeDays || 0));
  if (minimumDays && Math.floor(Date.now() / 1000) - Number(user.created_at || 0) < minimumDays * 86400) {
    return minimumMonths !== null
      ? `Accounts must be at least ${minimumMonths} month${minimumMonths === 1 ? '' : 's'} old.`
      : `Accounts must be at least ${minimumDays} days old.`;
  }
  if (rules.requireBio && !String(user.bio || '').trim()) return 'A completed profile bio is required.';
  const allowed = normalizeStringArray(rules.allowedUsernames || [], { max: 500, itemMax: 80 }).map((name) => name.toLowerCase());
  if (allowed.length && !allowed.includes(String(user.username || '').toLowerCase())) return 'This contest is limited to invited authors.';
  return null;
}

export async function recordContestAudit(db, { contestId, actorId, action, targetId = null, metadata = {} }) {
  await db.prepare(`
    INSERT INTO contest_audit_log (id, contest_id, actor_id, action, target_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `).bind(crypto.randomUUID(), contestId, actorId, action, targetId, JSON.stringify(metadata)).run();
}

export function submissionSnapshot(blog, tags = []) {
  return {
    content: blog.content,
    metadata: JSON.stringify({
      title: blog.title || 'Untitled',
      subtitle: blog.subtitle || '',
      slug: blog.slug,
      coverUrl: blog.cover_image_r2_key || null,
      emoji: blog.page_emoji || null,
      excerpt: blog.excerpt || '',
      readTimeMinutes: Number(blog.read_time_minutes || 0),
      license: blog.license || 'all-rights-reserved',
      publishedAs: blog.published_as || 'personal',
      tags,
    }),
  };
}

export function serializeSubmission(row, { includeSnapshot = false } = {}) {
  const snapshot = parseJson(row.snapshot_metadata, {});
  let frozenContent = [];
  if (includeSnapshot) {
    try { frozenContent = decompressBlogContent(row.snapshot_content) || []; } catch {}
  }
  return {
    id: row.id,
    contestId: row.contest_id,
    blogId: row.blog_id,
    author: {
      id: row.author_id,
      username: row.author_username || null,
      displayName: row.author_name || row.author_username || null,
      avatarUrl: row.author_avatar || null,
    },
    title: snapshot.title || 'Untitled',
    subtitle: snapshot.subtitle || '',
    excerpt: snapshot.excerpt || '',
    coverUrl: snapshot.coverUrl || null,
    emoji: snapshot.emoji || null,
    tags: snapshot.tags || [],
    license: snapshot.license || 'all-rights-reserved',
    canonicalUrl: row.canonical_url || null,
    submittedAt: row.submitted_at,
    withdrawnAt: row.withdrawn_at || null,
    placement: row.placement || null,
    position: row.position || null,
    ...(includeSnapshot ? { snapshot: { ...snapshot, content: frozenContent } } : {}),
  };
}

export const CONTEST_SUBMISSION_SELECT = `
  SELECT s.*, u.username AS author_username, u.display_name AS author_name,
    u.avatar_url AS author_avatar, a.placement, a.position,
    CASE
      WHEN o.slug IS NOT NULL AND pc.slug IS NOT NULL THEN '/' || o.slug || '/' || pc.slug || '/' || b.slug
      WHEN o.slug IS NOT NULL THEN '/' || o.slug || '/' || b.slug
      ELSE '/' || u.username || '/' || b.slug
    END AS canonical_url
  FROM contest_submissions s
  JOIN users u ON u.id = s.author_id
  JOIN blogs b ON b.id = s.blog_id
  LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
  LEFT JOIN collections pc ON pc.id = b.collection_id
  LEFT JOIN contest_awards a ON a.submission_id = s.id
`;
