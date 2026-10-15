const DAY = 86400;
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

export function parseAnalyticsRange(searchParams, now = Math.floor(Date.now() / 1000)) {
  const key = searchParams.get('range') || '30d';
  let from;
  let to = now;

  if (key === 'custom') {
    const requestedFrom = Date.parse(searchParams.get('from') || '') / 1000;
    const requestedTo = Date.parse(searchParams.get('to') || '') / 1000;
    if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo) || requestedFrom > requestedTo) {
      throw new Error('Invalid custom date range');
    }
    from = Math.floor(requestedFrom);
    // SQL ranges use an exclusive upper bound. Adding one full day makes the
    // selected calendar end date inclusive without dropping its last second.
    to = Math.min(now, Math.floor(requestedTo + DAY));
    if (from >= to) throw new Error('Custom date range must begin before today');
  } else {
    const days = RANGE_DAYS[key];
    if (!days) throw new Error('Unsupported date range');
    from = now - (days * DAY);
  }

  if (to - from > 366 * DAY) throw new Error('Date range cannot exceed 366 days');
  const duration = to - from;
  return {
    key,
    from,
    to,
    previousFrom: from - duration,
    previousTo: from,
  };
}

export function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function classifyDevice(userAgent = '') {
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'Tablet';
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'Mobile';
  return 'Desktop';
}

export function classifyReferrer(referrer, siteOrigin = 'https://blogs.elixpo.com') {
  if (!referrer) return { source: 'Direct', domain: null };
  try {
    const url = new URL(referrer);
    const ownHost = new URL(siteOrigin).hostname;
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    if (domain === ownHost || domain.endsWith(`.${ownHost}`)) return { source: 'Internal', domain };
    if (isSearchReferrer(domain)) return { source: 'Search', domain };
    if (isSocialReferrer(domain)) {
      return { source: 'Social', domain };
    }
    return { source: 'External', domain };
  } catch {
    return { source: 'Direct', domain: null };
  }
}

function isSearchReferrer(domain) {
  return /^([a-z0-9-]+\.)*(google|bing|duckduckgo|yahoo|brave)\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain);
}

function isSocialReferrer(domain) {
  if (/^([a-z0-9-]+\.)*x\.com$/.test(domain)) return true;
  if (/^([a-z0-9-]+\.)*mastodon\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)) return true;
  return /^([a-z0-9-]+\.)*(twitter|linkedin|facebook|instagram|reddit|threads)\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain);
}

export function cleanDimension(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) || null : null;
}

export async function rotatingVisitorHash(ip, userId, occurredAt = Math.floor(Date.now() / 1000)) {
  // Rotate anonymous identifiers every 30 days: long enough to measure return
  // visits, short enough to prevent a permanent cross-period identity.
  const rotation = Math.floor(occurredAt / (30 * DAY));
  const input = `${userId || ip || 'unknown'}:${rotation}:lixblogs-analytics-v1`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export const ANALYTICS_EVENT_UPSERT_SQL = `
  INSERT INTO analytics_events (
    id, blog_id, user_id, visitor_hash, event_type, event_value,
    referrer_source, referrer_domain, utm_source, utm_medium, utm_campaign,
    device_category, country_code, occurred_at, dedupe_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(dedupe_key) DO UPDATE SET
    event_value = MAX(COALESCE(analytics_events.event_value, 0), COALESCE(excluded.event_value, 0)),
    utm_source = COALESCE(analytics_events.utm_source, excluded.utm_source),
    utm_medium = COALESCE(analytics_events.utm_medium, excluded.utm_medium),
    utm_campaign = COALESCE(analytics_events.utm_campaign, excluded.utm_campaign)
`;

export async function recordAnalyticsEvent(db, event) {
  const occurredAt = event.occurredAt || Math.floor(Date.now() / 1000);
  const visitorHash = event.visitorHash || await rotatingVisitorHash(event.ip, event.userId, occurredAt);
  const bucket = event.bucket || Math.floor(occurredAt / DAY);
  const dedupeKey = event.dedupeKey || `${event.blogId}:${event.eventType}:${visitorHash}:${bucket}`;
  const referrer = classifyReferrer(event.referrer);

  return db.prepare(ANALYTICS_EVENT_UPSERT_SQL).bind(
    crypto.randomUUID(), event.blogId, event.userId || null, visitorHash,
    event.eventType, Number.isFinite(event.value) ? event.value : null,
    event.referrerSource || referrer.source, event.referrerDomain || referrer.domain,
    cleanDimension(event.utmSource), cleanDimension(event.utmMedium), cleanDimension(event.utmCampaign),
    cleanDimension(event.deviceCategory, 20), cleanDimension(event.countryCode, 2)?.toUpperCase() || null,
    occurredAt, dedupeKey,
  ).run();
}

export function metricDefinition(key) {
  const definitions = {
    views: 'Deduplicated post views recorded at most once per visitor and post in 24 hours.',
    uniqueVisitors: 'Distinct privacy-safe daily visitor identifiers in the selected period.',
    reads: 'Signed-in readers who reached more than 50% of a post.',
    completionRate: 'Completed reads divided by views with measurable reading progress.',
    avgReadProgress: 'Average maximum reading depth across measured reading sessions.',
    avgReadTime: 'Average active dwell time for readers who reached at least 90% of a post.',
    engagementRate: 'Likes, comments, bookmarks, and shares divided by views.',
    followers: 'New followers gained during the selected period.',
  };
  return definitions[key] || '';
}
