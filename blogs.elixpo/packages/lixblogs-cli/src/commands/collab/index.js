import { requireConfirmation } from '../../cli/contract.js';

function requireBlogId(id) {
  if (!id) throw new Error('A blog ID is required.');
}

export async function collabList({ client, id }) {
  requireBlogId(id);
  return client.list(id);
}

export async function collabInvitations({ client }) {
  return client.invitations();
}

export async function collabInvite({ client, id, options }) {
  requireBlogId(id);
  if (!options.user) throw new Error('--user is required.');
  if (!['viewer', 'editor', 'admin'].includes(options.role)) throw new Error('--role must be viewer, editor, or admin.');
  if (options['dry-run']) return { dryRun: true, action: 'invite', blogId: id, user: options.user, role: options.role };
  requireConfirmation(options, 'Inviting this collaborator');
  return client.invite(id, { user: options.user, role: options.role, idempotencyKey: options['idempotency-key'] });
}

export async function collabRole({ client, id, options }) {
  requireBlogId(id);
  if (!options.user) throw new Error('--user is required.');
  if (!['viewer', 'editor', 'admin'].includes(options.role)) throw new Error('--role must be viewer, editor, or admin.');
  if (options['dry-run']) return { dryRun: true, action: 'role', blogId: id, user: options.user, role: options.role };
  requireConfirmation(options, 'Changing this collaborator role');
  return client.role(id, { user: options.user, role: options.role, idempotencyKey: options['idempotency-key'] });
}

export async function collabRemove({ client, id, options }) {
  requireBlogId(id);
  if (options['dry-run']) return { dryRun: true, action: 'remove', blogId: id, user: options.user || 'self' };
  requireConfirmation(options, 'Removing this collaborator or invitation');
  return client.remove(id, { user: options.user, idempotencyKey: options['idempotency-key'] });
}

export async function collabAccept({ client, id, options }) {
  requireBlogId(id);
  if (options['dry-run']) return { dryRun: true, action: 'accept', blogId: id, showOnProfile: !options['hide-on-profile'] };
  requireConfirmation(options, 'Accepting this collaboration invitation');
  return client.resolveInvitation(id, { action: 'accept', showOnProfile: !options['hide-on-profile'], idempotencyKey: options['idempotency-key'] });
}

export async function collabDecline({ client, id, options }) {
  requireBlogId(id);
  if (options['dry-run']) return { dryRun: true, action: 'decline', blogId: id };
  requireConfirmation(options, 'Declining this collaboration invitation');
  return client.resolveInvitation(id, { action: 'decline', idempotencyKey: options['idempotency-key'] });
}
