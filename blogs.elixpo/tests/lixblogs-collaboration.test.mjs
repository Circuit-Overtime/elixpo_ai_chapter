import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollaborationAccess } from '../lib/api/v1/collaboration.js';

function database({ blog, collaborator, membership } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM blogs')) return blog || null;
              if (sql.includes('FROM blog_co_authors')) return collaborator || null;
              if (sql.includes('FROM org_members')) return membership || null;
              return null;
            },
          };
        },
      };
    },
  };
}

const personalBlog = { id: 'blog-1', author_id: 'owner', published_as: 'personal' };

test('owner can inspect and manage collaborators', async () => {
  const access = await resolveCollaborationAccess(database({ blog: personalBlog }), 'blog-1', 'owner');
  assert.equal(access.canRead, true);
  assert.equal(access.canManage, true);
  assert.equal(access.role, 'owner');
});

test('pending and viewer roles do not gain edit or management authority', async () => {
  const pending = await resolveCollaborationAccess(database({ blog: personalBlog, collaborator: { role: 'admin', status: 'pending' } }), 'blog-1', 'invitee');
  assert.equal(pending.canRead, false);
  assert.equal(pending.canManage, false);

  const viewer = await resolveCollaborationAccess(database({ blog: personalBlog, collaborator: { role: 'viewer', status: 'accepted' } }), 'blog-1', 'reviewer');
  assert.equal(viewer.canRead, true);
  assert.equal(viewer.canManage, false);
});

test('only accepted admins and organization managers can manage teams', async () => {
  const admin = await resolveCollaborationAccess(database({ blog: personalBlog, collaborator: { role: 'admin', status: 'accepted' } }), 'blog-1', 'admin');
  assert.equal(admin.canManage, true);

  const orgBlog = { ...personalBlog, published_as: 'org:org-1' };
  const writer = await resolveCollaborationAccess(database({ blog: orgBlog, membership: { role: 'write' } }), 'blog-1', 'writer');
  assert.equal(writer.canRead, true);
  assert.equal(writer.canManage, false);
  const maintainer = await resolveCollaborationAccess(database({ blog: orgBlog, membership: { role: 'maintain' } }), 'blog-1', 'maintainer');
  assert.equal(maintainer.canManage, true);
});
