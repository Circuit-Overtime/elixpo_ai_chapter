const MANAGER_ORG_ROLES = new Set(['admin', 'maintain']);

export async function resolveCollaborationAccess(db, blogId, userId) {
  const blog = await db.prepare(`
    SELECT id, author_id, published_as, status, title, slug
    FROM blogs WHERE id = ? AND deleted_at IS NULL
  `).bind(blogId).first();
  if (!blog) return { blog: null, canRead: false, canManage: false };
  if (blog.author_id === userId) return { blog, canRead: true, canManage: true, role: 'owner' };

  const collaborator = await db.prepare(`
    SELECT role, status FROM blog_co_authors WHERE blog_id = ? AND user_id = ?
  `).bind(blogId, userId).first();
  const accepted = collaborator?.status === 'accepted';
  if (accepted) {
    return {
      blog,
      canRead: true,
      canManage: collaborator.role === 'admin',
      role: collaborator.role,
    };
  }

  if (blog.published_as?.startsWith('org:')) {
    const orgId = blog.published_as.slice(4);
    const membership = await db.prepare(`
      SELECT role FROM org_members WHERE org_id = ? AND user_id = ?
    `).bind(orgId, userId).first();
    if (membership) {
      return {
        blog,
        canRead: true,
        canManage: MANAGER_ORG_ROLES.has(membership.role),
        role: `org:${membership.role}`,
      };
    }
  }
  return { blog, canRead: false, canManage: false, role: collaborator?.role || null };
}

export async function resolveCollaboratorUser(db, value) {
  if (!value) return null;
  return db.prepare(`
    SELECT id, username FROM users WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1
  `).bind(value, value).first();
}

export function serializeCollaborator(row) {
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    status: row.status,
    showOnProfile: Boolean(row.show_on_profile),
    invitedAt: row.added_at,
  };
}
