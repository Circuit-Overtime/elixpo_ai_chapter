export async function resolveAnalyticsScope(db, userId, requestedScope) {
  if (!requestedScope || requestedScope === 'personal') {
    return {
      key: 'personal',
      label: 'Personal',
      predicate: "b.author_id = ? AND (b.published_as = 'personal' OR b.published_as IS NULL)",
      values: [userId],
      followerEventValues: ['user', userId],
    };
  }

  if (!requestedScope.startsWith('org:')) throw new Error('Invalid analytics scope');
  const orgId = requestedScope.slice(4);
  const org = await db.prepare(`
    SELECT o.id, o.name FROM orgs o
    LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
    WHERE o.id = ? AND (o.owner_id = ? OR om.role IN ('admin', 'maintain'))
  `).bind(userId, orgId, userId).first();
  if (!org) {
    const error = new Error('Not authorized to view organization analytics');
    error.status = 403;
    throw error;
  }
  return {
    key: requestedScope,
    label: org.name,
    predicate: 'b.published_as = ?',
    values: [requestedScope],
    followerEventValues: ['org', orgId],
  };
}

export function buildAnalyticsTrend(from, to, viewRows = [], readRows = []) {
  const day = 86400;
  const byView = Object.fromEntries(viewRows.map(row => [row.day, Number(row.value)]));
  const byRead = Object.fromEntries(readRows.map(row => [row.day, Number(row.value)]));
  const labels = [];
  const views = [];
  const reads = [];
  for (let cursor = Math.floor(from / day) * day; cursor < to; cursor += day) {
    const label = new Date(cursor * 1000).toISOString().slice(0, 10);
    labels.push(label);
    views.push(byView[label] || 0);
    reads.push(byRead[label] || 0);
  }
  return { labels, views, reads };
}
