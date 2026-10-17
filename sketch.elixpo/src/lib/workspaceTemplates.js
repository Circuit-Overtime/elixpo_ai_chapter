export const TEMPLATE_TITLE_MAX = 72
export const TEMPLATE_DESCRIPTION_MAX = 600
export const TEMPLATE_TAG_MAX = 24
export const TEMPLATE_TAGS_MAX = 6
export const TEMPLATE_COVER_MAX_BYTES = 200_000
export const TEMPLATE_SCENE_MAX_BYTES = 12 * 1024 * 1024
export const TEMPLATE_DOC_MAX_BYTES = 5 * 1024 * 1024

export function normalizeTemplateTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, TEMPLATE_TITLE_MAX)
}

export function normalizeTemplateDescription(value) {
  return String(value || '').trim().slice(0, TEMPLATE_DESCRIPTION_MAX)
}

export function normalizeTemplateTags(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',')
  const seen = new Set()
  const tags = []
  for (const item of input) {
    const tag = String(item || '').trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').slice(0, TEMPLATE_TAG_MAX)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length === TEMPLATE_TAGS_MAX) break
  }
  return tags
}

export function templateSlug(title, suffix = '') {
  const base = normalizeTemplateTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'workspace'
  return suffix ? `${base}-${suffix}` : base
}

export function safeTemplateJson(value, fallback = []) {
  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function serializeTemplate(row, options = {}) {
  const template = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    tags: safeTemplateJson(row.tags_json),
    coverDataUrl: options.includeCover === false ? null : row.cover_data_url || null,
    publisher: {
      id: row.publisher_user_id,
      name: row.publisher_name || 'LixSketch creator',
      avatar: row.publisher_avatar || null,
    },
    views: Number(row.view_count || 0),
    forks: Number(row.fork_count || 0),
    clones: Number(row.clone_count || 0),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    status: row.status || 'published',
  }
  if (options.includeSnapshot) {
    template.encryptedData = row.encrypted_data
    template.publicKey = row.public_key
    template.encryptedDocData = row.encrypted_doc_data || null
  }
  if (options.viewerId) template.isOwner = options.viewerId === row.publisher_user_id
  return template
}
