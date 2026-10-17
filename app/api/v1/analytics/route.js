export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { metricDefinition, parseAnalyticsRange, percentChange } from '../../../../lib/analytics';
import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';
import { buildAnalyticsTrend, resolveAnalyticsScope } from '../../../../lib/statsAnalytics';

const ANALYTICS_SCOPE = 'lixblogs:analytics:read';
const DIMENSIONS = new Set(['overview', 'timeline', 'posts', 'sources', 'devices', 'countries']);

function rows(result) {
  return result?.results || [];
}

function number(value) {
  return Number(value || 0);
}

function parseLimit(value) {
  const limit = value === null ? 20 : Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid_limit');
  return limit;
}

function parseCursor(value) {
  if (!value) return 0;
  try {
    const offset = Number.parseInt(atob(value), 10);
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid_cursor');
    return offset;
  } catch {
    throw new Error('invalid_cursor');
  }
}

function nextCursor(offset) {
  return btoa(String(offset));
}

async function metrics(db, scope, from, to) {
  const values = scope.values;
  const [views, uniqueVisitors, reads, completions, engagements] = await Promise.all([
    db.prepare(`SELECT COUNT(*) c FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id WHERE ${scope.predicate} AND bv.created_at >= ? AND bv.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COUNT(DISTINCT bv.ip_hash) c FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id WHERE ${scope.predicate} AND bv.created_at >= ? AND bv.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COUNT(DISTINCT reader) c FROM (
      SELECT 'u:' || rh.user_id reader FROM read_history rh JOIN blogs b ON b.id = rh.blog_id WHERE ${scope.predicate} AND rh.read_progress > .5 AND rh.read_at >= ? AND rh.read_at < ?
      UNION ALL
      SELECT CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND (ae.event_type = 'read_complete' OR (ae.event_type = 'read_progress' AND ae.event_value > .5)) AND ae.occurred_at >= ? AND ae.occurred_at < ?
    )`).bind(...values, from, to, ...values, from, to).first(),
    db.prepare(`SELECT COUNT(DISTINCT reader) c FROM (
      SELECT 'u:' || rh.user_id reader FROM read_history rh JOIN blogs b ON b.id = rh.blog_id WHERE ${scope.predicate} AND rh.read_progress >= .9 AND rh.read_at >= ? AND rh.read_at < ?
      UNION ALL
      SELECT CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'read_complete' AND ae.occurred_at >= ? AND ae.occurred_at < ?
    )`).bind(...values, from, to, ...values, from, to).first(),
    db.prepare(`SELECT COUNT(*) c FROM (
      SELECT x.blog_id FROM likes x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?
      UNION ALL SELECT x.blog_id FROM comments x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?
      UNION ALL SELECT x.blog_id FROM bookmarks x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?
      UNION ALL SELECT ae.blog_id FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'share' AND ae.occurred_at >= ? AND ae.occurred_at < ?
    )`).bind(...values, from, to, ...values, from, to, ...values, from, to, ...values, from, to).first(),
  ]);
  const result = {
    views: number(views?.c), uniqueVisitors: number(uniqueVisitors?.c), reads: number(reads?.c),
    completionRate: number(reads?.c) ? Math.round((number(completions?.c) / number(reads?.c)) * 1000) / 10 : 0,
    engagementRate: number(views?.c) ? Math.round((number(engagements?.c) / number(views?.c)) * 1000) / 10 : 0,
  };
  return result;
}

async function dimensionData(db, scope, dimension, range, limit, offset) {
  const values = scope.values;
  if (dimension === 'overview') {
    const [current, previous] = await Promise.all([
      metrics(db, scope, range.from, range.to),
      metrics(db, scope, range.previousFrom, range.previousTo),
    ]);
    return {
      data: { totals: current, previous, changes: Object.fromEntries(Object.keys(current).map((key) => [key, percentChange(current[key], previous[key])])) },
      meta: {},
    };
  }
  if (dimension === 'timeline') {
    const [viewRows, readRows] = await Promise.all([
      db.prepare(`SELECT date(bv.created_at, 'unixepoch') day, COUNT(*) value FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id WHERE ${scope.predicate} AND bv.created_at >= ? AND bv.created_at < ? GROUP BY day ORDER BY day`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT day, COUNT(DISTINCT reader) value FROM (
        SELECT date(rh.read_at, 'unixepoch') day, 'u:' || rh.user_id reader FROM read_history rh JOIN blogs b ON b.id = rh.blog_id WHERE ${scope.predicate} AND rh.read_progress > .5 AND rh.read_at >= ? AND rh.read_at < ?
        UNION ALL
        SELECT date(ae.occurred_at, 'unixepoch') day, CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND (ae.event_type = 'read_complete' OR (ae.event_type = 'read_progress' AND ae.event_value > .5)) AND ae.occurred_at >= ? AND ae.occurred_at < ?
      ) GROUP BY day ORDER BY day`).bind(...values, range.from, range.to, ...values, range.from, range.to).all(),
    ]);
    return { data: buildAnalyticsTrend(range.from, range.to, rows(viewRows), rows(readRows)), meta: {} };
  }

  const dimensionSql = {
    sources: `SELECT COALESCE(ae.referrer_source, 'Direct') label, COUNT(*) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC, label LIMIT ? OFFSET ?`,
    devices: `SELECT COALESCE(ae.device_category, 'Unknown') label, COUNT(DISTINCT ae.visitor_hash) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC, label LIMIT ? OFFSET ?`,
    countries: `SELECT COALESCE(ae.country_code, 'Unknown') label, COUNT(DISTINCT ae.visitor_hash) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC, label LIMIT ? OFFSET ?`,
    posts: `SELECT b.id, b.slug, COALESCE(b.title, 'Untitled') title, COUNT(bv.id) views, COUNT(DISTINCT bv.ip_hash) unique_visitors FROM blogs b LEFT JOIN blog_views bv ON bv.blog_id = b.id AND bv.created_at >= ? AND bv.created_at < ? WHERE ${scope.predicate} AND b.status = 'published' GROUP BY b.id ORDER BY views DESC, b.id LIMIT ? OFFSET ?`,
  };
  const bindings = dimension === 'posts'
    ? [range.from, range.to, ...values, limit + 1, offset]
    : [...values, range.from, range.to, limit + 1, offset];
  const result = rows(await db.prepare(dimensionSql[dimension]).bind(...bindings).all());
  const hasMore = result.length > limit;
  return { data: hasMore ? result.slice(0, limit) : result, meta: { limit, hasMore, nextCursor: hasMore ? nextCursor(offset + limit) : null } };
}

export async function GET(request) {
  const context = requestContext();
  const params = new URL(request.url).searchParams;
  const requestedScope = params.get('scope') || 'personal';
  const requiredScopes = [ANALYTICS_SCOPE, ...(requestedScope.startsWith('org:') ? ['lixblogs:organizations:read'] : [])];
  const authorized = await authorizeApiRequest(request, context, requiredScopes, 'analytics.read');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const dimension = params.get('dimension') || 'overview';
    if (!DIMENSIONS.has(dimension)) throw new Error('invalid_dimension');
    const range = parseAnalyticsRange(params);
    const scope = await resolveAnalyticsScope(db, auth.userId, requestedScope);
    const limit = parseLimit(params.get('limit'));
    const offset = parseCursor(params.get('cursor'));
    const result = await dimensionData(db, scope, dimension, range, limit, offset);
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'analytics.read', resourceType: 'analytics', resourceId: scope.key });
    return apiSuccess(context, {
      scope: { key: scope.key, label: scope.label },
      range: { key: range.key, from: range.from, to: range.to },
      dimension,
      values: result.data,
      definitions: Object.fromEntries(['views', 'uniqueVisitors', 'reads', 'completionRate', 'engagementRate'].map((key) => [key, metricDefinition(key)])),
    }, { meta: result.meta, headers: rateHeaders });
  } catch (error) {
    const code = ['invalid_limit', 'invalid_cursor', 'invalid_dimension'].includes(error.message) ? error.message : /range|scope/i.test(error.message) ? 'invalid_request' : null;
    if (code) return apiError(context, code, 'The analytics query is invalid.', 400, { headers: rateHeaders });
    if (error.status === 403) return apiError(context, 'forbidden_scope', error.message, 403, { headers: rateHeaders });
    console.error('[api/v1/analytics] failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Analytics could not be loaded.', 500, { headers: rateHeaders });
  }
}
