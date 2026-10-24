import { blocksToMarkdown } from '../../content/markdown.js';
import { BlogApiError } from '../../api/BlogClient.js';
import { metadataFromOptions, resolveMarkdownInput } from './input.js';
import { validateBlogInput } from '../../content/validate.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireConfirmation } from '../../cli/contract.js';

const MUTATION_ACTIONS = new Set([
  'create',
  'edit',
  'publish',
  'unpublish',
  'delete',
  'trash',
  'restore',
  'restore-version',
]);

export async function enrichBlogMutationResult({ client, action, result }) {
  if (!MUTATION_ACTIONS.has(action) || result?.dryRun || !result?.id) return result;
  if (result.url && result.status) return result;
  try {
    const current = await client.get(result.id);
    return {
      ...result,
      status: current.status || result.status,
      url: current.url || result.url,
    };
  } catch {
    // The write already succeeded. A presentation-only follow-up read must not
    // turn it into a failed command (notably after permanent deletion).
    return result;
  }
}

export async function blogList({ client, options }) {
  return client.list({ status: options.status, limit: options.limit, cursor: options.cursor });
}

export async function blogGet({ client, id }) {
  if (!id) throw new Error('A blog ID is required.');
  const blog = await client.get(id);
  return { ...blog, markdown: blocksToMarkdown(blog.content) };
}

export async function blogCreate({ client, options, stdin }) {
  const source = await resolveMarkdownInput(options, { stdin });
  const input = { ...metadataFromOptions(options), content: source?.blocks || [] };
  validateBlogInput(input);
  if (options['dry-run']) return { dryRun: true, input, markdown: source?.markdown || '' };
  return client.create(input, { idempotencyKey: options['idempotency-key'] });
}

export async function blogEdit({ client, id, options, stdin }) {
  if (!id) throw new Error('A blog ID is required.');
  const current = await client.get(id);
  const source = await resolveMarkdownInput(options, { stdin, initial: blocksToMarkdown(current.content) });
  const input = { ...metadataFromOptions(options), ...(source ? { content: source.blocks } : {}) };
  if (!Object.keys(input).length) throw new Error('No blog changes were provided.');
  validateBlogInput(input);
  if (options['dry-run']) return { dryRun: true, id, etag: current.etag, input, markdown: source?.markdown };
  try {
    return await client.update(id, input, { etag: options.etag || current.etag });
  } catch (error) {
    if (!(error instanceof BlogApiError) || error.code !== 'revision_conflict') throw error;
    const server = await client.get(id);
    const directory = options.conflictDirectory || path.resolve('.lixblogs-conflicts');
    await fs.mkdir(directory, { recursive: true });
    const safeId = id.replace(/[^A-Za-z0-9._-]/g, '_');
    const localPath = path.join(directory, `${safeId}-local.json`);
    const serverPath = path.join(directory, `${safeId}-server.md`);
    await Promise.all([
      fs.writeFile(localPath, JSON.stringify(input, null, 2), { mode: 0o600 }),
      fs.writeFile(serverPath, blocksToMarkdown(server.content), { mode: 0o600 }),
    ]);
    error.details = { ...error.details, localPath, serverPath, serverEtag: server.etag };
    throw error;
  }
}

export async function blogPublish({ client, id, options }) {
  if (!id) throw new Error('A blog ID is required.');
  const current = await client.get(id);
  validateBlogInput(current, { publishing: true });
  const targetStatus = options.status || 'published';
  if (!['published', 'unlisted'].includes(targetStatus)) throw new Error('--status must be published or unlisted.');
  if (options['dry-run']) return { dryRun: true, id, from: current.status, to: targetStatus };
  requireConfirmation(options, 'Publishing this blog');
  return client.publish(id, { etag: options.etag || current.etag, status: targetStatus, idempotencyKey: options['idempotency-key'] });
}

export async function blogHistory({ client, id, options = {} }) {
  if (!id) throw new Error('A blog ID is required.');
  if (options.version) {
    const version = await client.version(id, options.version);
    return { ...version, markdown: blocksToMarkdown(version.content) };
  }
  return { data: await client.versions(id) };
}

export async function blogRestoreVersion({ client, id, options }) {
  if (!id || !options.version) throw new Error('A blog ID and --version are required.');
  requireConfirmation(options, 'Restoring this historical version');
  const current = await client.get(id);
  return client.restoreVersion(id, options.version, { etag: options.etag || current.etag });
}

export async function blogUnpublish({ client, id, options }) {
  if (!id) throw new Error('A blog ID is required.');
  const current = await client.get(id);
  if (options['dry-run']) return { dryRun: true, id, from: current.status, to: 'draft' };
  requireConfirmation(options, 'Unpublishing this blog');
  return client.unpublish(id, { etag: options.etag || current.etag });
}

export async function blogDelete({ client, id, options }) {
  if (!id) throw new Error('A blog ID is required.');
  if (!options.yes) throw new Error('Deletion requires --yes. Trash is the default; add --permanent for irreversible deletion.');
  const current = await client.get(id);
  if (options['dry-run']) return { dryRun: true, id, permanent: options.permanent };
  const result = await client.delete(id, { etag: options.etag || current.etag, permanent: options.permanent });
  return {
    ...result,
    status: options.permanent ? 'deleted' : 'trashed',
    url: current.url || result.url,
  };
}

export async function blogRestore({ client, id, options }) {
  if (!id) throw new Error('A blog ID is required.');
  const current = await client.get(id);
  if (options['dry-run']) return { dryRun: true, id, restoreTo: current.preDeleteStatus || 'draft' };
  requireConfirmation(options, 'Restoring this blog');
  return client.restore(id, { etag: options.etag || current.etag });
}
