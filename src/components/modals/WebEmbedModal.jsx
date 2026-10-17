'use client'

import { useEffect, useRef, useState } from 'react'
import { normalizeWebEmbedUrl } from '../../../packages/lixsketch/src/core/WebEmbedPolicy.js'
import { showToast } from '@/utils/toast'
import useSketchStore, { TOOLS } from '@/store/useSketchStore'

export default function WebEmbedModal() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const close = () => { setOpen(false); useSketchStore.getState().setActiveTool(TOOLS.SELECT) }

  useEffect(() => {
    const show = () => { setOpen(true); setError(''); requestAnimationFrame(() => inputRef.current?.focus()) }
    window.__showWebEmbedModal = show
    window.addEventListener('lixsketch:open-web-embed', show)
    return () => { delete window.__showWebEmbedModal; window.removeEventListener('lixsketch:open-web-embed', show) }
  }, [])

  useEffect(() => {
    if (!open) return
    const escape = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])

  if (!open) return null
  let requestedHostname = ''
  try { requestedHostname = new URL(url).hostname } catch {}
  const whitelistRequestUrl = `https://github.com/elixpo/sketch.elixpo/issues/new?template=web-embed-whitelist.yml&title=${encodeURIComponent(`[Web embed whitelist] ${requestedHostname || 'New hostname'}`)}`
  const submit = (event) => {
    event.preventDefault()
    const normalized = normalizeWebEmbedUrl(url)
    if (!normalized) {
      const message = 'This site is not currently supported for web embeds.'
      setError(message); showToast(message, { tone: 'info', duration: 3500 }); return
    }
    window.__placeWebEmbed?.(normalized)
    setOpen(false); setUrl(''); setError('')
    showToast('Web embed placed. Drag or resize its frame.')
  }

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-border-light bg-surface-card p-6 font-[lixFont] shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-lg text-text-primary">Embed a website</h2><p className="mt-1 text-xs text-text-muted">One secure embed is placed inside a movable, resizable frame.</p></div>
          <button type="button" className="cursor-pointer text-text-muted hover:text-text-primary" onClick={close}><i className="bx bx-x text-2xl" /></button>
        </div>
        <label className="text-xs text-text-muted" htmlFor="web-embed-url">HTTPS URL</label>
        <input ref={inputRef} id="web-embed-url" value={url} onChange={(e) => { setUrl(e.target.value); setError('') }} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 w-full rounded-xl border border-border-light bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-accent" />
        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface/60 px-3 py-2.5">
            <p className="text-xs text-text-muted"><i className="bx bx-info-circle mr-1" />{error}</p>
            <a href={whitelistRequestUrl} target="_blank" rel="noreferrer" className="shrink-0 cursor-pointer rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10">Request whitelist</a>
          </div>
        )}
        <button type="submit" className="mt-5 w-full cursor-pointer rounded-xl bg-accent px-4 py-3 text-sm text-white hover:brightness-110">Place on canvas</button>
      </form>
    </div>
  )
}
