// Shared blog-edit permission check.
// A user may edit a blog if they are: the author, an org member with
// admin/maintain/write role (for org-published blogs), or an accepted co-author.
// Returns { ok: boolean, notFound?: boolean }.
export async function canEditBlog(db, blogId, userId) {
  if (!userId) return { ok: false };

  const blog = await db
    .prepare('SELECT author_id, published_as FROM blogs WHERE id = ?')
    .bind(blogId)
    .first();
  if (!blog) return { ok: false, notFound: true };

  if (blog.author_id === userId) return { ok: true };

  if (blog.published_as?.startsWith('org:')) {
    const orgId = blog.published_as.slice(4);
    const member = await db
      .prepare(
        "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role IN ('admin','maintain','write')",
      )
      .bind(orgId, userId)
      .first();
    if (member) return { ok: true };
  }

  // Accepted co-authors can edit only with an editor/admin role.
  // 'viewer' is a cross-post/display-only role (no edit).
  const coAuthor = await db
    .prepare("SELECT 1 FROM blog_co_authors WHERE blog_id = ? AND user_id = ? AND status = 'accepted' AND role IN ('editor','admin')")
    .bind(blogId, userId)
    .first();
  if (coAuthor) return { ok: true };

  return { ok: false };
}
