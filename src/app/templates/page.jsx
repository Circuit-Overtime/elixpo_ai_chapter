'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import LandingNav from '@/components/landing/LandingNav'
import LandingFooter from '@/components/landing/LandingFooter'

function TemplateCard({ template }) {
  return (
    <Link href={`/templates/${template.slug}`} className="group overflow-hidden rounded-2xl border border-border-light bg-surface-card transition hover:-translate-y-1 hover:border-accent-blue/60 hover:shadow-xl hover:shadow-accent-blue/10">
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#2c2142] via-[#191323] to-[#111019]">
        {template.coverDataUrl ? (
          <img src={template.coverDataUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-accent-blue/50"><i className="bx bx-palette text-5xl" /></div>
        )}
        <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] text-white/75 backdrop-blur">
          {template.forks + template.clones} uses
        </div>
      </div>
      <div className="p-5">
        <h2 className="truncate text-lg text-text-primary">{template.title}</h2>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-text-muted">{template.description || 'A public LixSketch workspace template.'}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {template.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-accent-blue/10 px-2 py-1 text-[10px] text-accent-blue">{tag}</span>)}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-border-light pt-4 text-xs text-text-dim">
          <span className="flex min-w-0 items-center gap-2">
            {template.publisher.avatar ? <img src={template.publisher.avatar} alt="" className="h-6 w-6 rounded-full" /> : <i className="bx bx-user-circle text-xl" />}
            <span className="truncate">{template.publisher.name}</span>
          </span>
          <span className="flex items-center gap-1"><i className="bx bx-show" />{template.views}</span>
        </div>
      </div>
    </Link>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/templates?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load templates')
        setTemplates(body.templates || [])
        setError('')
      } catch (reason) {
        if (reason.name !== 'AbortError') setError(reason.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query ? 180 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const popularTags = useMemo(() => {
    const counts = new Map()
    templates.forEach((template) => template.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)))
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag)
  }, [templates])

  return (
    <main className="min-h-screen bg-surface-dark font-[lixFont] text-text-primary">
      <LandingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-32">
        <div className="max-w-3xl">
          <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue">Community templates</span>
          <h1 className="mt-5 text-4xl leading-tight md:text-6xl">Start from a workspace that already works.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted">Explore public canvases and documents, then fork with attribution or clone an independent encrypted copy into your account.</p>
        </div>
        <div className="mt-10 max-w-2xl rounded-xl border border-border-light bg-surface-card p-2 focus-within:border-accent-blue/70">
          <label className="flex items-center gap-3 px-3">
            <i className="bx bx-search text-xl text-text-dim" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates, tags, or use cases" className="w-full bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-dim" autoFocus />
          </label>
        </div>
        {popularTags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{popularTags.map((tag) => <button key={tag} onClick={() => setQuery(tag)} className="cursor-pointer rounded-full border border-border-light px-3 py-1.5 text-xs text-text-muted hover:border-accent-blue/50 hover:text-accent-blue">{tag}</button>)}</div>}
        {error && <div className="mt-10 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">{error}</div>}
        {loading ? (
          <div className="mt-16 flex justify-center"><i className="bx bx-loader-alt animate-spin text-3xl text-accent-blue" /></div>
        ) : templates.length ? (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{templates.map((template) => <TemplateCard key={template.id} template={template} />)}</div>
        ) : (
          <div className="mt-16 rounded-2xl border border-dashed border-border-light p-14 text-center"><i className="bx bx-layer text-4xl text-accent-blue" /><h2 className="mt-3 text-xl">No public templates yet</h2><p className="mt-2 text-sm text-text-muted">Publish a workspace from Save & Export to make the first one.</p></div>
        )}
      </section>
      <LandingFooter />
    </main>
  )
}
