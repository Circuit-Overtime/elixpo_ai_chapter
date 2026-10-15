const DAY = 86400;

export const RECOMMENDATION_VERSION = '2026-10-15';

export function normalizeLanguage(value, fallback = 'und') {
  const language = String(value || '').trim().replace(/_/g, '-').toLowerCase().split('-')[0];
  return /^[a-z]{2,3}$/.test(language) ? language : fallback;
}

export function normalizeRegion(value, fallback = 'global') {
  const region = String(value || '').trim().toUpperCase();
  if (region === 'GLOBAL') return 'global';
  return /^[A-Z]{2}$/.test(region) ? region : fallback;
}

export function languageFromHeaders(headers) {
  const first = String(headers?.get?.('accept-language') || '').split(',')[0]?.split(';')[0];
  return normalizeLanguage(first);
}

export function regionFromHeaders(headers) {
  return normalizeRegion(headers?.get?.('cf-ipcountry'));
}

export function localeRegion(locale) {
  const parts = String(locale || '').replace(/_/g, '-').split('-');
  return normalizeRegion(parts.find((part, index) => index > 0 && /^[a-z]{2}$/i.test(part)));
}

export function contentDiscoveryMetadata({ language, region, locale, headers } = {}) {
  return {
    language: normalizeLanguage(language, normalizeLanguage(locale, languageFromHeaders(headers))),
    region: normalizeRegion(region, localeRegion(locale) !== 'global' ? localeRegion(locale) : regionFromHeaders(headers)),
  };
}

export async function loadRecommendationContext(db, userId, headers) {
  const context = {
    language: languageFromHeaders(headers),
    region: regionFromHeaders(headers),
    explicitTopics: new Set(),
    topicWeights: new Map(),
  };
  if (!userId) return context;

  const [user, interests, signals] = await Promise.all([
    db.prepare('SELECT locale FROM users WHERE id = ?').bind(userId).first(),
    db.prepare('SELECT LOWER(tag) AS tag FROM user_interests WHERE user_id = ?').bind(userId).all(),
    db.prepare(`
      SELECT LOWER(tag) AS tag, SUM(weight) AS weight
      FROM user_signals
      WHERE user_id = ? AND tag IS NOT NULL AND created_at > unixepoch() - 2592000
      GROUP BY LOWER(tag)
    `).bind(userId).all(),
  ]);
  context.language = normalizeLanguage(user?.locale, context.language);
  const profileRegion = localeRegion(user?.locale);
  if (profileRegion !== 'global') context.region = profileRegion;
  for (const row of interests?.results || []) context.explicitTopics.add(row.tag);
  for (const row of signals?.results || []) context.topicWeights.set(row.tag, Number(row.weight || 0));
  return context;
}

function recencyScore(timestamp, now, horizonDays, maximum) {
  const ageDays = Math.max(0, (now - Number(timestamp || 0)) / DAY);
  return Math.max(0, maximum * (1 - ageDays / horizonDays));
}

function qualityScore(item) {
  const value = Number(item.like_count || 0) * 2
    + Number(item.comment_count || 0) * 3
    + Number(item.clap_total || 0) * 0.15
    + Number(item.view_count || 0) * 0.04;
  return Math.min(14, Math.log1p(Math.max(0, value)) * 2.5);
}

// Give a newly published story enough exposure to collect real reader signals.
// The boost decays over 72 hours and also falls as views arrive, so it cannot
// become permanent manufactured social proof. "Rising" is based only on real
// engagement accumulated during the first week.
function coldStartScore(item, now) {
  const publishedAt = Number(item.published_at || 0);
  if (!publishedAt) return { score: 0, label: null };
  const ageHours = Math.max(0, (now - publishedAt) / 3600);
  const views = Math.max(0, Number(item.view_count || 0));
  const engagement = Math.max(0,
    Number(item.like_count || 0)
      + Number(item.comment_count || 0) * 2
      + Number(item.clap_total || 0) * 0.1,
  );
  const rising = ageHours <= 168 && engagement >= 4;
  if (ageHours > 72) return { score: rising ? 5 : 0, label: rising ? 'Rising' : null };

  const freshness = 1 - ageHours / 72;
  const exposure = Math.min(1, views / 40);
  const score = 12 * freshness * (1 - exposure * 0.65) + (rising ? 5 : 0);
  return { score, label: rising ? 'Rising' : 'New' };
}

function affinityScore(item, context) {
  let score = 0;
  let strongestTopic = null;
  for (const value of item.tags || []) {
    const tag = String(value || '').toLowerCase();
    if (context.explicitTopics.has(tag)) {
      score += 18;
      strongestTopic ||= tag;
    }
    const implicit = context.topicWeights.get(tag) || 0;
    if (implicit > 0) {
      score += Math.min(8, implicit * 0.8);
      strongestTopic ||= tag;
    }
  }
  return { score: Math.min(36, score), strongestTopic };
}

function localityScore(item, context) {
  const language = normalizeLanguage(item.language);
  const region = normalizeRegion(item.region);
  const languageScore = language === context.language ? 16 : language === 'und' ? 3 : 0;
  const regionScore = region === context.region ? 10 : region === 'global' ? 3 : 0;
  return { score: languageScore + regionScore, languageMatch: language === context.language, regionMatch: region === context.region };
}

function stableCompare(a, b, timestampField) {
  if (b.recommendation_score !== a.recommendation_score) return b.recommendation_score - a.recommendation_score;
  const timeDifference = Number(b[timestampField] || 0) - Number(a[timestampField] || 0);
  if (timeDifference) return timeDifference;
  return String(a.id).localeCompare(String(b.id));
}

export function rankBlogs(items, context, { now = Math.floor(Date.now() / 1000) } = {}) {
  const rankingNow = Math.floor(now / 3600) * 3600;
  return items.map((item) => {
    const affinity = affinityScore(item, context);
    const locality = localityScore(item, context);
    const coldStart = coldStartScore(item, rankingNow);
    const reasons = [];
    if (item._reshared) reasons.push('reshared by someone you follow');
    else if (item._followed) reasons.push('from someone you follow');
    if (affinity.strongestTopic) reasons.push(`because you follow #${affinity.strongestTopic}`);
    if (locality.languageMatch) reasons.push(`in ${context.language}`);
    if (locality.regionMatch) reasons.push(`popular in ${context.region}`);
    if (!reasons.length) reasons.push(coldStart.label === 'New' ? 'new on LixBlogs' : 'recent on LixBlogs');
    return {
      ...item,
      recommendation_score: Number((
        (item._reshared ? 54 : 0)
        + (item._followed ? 42 : 0)
        + affinity.score
        + locality.score
        + recencyScore(item.reshared_at || item.published_at, rankingNow, 30, 20)
        + coldStart.score
        + qualityScore(item)
      ).toFixed(4)),
      discovery_label: coldStart.label,
      recommendation_reason: reasons.slice(0, 2),
      recommendation_version: RECOMMENDATION_VERSION,
    };
  }).sort((a, b) => stableCompare(a, b, 'published_at'));
}

// Preserve the ranking order while preventing one prolific author from
// occupying most of a nearby result window. This is deterministic: it picks
// the first eligible candidate from the ranked list and only relaxes the
// author cap when there is no alternative left.
export function diversifyBlogs(items, { windowSize = 6, maxPerAuthor = 2 } = {}) {
  const remaining = [...items];
  const result = [];
  const safeWindow = Math.max(2, Number(windowSize) || 6);
  const safeMaximum = Math.max(1, Number(maxPerAuthor) || 2);
  const authorKey = item => String(item.author_id || item.author?.username || item.id || 'unknown');

  while (remaining.length) {
    const recent = result.slice(-(safeWindow - 1));
    const counts = new Map();
    for (const item of recent) {
      const key = authorKey(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const previousAuthor = result.length ? authorKey(result.at(-1)) : null;
    let index = remaining.findIndex((item) => {
      const key = authorKey(item);
      return key !== previousAuthor && (counts.get(key) || 0) < safeMaximum;
    });
    if (index < 0) {
      index = remaining.findIndex(item => authorKey(item) !== previousAuthor);
    }
    if (index < 0) {
      index = remaining.findIndex(item => (counts.get(authorKey(item)) || 0) < safeMaximum);
    }
    if (index < 0) index = 0;
    result.push(remaining.splice(index, 1)[0]);
  }

  return result;
}

export function rankContests(items, context, { now = Math.floor(Date.now() / 1000) } = {}) {
  const rankingNow = Math.floor(now / 3600) * 3600;
  return items.map((item) => {
    const affinity = affinityScore({ ...item, tags: [...(item.tags || []), ...(item.requiredTopics || [])] }, context);
    const locality = localityScore(item, context);
    const live = item.status === 'live';
    const upcoming = item.status === 'scheduled';
    const closeAt = Number(item.submissionsCloseAt || 0);
    const daysRemaining = Math.max(0, (closeAt - rankingNow) / DAY);
    const timing = live ? 100 + Math.min(8, daysRemaining / 2)
      : upcoming ? 75
      : item.status === 'judging' ? 35
      : item.status === 'completed' ? 10
      : 0;
    const reasons = [];
    if (affinity.strongestTopic) reasons.push(`matches #${affinity.strongestTopic}`);
    if (locality.languageMatch) reasons.push(`in ${context.language}`);
    if (locality.regionMatch) reasons.push(`for ${context.region}`);
    if (live) reasons.push('accepting entries now');
    else if (upcoming) reasons.push('opens soon');
    return {
      ...item,
      recommendation_score: Number((timing + affinity.score + locality.score + Math.min(10, Math.log1p(item.submissionCount || 0) * 3)).toFixed(4)),
      recommendation_reason: reasons.slice(0, 2),
      recommendation_version: RECOMMENDATION_VERSION,
    };
  }).sort((a, b) => stableCompare(a, b, 'startsAt'));
}

export function stripInternalRecommendationFields(item) {
  const { _followed, _reshared, ...publicItem } = item;
  return publicItem;
}
