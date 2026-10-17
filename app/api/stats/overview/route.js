export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { metricDefinition, parseAnalyticsRange, percentChange } from '../../../../lib/analytics';
import { buildAnalyticsTrend, resolveAnalyticsScope } from '../../../../lib/statsAnalytics';

function results(value) {
  return value?.results || [];
}

function count(value) {
  return Number(value?.c || 0);
}

async function getPeriodMetrics(db, scope, from, to) {
  const values = scope.values;
  const queries = await Promise.all([
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
    db.prepare(`SELECT COALESCE(AVG(progress), 0) c FROM (
      SELECT reader, MAX(progress) progress FROM (
        SELECT 'u:' || rh.user_id reader, rh.read_progress progress FROM read_history rh JOIN blogs b ON b.id = rh.blog_id WHERE ${scope.predicate} AND rh.read_at >= ? AND rh.read_at < ?
        UNION ALL
        SELECT CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader, CASE WHEN ae.event_type = 'read_complete' THEN 1 ELSE ae.event_value END progress FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type IN ('read_progress', 'read_complete') AND ae.occurred_at >= ? AND ae.occurred_at < ?
      ) GROUP BY reader
    )`).bind(...values, from, to, ...values, from, to).first(),
    db.prepare(`SELECT COUNT(*) c FROM likes x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COUNT(*) c FROM comments x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COUNT(*) c FROM bookmarks x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COALESCE(SUM(x.count), 0) c FROM claps x JOIN blogs b ON b.id = x.blog_id WHERE ${scope.predicate} AND x.created_at >= ? AND x.created_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COUNT(*) c FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'share' AND ae.occurred_at >= ? AND ae.occurred_at < ?`).bind(...values, from, to).first(),
    db.prepare(`SELECT COALESCE(AVG(ae.event_value), 0) c FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'read_complete' AND ae.event_value > 0 AND ae.occurred_at >= ? AND ae.occurred_at < ?`).bind(...values, from, to).first(),
    db.prepare('SELECT COUNT(CASE WHEN delta = 1 THEN 1 END) gained, COUNT(CASE WHEN delta = -1 THEN 1 END) lost, COALESCE(SUM(delta), 0) net FROM creator_follow_events WHERE target_type = ? AND target_id = ? AND occurred_at >= ? AND occurred_at < ?').bind(...scope.followerEventValues, from, to).first(),
  ]);

  const followerEvents = queries.at(-1);
  const [views, uniqueVisitors, reads, completions, avgProgress, likes, comments, bookmarks, claps, shares, avgReadTime] = queries.slice(0, -1).map(count);
  const engagements = likes + comments + bookmarks + shares;
  return {
    views,
    uniqueVisitors,
    reads,
    completionRate: reads ? Math.round((completions / reads) * 1000) / 10 : 0,
    avgReadProgress: Math.round(avgProgress * 1000) / 10,
    avgReadTime: Math.round(avgReadTime),
    likes,
    comments,
    bookmarks,
    claps,
    shares,
    engagementRate: views ? Math.round((engagements / views) * 1000) / 10 : 0,
    followers: Number(followerEvents?.gained || 0),
    followersLost: Number(followerEvents?.lost || 0),
    netFollowers: Number(followerEvents?.net || 0),
  };
}

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const params = new URL(request.url).searchParams;
    const range = parseAnalyticsRange(params);
    const scope = await resolveAnalyticsScope(db, session.userId, params.get('scope'));
    const values = scope.values;

    const [current, previous, published, drafts, dailyViews, dailyReads, topPosts, sources, referrers, campaigns, devices, countries, audience, eventCount, impressions] = await Promise.all([
      getPeriodMetrics(db, scope, range.from, range.to),
      getPeriodMetrics(db, scope, range.previousFrom, range.previousTo),
      db.prepare(`SELECT COUNT(*) c FROM blogs b WHERE ${scope.predicate} AND b.status = 'published'`).bind(...values).first(),
      db.prepare(`SELECT COUNT(*) c FROM blogs b WHERE ${scope.predicate} AND b.status = 'draft'`).bind(...values).first(),
      db.prepare(`SELECT date(bv.created_at, 'unixepoch') day, COUNT(*) value FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id WHERE ${scope.predicate} AND bv.created_at >= ? AND bv.created_at < ? GROUP BY day ORDER BY day`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT day, COUNT(DISTINCT reader) value FROM (
        SELECT date(rh.read_at, 'unixepoch') day, 'u:' || rh.user_id reader FROM read_history rh JOIN blogs b ON b.id = rh.blog_id WHERE ${scope.predicate} AND rh.read_progress > .5 AND rh.read_at >= ? AND rh.read_at < ?
        UNION ALL
        SELECT date(ae.occurred_at, 'unixepoch') day, CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND (ae.event_type = 'read_complete' OR (ae.event_type = 'read_progress' AND ae.event_value > .5)) AND ae.occurred_at >= ? AND ae.occurred_at < ?
      ) GROUP BY day ORDER BY day`).bind(...values, range.from, range.to, ...values, range.from, range.to).all(),
      db.prepare(`
        WITH scoped_blogs AS (
          SELECT b.id FROM blogs b WHERE ${scope.predicate}
        ), view_totals AS (
          SELECT blog_views.blog_id, COUNT(*) views, COUNT(DISTINCT ip_hash) unique_visitors
          FROM blog_views JOIN scoped_blogs ON scoped_blogs.id = blog_views.blog_id
          WHERE created_at >= ? AND created_at < ? GROUP BY blog_views.blog_id
        ), read_sessions AS (
          SELECT read_history.blog_id, 'u:' || user_id reader, read_progress progress
          FROM read_history JOIN scoped_blogs ON scoped_blogs.id = read_history.blog_id
          WHERE read_at >= ? AND read_at < ?
          UNION ALL
          SELECT analytics_events.blog_id, CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id ELSE 'v:' || visitor_hash END reader,
            CASE WHEN event_type = 'read_complete' THEN 1 ELSE event_value END progress
          FROM analytics_events JOIN scoped_blogs ON scoped_blogs.id = analytics_events.blog_id
          WHERE event_type IN ('read_progress', 'read_complete') AND occurred_at >= ? AND occurred_at < ?
        ), read_max AS (
          SELECT blog_id, reader, MAX(progress) progress FROM read_sessions GROUP BY blog_id, reader
        ), read_totals AS (
          SELECT blog_id, COUNT(CASE WHEN progress > .5 THEN 1 END) reads,
            COUNT(CASE WHEN progress >= .9 THEN 1 END) completions, AVG(progress) avg_progress
          FROM read_max GROUP BY blog_id
        ), like_totals AS (
          SELECT likes.blog_id, COUNT(*) likes FROM likes JOIN scoped_blogs ON scoped_blogs.id = likes.blog_id WHERE created_at >= ? AND created_at < ? GROUP BY likes.blog_id
        ), comment_totals AS (
          SELECT comments.blog_id, COUNT(*) comments FROM comments JOIN scoped_blogs ON scoped_blogs.id = comments.blog_id WHERE created_at >= ? AND created_at < ? GROUP BY comments.blog_id
        ), bookmark_totals AS (
          SELECT bookmarks.blog_id, COUNT(*) bookmarks FROM bookmarks JOIN scoped_blogs ON scoped_blogs.id = bookmarks.blog_id WHERE created_at >= ? AND created_at < ? GROUP BY bookmarks.blog_id
        ), event_totals AS (
          SELECT analytics_events.blog_id, AVG(CASE WHEN event_type = 'read_complete' AND event_value > 0 THEN event_value END) avg_read_time
          FROM analytics_events JOIN scoped_blogs ON scoped_blogs.id = analytics_events.blog_id
          WHERE occurred_at >= ? AND occurred_at < ? GROUP BY analytics_events.blog_id
        )
        SELECT b.id, b.title, b.slug, b.published_at,
          COALESCE(v.views, 0) views, COALESCE(v.unique_visitors, 0) unique_visitors,
          COALESCE(r.reads, 0) reads, COALESCE(r.completions, 0) completions,
          COALESCE(r.avg_progress, 0) avg_progress, COALESCE(l.likes, 0) likes,
          COALESCE(c.comments, 0) comments, COALESCE(bm.bookmarks, 0) bookmarks,
          COALESCE(e.avg_read_time, 0) avg_read_time
        FROM blogs b JOIN scoped_blogs sb ON sb.id = b.id
        LEFT JOIN view_totals v ON v.blog_id = b.id
        LEFT JOIN read_totals r ON r.blog_id = b.id
        LEFT JOIN like_totals l ON l.blog_id = b.id
        LEFT JOIN comment_totals c ON c.blog_id = b.id
        LEFT JOIN bookmark_totals bm ON bm.blog_id = b.id
        LEFT JOIN event_totals e ON e.blog_id = b.id
        WHERE b.status = 'published'
        ORDER BY views DESC LIMIT 100
      `).bind(...values, range.from, range.to, range.from, range.to, range.from, range.to, range.from, range.to, range.from, range.to, range.from, range.to, range.from, range.to).all(),
      db.prepare(`SELECT COALESCE(ae.referrer_source, 'Direct') label, COUNT(*) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT ae.referrer_domain label, COUNT(*) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.referrer_domain IS NOT NULL AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC LIMIT 10`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT COALESCE(ae.utm_campaign, ae.utm_source) label, COUNT(*) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND COALESCE(ae.utm_campaign, ae.utm_source) IS NOT NULL AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC LIMIT 10`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT COALESCE(ae.device_category, 'Unknown') label, COUNT(DISTINCT ae.visitor_hash) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC`).bind(...values, range.from, range.to).all(),
      db.prepare(`SELECT COALESCE(ae.country_code, 'Unknown') label, COUNT(DISTINCT ae.visitor_hash) value FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ? GROUP BY label ORDER BY value DESC LIMIT 10`).bind(...values, range.from, range.to).all(),
      db.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN first_seen >= ? THEN visitor_hash END) new_readers,
          COUNT(DISTINCT CASE WHEN first_seen < ? THEN visitor_hash END) returning_readers,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN visitor_hash END) signed_in,
          COUNT(DISTINCT CASE WHEN user_id IS NULL THEN visitor_hash END) anonymous
        FROM (
          SELECT ae.visitor_hash, MIN(ae.occurred_at) first_seen, MAX(ae.user_id) user_id
          FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id
          WHERE ${scope.predicate} AND ae.event_type = 'view'
            AND ae.occurred_at >= ? AND ae.occurred_at < ?
          GROUP BY ae.visitor_hash HAVING MAX(ae.occurred_at) >= ?
        )
      `).bind(range.from, range.from, ...values, range.from - (30 * 86400), range.to, range.from).first(),
      db.prepare(`SELECT COUNT(*) c FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'view' AND ae.occurred_at >= ? AND ae.occurred_at < ?`).bind(...values, range.from, range.to).first(),
      db.prepare(`SELECT COUNT(*) c FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE ${scope.predicate} AND ae.event_type = 'impression' AND ae.occurred_at >= ? AND ae.occurred_at < ?`).bind(...values, range.from, range.to).first(),
    ]);

    const changes = Object.fromEntries(Object.keys(current).map(key => [key, percentChange(current[key], previous[key])]));
    const posts = results(topPosts).map(post => {
      const engagement = Number(post.likes) + Number(post.comments) + Number(post.bookmarks);
      return {
        id: post.id,
        title: post.title || 'Untitled',
        slug: post.slug,
        publishedAt: post.published_at,
        views: Number(post.views),
        uniqueVisitors: Number(post.unique_visitors),
        reads: Number(post.reads),
        completionRate: Number(post.reads) ? Math.round((Number(post.completions) / Number(post.reads)) * 1000) / 10 : 0,
        avgReadProgress: Math.round(Number(post.avg_progress) * 1000) / 10,
        avgReadTime: Math.round(Number(post.avg_read_time)),
        engagement,
        engagementRate: Number(post.views) ? Math.round((engagement / Number(post.views)) * 1000) / 10 : 0,
      };
    });

    return NextResponse.json({
      range,
      scope: { key: scope.key, label: scope.label },
      totals: { ...current, published: count(published), drafts: count(drafts) },
      previous,
      changes,
      trend: buildAnalyticsTrend(range.from, range.to, results(dailyViews), results(dailyReads)),
      posts,
      audience: {
        newReaders: Number(audience?.new_readers || 0),
        returningReaders: Number(audience?.returning_readers || 0),
        signedIn: Number(audience?.signed_in || 0),
        anonymous: Number(audience?.anonymous || 0),
        devices: results(devices),
        countries: results(countries),
      },
      acquisition: { sources: results(sources), referrers: results(referrers), campaigns: results(campaigns) },
      funnel: [
        { label: 'Impressions', value: count(impressions) },
        { label: 'Views', value: current.views },
        { label: 'Reads', value: current.reads },
        { label: 'Engagements', value: current.likes + current.comments + current.bookmarks + current.shares },
        { label: 'Follows', value: current.followers },
      ],
      definitions: Object.fromEntries(['views', 'uniqueVisitors', 'reads', 'completionRate', 'avgReadProgress', 'avgReadTime', 'engagementRate', 'followers'].map(key => [key, metricDefinition(key)])),
      dimensionsCollecting: count(eventCount) === 0,
    });
  } catch (error) {
    const status = error.status || (/range|scope/i.test(error.message) ? 400 : 500);
    console.error('[stats/overview] failed:', error);
    return NextResponse.json({ error: error.message || 'Could not load analytics' }, { status });
  }
}
