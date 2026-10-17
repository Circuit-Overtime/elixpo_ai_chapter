import { requireConfirmation } from '../../cli/contract.js';

export async function commentList({ client, id }) {
  if (!id) throw new Error('A blog ID is required.');
  return client.comments(id);
}

export async function commentAdd({ client, id, options }) {
  if (!id) throw new Error('A blog ID is required.');
  if (!options.content?.trim()) throw new Error('--content is required.');
  return client.comment(id, options.content.trim());
}

export async function commentReply({ client, id, options }) {
  if (!id || !options.parent) throw new Error('A blog ID and --parent comment ID are required.');
  if (!options.content?.trim()) throw new Error('--content is required.');
  return client.comment(id, options.content.trim(), { parentId: options.parent });
}

export async function commentDelete({ client, id, options }) {
  if (!id || !options.comment) throw new Error('A blog ID and --comment ID are required.');
  requireConfirmation(options, 'Deleting this comment');
  return client.deleteComment(id, options.comment);
}
