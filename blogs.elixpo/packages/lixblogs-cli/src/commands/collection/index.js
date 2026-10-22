function requireId(id) {
  if (!id) throw new Error('A collection ID is required.');
}

export const collectionList = ({ client }) => client.list();

export function collectionGet({ client, id }) {
  requireId(id);
  return client.get(id);
}

export function collectionCreate({ client, options }) {
  if (!options.title?.trim()) throw new Error('--title is required.');
  return client.create({
    name: options.title.trim(),
    slug: options.slug,
    description: options.description,
    introduction: options.introduction,
    coverUrl: options.cover,
    visibility: options.visibility || 'private',
  });
}

export function collectionEdit({ client, id, options }) {
  requireId(id);
  return client.update(id, {
    ...(options.title !== undefined ? { name: options.title } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.introduction !== undefined ? { introduction: options.introduction } : {}),
    ...(options.cover !== undefined ? { coverUrl: options.cover } : {}),
    ...(options.visibility !== undefined ? { visibility: options.visibility } : {}),
  });
}

export function collectionDelete({ client, id, options }) {
  requireId(id);
  if (!options.yes) throw new Error('Collection deletion requires --yes.');
  return client.delete(id);
}

export function collectionEntries({ client, id }) {
  requireId(id);
  return client.entries(id);
}

export function collectionAdd({ client, id, options }) {
  requireId(id);
  if (!options.blog) throw new Error('--blog is required.');
  return client.add(id, { blogId: options.blog, curatorNote: options.note, category: options.category });
}

export function collectionRemove({ client, id, options }) {
  requireId(id);
  if (!options.blog) throw new Error('--blog is required.');
  if (!options.yes) throw new Error('Removing a collection entry requires --yes.');
  return client.remove(id, options.blog);
}
