import { CREATOR_BADGE_MAP, CREATOR_BADGES, badgeProgress, longestConsecutiveWeeks } from './badgeDefinitions';

export { CREATOR_BADGE_MAP, CREATOR_BADGES, badgeProgress, longestConsecutiveWeeks } from './badgeDefinitions';

async function collectMetrics(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  const eightWeeksAgo = now - (8 * 7 * 86400);
  const [
    user,
    stories,
    topics,
    collection,
    deepDives,
    activeWeeks,
    allWeeks,
    readers,
    bookmarks,
    shares,
    completion,
    returning,
    collaboration,
    conversation,
    replies,
    publication,
  ] = await Promise.all([
    db.prepare('SELECT avatar_url, banner_r2_key, bio, website, created_at FROM users WHERE id = ?').bind(userId).first(),
    db.prepare("SELECT COUNT(*) c FROM blogs WHERE author_id = ? AND status = 'published' AND secret = 0").bind(userId).first(),
    db.prepare("SELECT COUNT(DISTINCT bt.tag) c FROM blog_tags bt JOIN blogs b ON b.id = bt.blog_id WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0").bind(userId).first(),
    db.prepare("SELECT COALESCE(MAX(c), 0) c FROM (SELECT COUNT(*) c FROM blogs WHERE author_id = ? AND status = 'published' AND secret = 0 AND collection_id IS NOT NULL GROUP BY collection_id)").bind(userId).first(),
    db.prepare(`
      SELECT COUNT(*) c FROM blogs b
      WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND b.read_time_minutes >= 7
        AND (SELECT COALESCE(AVG(CASE WHEN ae.event_type = 'read_complete' THEN 1 ELSE ae.event_value END), 0)
             FROM analytics_events ae WHERE ae.blog_id = b.id AND ae.event_type IN ('read_progress', 'read_complete')
               AND (ae.user_id IS NULL OR ae.user_id != ?)) >= .4
        AND (SELECT COUNT(DISTINCT ae.visitor_hash) FROM analytics_events ae
             WHERE ae.blog_id = b.id AND ae.event_type IN ('read_progress', 'read_complete')
               AND (ae.user_id IS NULL OR ae.user_id != ?)) >= 10
    `).bind(userId, userId, userId).first(),
    db.prepare("SELECT COUNT(DISTINCT strftime('%Y-%W', published_at, 'unixepoch')) c FROM blogs WHERE author_id = ? AND status = 'published' AND secret = 0 AND published_at >= ?").bind(userId, eightWeeksAgo).first(),
    db.prepare("SELECT DISTINCT CAST(published_at / 604800 AS INTEGER) week_key FROM blogs WHERE author_id = ? AND status = 'published' AND secret = 0 ORDER BY week_key").bind(userId).all(),
    db.prepare(`
      SELECT COUNT(DISTINCT CASE WHEN bv.user_id IS NOT NULL THEN 'u:' || bv.user_id ELSE 'v:' || bv.ip_hash END) c
      FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id
      WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND (bv.user_id IS NULL OR bv.user_id != ?)
    `).bind(userId, userId).first(),
    db.prepare("SELECT COUNT(DISTINCT bk.user_id) c FROM bookmarks bk JOIN blogs b ON b.id = bk.blog_id WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND bk.user_id != ?").bind(userId, userId).first(),
    db.prepare("SELECT COUNT(*) c FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND ae.event_type = 'share' AND (ae.user_id IS NULL OR ae.user_id != ?)").bind(userId, userId).first(),
    db.prepare(`
      SELECT COUNT(*) reads, COALESCE(AVG(progress), 0) average FROM (
        SELECT ae.blog_id, CASE WHEN ae.user_id IS NOT NULL THEN 'u:' || ae.user_id ELSE 'v:' || ae.visitor_hash END reader,
          MAX(CASE WHEN ae.event_type = 'read_complete' THEN 1 ELSE ae.event_value END) progress
        FROM analytics_events ae JOIN blogs b ON b.id = ae.blog_id
        WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND ae.event_type IN ('read_progress', 'read_complete') AND (ae.user_id IS NULL OR ae.user_id != ?)
        GROUP BY ae.blog_id, reader
      )
    `).bind(userId, userId).first(),
    db.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT CASE WHEN bv.user_id IS NOT NULL THEN 'u:' || bv.user_id ELSE 'v:' || bv.ip_hash END reader
        FROM blog_views bv JOIN blogs b ON b.id = bv.blog_id
        WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND (bv.user_id IS NULL OR bv.user_id != ?)
        GROUP BY reader HAVING COUNT(DISTINCT date(bv.created_at, 'unixepoch')) >= 2
      )
    `).bind(userId, userId).first(),
    db.prepare(`
      WITH my_collaborations AS (
        SELECT DISTINCT b.id, b.author_id FROM blogs b
        WHERE b.status = 'published' AND b.secret = 0
          AND (b.author_id = ? OR EXISTS (
            SELECT 1 FROM blog_co_authors mine
            WHERE mine.blog_id = b.id AND mine.user_id = ? AND mine.status = 'accepted'
          ))
          AND EXISTS (SELECT 1 FROM blog_co_authors any_coauthor WHERE any_coauthor.blog_id = b.id AND any_coauthor.status = 'accepted')
      ), peers AS (
        SELECT id, author_id peer_id FROM my_collaborations WHERE author_id != ?
        UNION
        SELECT mine.id, ca.user_id peer_id FROM my_collaborations mine
        JOIN blog_co_authors ca ON ca.blog_id = mine.id
        WHERE ca.status = 'accepted' AND ca.user_id != ?
      )
      SELECT (SELECT COUNT(*) FROM my_collaborations) stories, COUNT(DISTINCT peer_id) peers FROM peers
    `).bind(userId, userId, userId, userId).first(),
    db.prepare("SELECT COUNT(*) comments, COUNT(DISTINCT c.user_id) readers FROM comments c JOIN blogs b ON b.id = c.blog_id WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND c.user_id != ?").bind(userId, userId).first(),
    db.prepare("SELECT COUNT(DISTINCT c.blog_id) c FROM comments c JOIN comments parent ON parent.id = c.parent_id JOIN blogs b ON b.id = c.blog_id WHERE c.user_id = ? AND b.author_id = ? AND b.status = 'published' AND b.secret = 0 AND parent.user_id != ?").bind(userId, userId, userId).first(),
    db.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT o.id FROM orgs o
        LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
        JOIN blogs b ON b.published_as = 'org:' || o.id AND b.status = 'published' AND b.secret = 0
        WHERE o.owner_id = ? OR om.role IN ('admin', 'maintain')
        GROUP BY o.id HAVING COUNT(DISTINCT b.id) >= 25 AND COUNT(DISTINCT b.author_id) >= 3
      )
    `).bind(userId, userId).first(),
  ]);

  const collaborativeStories = Number(collaboration?.stories || 0);
  const collaborationPeers = Number(collaboration?.peers || 0);
  return {
    publishedStories: Number(stories?.c || 0),
    profileComplete: Number(!!(user?.avatar_url && user?.banner_r2_key && user?.bio && user?.website)),
    distinctTopics: Number(topics?.c || 0),
    largestCollection: Number(collection?.c || 0),
    deepDiveStories: Number(deepDives?.c || 0),
    activeWeeks8: Number(activeWeeks?.c || 0),
    longestWeeklyStreak: longestConsecutiveWeeks((allWeeks?.results || []).map((row) => row.week_key)),
    uniqueReaders: Number(readers?.c || 0),
    distinctBookmarks: Number(bookmarks?.c || 0),
    qualifiedShares: Number(shares?.c || 0),
    completionQualified: Number(Number(completion?.reads || 0) >= 500 && Number(completion?.average || 0) >= .6),
    returningReaders: Number(returning?.c || 0),
    collaborativeStories,
    creativePartnerQualified: Number(collaborativeStories >= 5 && collaborationPeers >= 3),
    teamPlayerQualified: Number(collaborativeStories >= 20 && collaborationPeers >= 10),
    conversationQualified: Number(Number(conversation?.comments || 0) >= 100 && Number(conversation?.readers || 0) >= 25),
    repliedStories: Number(replies?.c || 0),
    publicationBuilderQualified: Number(Number(publication?.c || 0) > 0),
  };
}

export async function evaluateCreatorBadges(db, userId) {
  const metrics = await collectMetrics(db, userId);
  const existingResult = await db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').bind(userId).all();
  const existing = new Set((existingResult?.results || []).map((row) => row.badge_id));
  const progress = CREATOR_BADGES.map((definition) => ({
    ...definition,
    ...badgeProgress(definition, metrics),
  }));
  const newlyEarned = progress.filter((item) => item.earned && !existing.has(item.id));
  const now = Math.floor(Date.now() / 1000);

  if (newlyEarned.length) {
    const statements = [];
    for (const item of newlyEarned) {
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO user_badges
          (user_id, badge_id, awarded_at, visible, source, progress_value, progress_target, updated_at)
        VALUES (?, ?, ?, 0, 'automatic', ?, ?, ?)
      `).bind(userId, item.id, now, item.value, item.target || 1, now));
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO badge_award_events (id, user_id, badge_id, event_type, metadata, created_at)
        VALUES (?, ?, ?, 'awarded', ?, ?)
      `).bind(crypto.randomUUID(), userId, item.id, JSON.stringify({ value: item.value, target: item.target }), now));
      // The deterministic primary key makes award notifications idempotent
      // across concurrent evaluations and one-time backfill retries.
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO notifications (
          id, user_id, type, actor_name, target_id, target_title, target_url, created_at
        ) VALUES (?, ?, 'badge_awarded', 'LixBlogs', ?, ?, '/profile#creator-badges', ?)
      `).bind(`badge-awarded:${userId}:${item.id}`, userId, item.id, item.name, now));
    }
    await db.batch(statements);
  }

  return { metrics, progress, newlyEarned };
}

export async function listUserBadges(db, userId, { includeHidden = false } = {}) {
  const result = await db.prepare(`
    SELECT badge_id, awarded_at, visible, pinned_position, source, progress_value, progress_target
    FROM user_badges WHERE user_id = ? ${includeHidden ? '' : 'AND visible = 1'}
    ORDER BY CASE WHEN pinned_position IS NULL THEN 1 ELSE 0 END, pinned_position, awarded_at DESC
  `).bind(userId).all();
  return (result?.results || []).map((row) => ({ ...CREATOR_BADGE_MAP.get(row.badge_id), ...row })).filter((row) => row.id);
}
