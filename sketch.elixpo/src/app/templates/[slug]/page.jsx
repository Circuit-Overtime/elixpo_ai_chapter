'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import LandingNav from '@/components/landing/LandingNav'
import useAuth from '@/hooks/useAuth'
import useAuthStore from '@/store/useAuthStore'
import { decrypt, encrypt, generateKey } from '@/utils/encryption'
import { rememberCanvasId } from '@/utils/canvasSession'

export default function TemplateDetailPage() {
  const { slug } = useParams()
  useAuth()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const login = useAuthStore((state) => state.login)
  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTags, setEditTags] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/templates/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load template')
        if (!cancelled) {
          setTemplate(body.template)
          setEditTitle(body.template.title)
          setEditDescription(body.template.description || '')
          setEditTags((body.template.tags || []).join(', '))
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  const createCopy = async (mode) => {
    if (!isAuthenticated) {
      login(`/templates/${slug}`)
      return
    }
    if (!template || action) return
    setAction(mode)
    setError('')
    try {
      const snapshotResponse = await fetch(`/api/templates/${encodeURIComponent(slug)}?snapshot=1`, { cache: 'no-store' })
      const snapshotBody = await snapshotResponse.json()
      if (!snapshotResponse.ok) throw new Error(snapshotBody.error || 'Could not load template snapshot')
      const snapshot = snapshotBody.template
      const sceneJson = await decrypt(snapshot.encryptedData, snapshot.publicKey)
      const freshKey = await generateKey()
      const encryptedData = await encrypt(sceneJson, freshKey)
      let encryptedDocData = null
      let docBlocks = null
      if (snapshot.encryptedDocData) {
        const docJson = await decrypt(snapshot.encryptedDocData, snapshot.publicKey)
        docBlocks = JSON.parse(docJson)
        encryptedDocData = await encrypt(docJson, freshKey)
      }
      const response = await fetch(`/api/templates/${encodeURIComponent(slug)}/instantiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, encryptedData, encryptedDocData, workspaceName: template.title }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || body.error || 'Could not create workspace')
      localStorage.setItem(`lixsketch-enc-key-${body.sessionId}`, freshKey)
      localStorage.setItem(`lixsketch-autosave-${body.sessionId}`, sceneJson)
      if (docBlocks) localStorage.setItem(`lixsketch-doc-autosave-${body.sessionId}`, JSON.stringify({ blocks: docBlocks, savedAt: Date.now() }))
      localStorage.setItem('lixsketch-workspace-name', body.workspaceName)
      rememberCanvasId(body.sessionId)
      window.location.assign(`/c/${body.sessionId}#key=${freshKey}`)
    } catch (reason) {
      setError(reason.message)
      setAction('')
    }
  }

  const togglePublished = async () => {
    if (!template?.isOwner || action) return
    const nextStatus = template.status === 'published' ? 'unpublished' : 'published'
    if (nextStatus === 'unpublished' && !window.confirm('Unpublish this template? Existing forks and clones will keep working, but no new copies can be created.')) return
    setAction(nextStatus)
    const response = await fetch(`/api/templates/${encodeURIComponent(slug)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
    if (response.ok) setTemplate((current) => ({ ...current, status: nextStatus }))
    else { const body = await response.json().catch(() => ({})); setError(body.error || 'Could not update template'); }
    setAction('')
  }

  const deleteTemplate = async () => {
    if (!template?.isOwner || action) return
    if (!window.confirm("Are you sure you want to delete this template? Existing forks and clones will keep working, but this public template will be permanently removed from LixSketch.")) return
    setAction('delete')
    setError('')
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        window.location.assign('/profile')
      } else {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not delete template')
      }
    } catch (reason) {
      setError(reason.message)
      setAction('')
    }
  }

  const saveMetadata = async () => {
    if (!template?.isOwner || action) return
    setAction('save')
    setError('')
    const response = await fetch(`/api/templates/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDescription, tags: editTags.split(',') }),
    })
    const body = await response.json().catch(() => ({}))
    if (response.ok) {
      setTemplate((current) => ({ ...current, title: editTitle.trim(), description: editDescription.trim(), tags: editTags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 6) }))
      setEditing(false)
    } else setError(body.error || 'Could not update template details')
    setAction('')
  }

  return (
    <main className="min-h-screen bg-surface-dark font-[lixFont] text-text-primary">
      <LandingNav />
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-28">
        <Link href="/templates" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-accent-blue"><i className="bx bx-left-arrow-alt" />All templates</Link>
        {loading && <div className="py-32 text-center"><i className="bx bx-loader-alt animate-spin text-3xl text-accent-blue" /></div>}
        {!loading && !template && <div className="py-32 text-center"><h1 className="text-3xl">Template unavailable</h1><p className="mt-3 text-text-muted">{error}</p></div>}
        {template && <div className="mt-8 grid gap-10 lg:grid-cols-[1.45fr_0.75fr]">
          <div>
            <div className="overflow-hidden rounded-2xl border border-border-light bg-gradient-to-br from-[#2c2142] via-[#191323] to-[#111019] aspect-[16/9]">
              {template.coverDataUrl ? <img src={template.coverDataUrl} alt={`${template.title} preview`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><i className="bx bx-palette text-7xl text-accent-blue/40" /></div>}
            </div>
            {editing ? <div className="mt-7 space-y-3 rounded-2xl border border-accent-blue/30 bg-surface-card p-5">
              <input value={editTitle} maxLength={72} onChange={(event) => setEditTitle(event.target.value)} className="w-full rounded-lg border border-border-light bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent-blue" />
              <textarea value={editDescription} maxLength={600} rows={4} onChange={(event) => setEditDescription(event.target.value)} className="w-full resize-none rounded-lg border border-border-light bg-surface px-3 py-2.5 text-sm leading-6 outline-none focus:border-accent-blue" />
              <input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="Tags separated by commas" className="w-full rounded-lg border border-border-light bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent-blue" />
              <div className="flex justify-end gap-2"><button onClick={() => setEditing(false)} className="cursor-pointer rounded-lg px-4 py-2 text-xs text-text-muted hover:bg-surface-hover">Cancel</button><button onClick={saveMetadata} disabled={!editTitle.trim() || Boolean(action)} className="cursor-pointer rounded-lg bg-accent-blue px-4 py-2 text-xs text-white disabled:opacity-50">{action === 'save' ? 'Saving…' : 'Save details'}</button></div>
            </div> : <>
              <div className="mt-7 flex flex-wrap items-center gap-2">{template.tags.map((tag) => <span key={tag} className="rounded-full border border-accent-blue/25 bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue">{tag}</span>)}{template.isOwner && <button onClick={() => setEditing(true)} className="ml-auto cursor-pointer text-xs text-text-dim hover:text-accent-blue"><i className="bx bx-edit mr-1" />Edit details</button>}</div>
              <h1 className="mt-5 text-4xl leading-tight">{template.title}</h1>
              <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-text-muted">{template.description || 'A public LixSketch workspace template.'}</p>
            </>}
          </div>
          <aside className="h-fit rounded-2xl border border-border-light bg-surface-card p-6 lg:sticky lg:top-28">
            <div className="flex items-center gap-3 border-b border-border-light pb-5">
              {template.publisher.avatar ? <img src={template.publisher.avatar} alt="" className="h-11 w-11 rounded-xl" /> : <i className="bx bx-user-circle text-4xl text-text-dim" />}
              <div><p className="text-sm text-text-primary">{template.publisher.name}</p><p className="text-xs text-text-dim">Publisher</p></div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b border-border-light py-5 text-center"><div><strong className="block text-lg">{template.views}</strong><span className="text-[10px] text-text-dim">Views</span></div><div><strong className="block text-lg">{template.forks}</strong><span className="text-[10px] text-text-dim">Forks</span></div><div><strong className="block text-lg">{template.clones}</strong><span className="text-[10px] text-text-dim">Clones</span></div></div>
            <button onClick={() => createCopy('fork')} disabled={Boolean(action) || template.status !== 'published'} className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent-blue px-4 py-3 text-sm text-white hover:bg-accent-blue-hover disabled:cursor-not-allowed disabled:opacity-50"><i className="bx bx-git-repo-forked" />{action === 'fork' ? 'Creating fork…' : 'Fork with attribution'}</button>
            <button onClick={() => createCopy('clone')} disabled={Boolean(action) || template.status !== 'published'} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-light px-4 py-3 text-sm text-text-secondary hover:border-accent-blue/50 hover:text-accent-blue disabled:cursor-not-allowed disabled:opacity-50"><i className="bx bx-copy" />{action === 'clone' ? 'Creating clone…' : 'Clone independently'}</button>
            <p className="mt-4 text-[11px] leading-5 text-text-dim">Both options create a new encrypted workspace and use one workspace slot. Forks keep public attribution; clones do not.</p>
            {template.isOwner && (
              <div className="mt-5 border-t border-border-light pt-4 flex flex-col gap-2.5">
                <button onClick={togglePublished} disabled={Boolean(action)} className={`w-full cursor-pointer text-left text-xs ${template.status === 'published' ? 'text-red-400 hover:text-red-300' : 'text-accent-blue hover:text-accent-blue-hover'}`}>
                  {action ? 'Updating…' : template.status === 'published' ? 'Unpublish template' : 'Publish template again'}
                </button>
                <button onClick={deleteTemplate} disabled={Boolean(action)} className="w-full cursor-pointer text-left text-xs text-red-400/80 hover:text-red-300">
                  {action === 'delete' ? 'Deleting…' : 'Delete template permanently'}
                </button>
              </div>
            )}
            {error && <p className="mt-4 rounded-lg bg-red-400/10 p-3 text-xs leading-5 text-red-300">{error}</p>}
          </aside>
        </div>}
      </section>
    </main>
  )
}
