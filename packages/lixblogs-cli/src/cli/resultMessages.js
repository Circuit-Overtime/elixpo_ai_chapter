const BLOG_ACTION_LABELS = {
  create: 'Blog created',
  edit: 'Blog updated',
  publish: 'Blog published',
  unpublish: 'Blog unpublished',
  delete: 'Blog deleted',
  trash: 'Blog moved to trash',
  restore: 'Blog restored',
  'restore-version': 'Blog version restored',
};

export function blogMutationMessage(action, result) {
  const label = action === 'delete' && result?.status === 'trashed'
    ? 'Blog moved to trash'
    : BLOG_ACTION_LABELS[action] || 'Blog updated';
  const status = result?.status ? ` [${result.status}]` : '';
  const url = result?.url ? ` ${result.url}` : '';
  return `${label}${status}${url}`;
}

export function mediaMutationMessage(action, result, blogId) {
  if (action === 'delete') return `Media ${result.id} deleted.`;
  const verb = action === 'generate' ? 'generated' : 'uploaded';
  if (result.blog) return `Image ${verb} and attached to blog ${blogId}.`;
  return `Image ${verb} and stored.`;
}
