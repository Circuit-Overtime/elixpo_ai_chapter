// Hard-purge a user and ALL of their data from blogs.elixpo.
//
// Invoked by the account-revoked webhook (app/api/webhooks/account-revoked)
// when a user revokes the "blogs" app (or deletes their account) on
// accounts.elixpo — the source of truth. See GitHub issue #8.
//
// D1 enforces foreign keys, and several of ours are RESTRICT rather than
// ON DELETE CASCADE (comments.user_id, likes.user_id, orgs.owner_id,
// collections.created_by, …). So we cannot just delete the users row — we
// purge in dependency order and drop the users row last.
//
// Policy decisions (issue #8):
//  • Orgs the user OWNS → transfer to the most senior other admin/member;
//    if the user is the only member, the org and its content are deleted.
//  • @mentions of the user in OTHER blogs are NOT rewritten here — the
//    username is freed (namespace released) and the chip de-links at render
//    time (render-time fallback). See BlogPreview mention rendering.

// Chunk an array so IN-lists stay well under D1's bound-parameter ceiling.
function chunk(arr, size = 50) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// DELETE ... WHERE <col> IN (?,?,…) over a list of ids, chunked.
async function deleteWhereIn(db, table, col, ids) {
  for (const part of chunk(ids)) {
    if (!part.length) continue;
    const ph = part.map(() => '?').join(',');
    await db.prepare(`DELETE FROM ${table} WHERE ${col} IN (${ph})`).bind(...part).run();
  }
}

async function listIds(db, sql, ...binds) {
  const res = await db.prepare(sql).bind(...binds).all();
  return (res?.results || []).map((r) => Object.values(r)[0]);
}

async function collectMediaRows(db, mediaRows, sql, ...binds) {
  const res = await db.prepare(sql).bind(...binds).all();
  for (const row of res?.results || []) {
    if (!row.cloudinary_public_id) continue;
    mediaRows.set(`${row.storage_provider || 'platform_cloudinary'}:${row.storage_cloud_name || ''}:${row.cloudinary_public_id}`, row);
  }
}

// Delete a single org wholesale (only called when the org has no other member).
async function deleteSoloOrg(db, orgId, mediaRows) {
  const orgBlogIds = await listIds(db, "SELECT id FROM blogs WHERE published_as = ?", `org:${orgId}`);
  if (orgBlogIds.length) {
    await collectMediaRows(db, mediaRows,
      `SELECT user_id, cloudinary_public_id, storage_provider, storage_cloud_name
       FROM media_uploads WHERE blog_id IN (${orgBlogIds.map(() => '?').join(',')})`,
      ...orgBlogIds);
    await deleteBlogScoped(db, orgBlogIds);
    await deleteWhereIn(db, 'blogs', 'id', orgBlogIds);
  }
  // collections + org_invites cascade on org delete, but D1 cascade reliability
  // varies — delete explicitly so the orgs row drop can't be blocked.
  await db.prepare('DELETE FROM collections WHERE org_id = ?').bind(orgId).run();
  await db.prepare('DELETE FROM org_invites WHERE org_id = ?').bind(orgId).run();
  await db.prepare('DELETE FROM org_members WHERE org_id = ?').bind(orgId).run();
  const org = await db.prepare('SELECT slug FROM orgs WHERE id = ?').bind(orgId).first();
  await db.prepare('DELETE FROM orgs WHERE id = ?').bind(orgId).run();
  if (org?.slug) {
    const { releaseName } = await import('./namespace');
    await releaseName(db, org.slug);
  }
}

// Delete every child row keyed by a set of blog ids (the blogs themselves are
// deleted by the caller afterwards).
async function deleteBlogScoped(db, blogIds) {
  if (!blogIds.length) return;
  // Replies on these blogs may point at parent comments on the same blogs —
  // all go together, so no parent_id orphaning here.
  for (const table of [
    'subpages', 'blog_collab_state', 'blog_views', 'reports', 'read_history',
    'bookmarks', 'claps', 'likes', 'comments', 'blog_tags', 'blog_co_authors',
    'media_uploads',
  ]) {
    await deleteWhereIn(db, table, 'blog_id', blogIds);
  }
  await deleteWhereIn(db, 'notifications', 'target_id', blogIds);
}

/**
 * @param {D1Database} db
 * @param {string} userId  blogs.elixpo users.id (== accounts.elixpo user id)
 * @param {object} [opts]
 * @param {boolean} [opts.deleteMedia=true]  also destroy Cloudinary assets
 * @returns {Promise<object>} purge summary
 */
export async function purgeUser(db, userId, opts = {}) {
  const deleteMedia = opts.deleteMedia !== false;
  const summary = {
    userId, found: false, blogsDeleted: 0,
    orgsTransferred: 0, orgsDeleted: 0, mediaDeleted: 0,
  };

  const user = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(userId).first();
  if (!user) return summary; // already gone — idempotent no-op
  summary.found = true;
  const username = user.username;
  const mediaRows = new Map();

  // ── 1. Orgs the user owns: transfer or delete ──
  const ownedOrgs = await listIds(db, 'SELECT id FROM orgs WHERE owner_id = ?', userId);
  for (const orgId of ownedOrgs) {
    const heir = await db.prepare(
      `SELECT user_id FROM org_members WHERE org_id = ? AND user_id != ?
       ORDER BY (role = 'admin') DESC, (role = 'maintain') DESC, joined_at ASC LIMIT 1`
    ).bind(orgId, userId).first();
    if (heir?.user_id) {
      await db.prepare('UPDATE orgs SET owner_id = ? WHERE id = ?').bind(heir.user_id, orgId).run();
      await db.prepare("UPDATE org_members SET role = 'admin' WHERE org_id = ? AND user_id = ?")
        .bind(orgId, heir.user_id).run();
      summary.orgsTransferred++;
    } else {
      await deleteSoloOrg(db, orgId, mediaRows);
      summary.orgsDeleted++;
    }
  }

  // ── 2. The user's own blogs + everything scoped to them ──
  const blogIds = await listIds(db, 'SELECT id FROM blogs WHERE author_id = ?', userId);
  if (blogIds.length) {
    await collectMediaRows(db, mediaRows,
      `SELECT user_id, cloudinary_public_id, storage_provider, storage_cloud_name
       FROM media_uploads WHERE blog_id IN (${blogIds.map(() => '?').join(',')})`,
      ...blogIds);
    await deleteBlogScoped(db, blogIds);
    await deleteWhereIn(db, 'blogs', 'id', blogIds);
    summary.blogsDeleted = blogIds.length;
  }

  // Collect the user's own uploaded media (avatars, images on others' blogs).
  await collectMediaRows(db, mediaRows,
    `SELECT user_id, cloudinary_public_id, storage_provider, storage_cloud_name
     FROM media_uploads WHERE user_id = ?`, userId);

  // ── 3. Re-home RESTRICT/NOT NULL refs on still-live orgs ──
  // Collections / invites the user created in transferred or member orgs can't
  // be nulled (NOT NULL) or deleted (live org) — reassign to the org's owner.
  await db.prepare(
    'UPDATE collections SET created_by = (SELECT owner_id FROM orgs WHERE orgs.id = collections.org_id) WHERE created_by = ?'
  ).bind(userId).run();
  await db.prepare(
    'UPDATE org_invites SET created_by = (SELECT owner_id FROM orgs WHERE orgs.id = org_invites.org_id) WHERE created_by = ?'
  ).bind(userId).run();

  // ── 4. Rows where the user is the actor (on OTHER people's content) ──
  // Detach replies hanging off the user's comments on other blogs first.
  await db.prepare(
    'UPDATE comments SET parent_id = NULL WHERE parent_id IN (SELECT id FROM comments WHERE user_id = ?)'
  ).bind(userId).run();

  for (const table of [
    'blog_co_authors', 'comments', 'likes', 'claps', 'bookmarks',
    'bookmark_collections', 'read_history', 'user_interests', 'user_signals',
    'search_history', 'media_uploads', 'org_members',
  ]) {
    await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
  }
  await db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').bind(userId, userId).run();
  await db.prepare('DELETE FROM notifications WHERE user_id = ? OR actor_id = ?').bind(userId, userId).run();
  // Anonymise rows we keep for others' integrity (nullable, no NOT NULL).
  await db.prepare('UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?').bind(userId).run();
  await db.prepare('UPDATE blog_views SET user_id = NULL WHERE user_id = ?').bind(userId).run();

  // ── 5. Best-effort external cleanup while creator connection credentials
  // are still available. It never blocks the database purge.
  if (deleteMedia) {
    try {
      const { deleteTrackedMedia } = await import('./mediaStorage');
      const { userAvatarPublicId } = await import('./cloudinary');
      if (username) {
        const publicId = userAvatarPublicId(username);
        mediaRows.set(`platform_cloudinary::${publicId}`, {
          user_id: userId, cloudinary_public_id: publicId, storage_provider: 'platform_cloudinary', storage_cloud_name: null,
        });
      }
      const bannerId = `lixblogs/users/${userId}/banner`;
      mediaRows.set(`platform_cloudinary::${bannerId}`, {
        user_id: userId, cloudinary_public_id: bannerId, storage_provider: 'platform_cloudinary', storage_cloud_name: null,
      });
      for (const media of mediaRows.values()) {
        try { await deleteTrackedMedia(db, media); summary.mediaDeleted++; } catch {}
      }
    } catch {}
  }

  try {
    const { recalculatePlatformStorage } = await import('./mediaStorage');
    await recalculatePlatformStorage(db, [...mediaRows.values()].map((media) => media.user_id).filter((id) => id !== userId));
  } catch {}

  // ── 6. Free the username, then drop the user ──
  if (username) {
    const { releaseName } = await import('./namespace');
    await releaseName(db, username);
  }
  await db.prepare('DELETE FROM cloudinary_connections WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  // ── 7. Best-effort cache cleanup ──
  try {
    const { kvInvalidate, mediaInventoryCacheKey } = await import('./cache');
    await kvInvalidate(`v1:user:${userId}`, mediaInventoryCacheKey(userId));
  } catch {}

  return summary;
}
