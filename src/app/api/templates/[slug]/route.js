import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  normalizeTemplateDescription,
  normalizeTemplateTags,
  normalizeTemplateTitle,
  serializeTemplate,
  TEMPLATE_COVER_MAX_BYTES,
  TEMPLATE_DOC_MAX_BYTES,
  TEMPLATE_SCENE_MAX_BYTES,
} from '@/lib/workspaceTemplates'

export const runtime = 'edge'

const SELECT_TEMPLATE = `SELECT t.*, u.display_name AS publisher_name, u.avatar AS publisher_avatar
  FROM workspace_templates t LEFT JOIN users u ON u.id = t.publisher_user_id WHERE t.slug = ?`

export async function GET(request, context) {
  try {
    const { slug } = await context.params
    const { DB } = getCloudflareBindings()
    const row = await DB.prepare(SELECT_TEMPLATE).bind(slug).first()
    const viewer = await getAuthenticatedUser(request)
    if (!row || (row.status !== 'published' && viewer?.id !== row.publisher_user_id)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    const includeSnapshot = new URL(request.url).searchParams.get('snapshot') === '1'
    if (row.status === 'published' && !includeSnapshot) {
      await DB.prepare('UPDATE workspace_templates SET view_count = view_count + 1 WHERE id = ?').bind(row.id).run()
      row.view_count = Number(row.view_count || 0) + 1
    }
    return NextResponse.json({ template: serializeTemplate(row, { includeSnapshot, viewerId: viewer?.id }) })
  } catch (error) {
    console.error('[api/templates/slug] load failed:', error)
    return NextResponse.json({ error: 'Could not load template' }, { status: 500 })
  }
}

export async function PATCH(request, context) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const { slug } = await context.params
    const { DB } = getCloudflareBindings()
    const existing = await DB.prepare('SELECT * FROM workspace_templates WHERE slug = ?').bind(slug).first()
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (existing.publisher_user_id !== user.id) return NextResponse.json({ error: 'Only the publisher can change this template' }, { status: 403 })
    const body = await request.json()
    if ((body.encryptedData && new Blob([body.encryptedData]).size > TEMPLATE_SCENE_MAX_BYTES) ||
        (body.encryptedDocData && new Blob([body.encryptedDocData]).size > TEMPLATE_DOC_MAX_BYTES) ||
        (body.coverDataUrl && new Blob([body.coverDataUrl]).size > TEMPLATE_COVER_MAX_BYTES)) {
      return NextResponse.json({ error: 'The updated public snapshot is too large' }, { status: 413 })
    }
    if (body.publicKey && (typeof body.publicKey !== 'string' || body.publicKey.length < 32 || body.publicKey.length > 128)) {
      return NextResponse.json({ error: 'The public snapshot key is invalid' }, { status: 400 })
    }
    const status = body.status === 'unpublished' || body.status === 'published' ? body.status : existing.status
    const title = body.title === undefined ? existing.title : normalizeTemplateTitle(body.title)
    if (!title) return NextResponse.json({ error: 'A template title is required' }, { status: 400 })
    const description = body.description === undefined ? existing.description : normalizeTemplateDescription(body.description)
    const tags = body.tags === undefined ? existing.tags_json : JSON.stringify(normalizeTemplateTags(body.tags))
    await DB.prepare(`UPDATE workspace_templates SET title = ?, description = ?, tags_json = ?, status = ?,
      encrypted_data = ?, public_key = ?, encrypted_doc_data = ?, cover_data_url = ?, updated_at = datetime('now')
      WHERE id = ?`).bind(
      title, description, tags, status,
      body.encryptedData || existing.encrypted_data,
      body.publicKey || existing.public_key,
      body.encryptedDocData === undefined ? existing.encrypted_doc_data : body.encryptedDocData,
      body.coverDataUrl === undefined ? existing.cover_data_url : body.coverDataUrl,
      existing.id,
    ).run()
    return NextResponse.json({ ok: true, status })
  } catch (error) {
    console.error('[api/templates/slug] update failed:', error)
    return NextResponse.json({ error: 'Could not update template' }, { status: 500 })
  }
}

export async function DELETE(request, context) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const { slug } = await context.params
    const { DB } = getCloudflareBindings()
    const existing = await DB.prepare('SELECT * FROM workspace_templates WHERE slug = ?').bind(slug).first()
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (existing.publisher_user_id !== user.id) return NextResponse.json({ error: 'Only the publisher can delete this template' }, { status: 403 })
    
    await DB.prepare('DELETE FROM workspace_templates WHERE id = ?').bind(existing.id).run()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/templates/slug] delete failed:', error)
    return NextResponse.json({ error: 'Could not delete template' }, { status: 500 })
  }
}
