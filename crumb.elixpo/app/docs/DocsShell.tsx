'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GitHubIcon } from '@/app/components/GitHubIcon'

const pages = [
  { group: 'Start here', items: [{ href: '/docs', label: 'Overview' }, { href: '/docs/getting-started', label: 'Getting started' }] },
  { group: 'Use Crumb', items: [{ href: '/docs/cli', label: 'CLI and native shell' }, { href: '/docs/authentication', label: 'Authentication' }, { href: '/docs/pollinations', label: 'Connect Pollinations' }] },
  { group: 'Architecture', items: [{ href: '/docs/security', label: 'Security model' }] },
]

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [headings, setHeadings] = useState<Array<{ id: string; text: string }>>([])

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('#docs-content h2, #docs-content h3')
    const next = Array.from(nodes).map(node => {
      if (!node.id) node.id = (node.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      return { id: node.id, text: node.textContent || '' }
    })
    setHeadings(next)
  }, [pathname])

  async function copyForLlm() {
    const visibleContent = document.getElementById('docs-content')?.innerText.trim() || ''
    let payload = `# Crumb documentation\nSource: ${window.location.href}\n\n${visibleContent}`
    try {
      const response = await fetch('/llms-full.txt')
      if (response.ok) payload = await response.text()
    } catch { /* The visible page remains a useful offline fallback. */ }
    if (!payload.trim()) return
    try { await navigator.clipboard.writeText(payload) } catch {
      const area = document.createElement('textarea'); area.value = payload; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove()
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000)
  }

  const navigation = <nav className="docs-nav" aria-label="Documentation navigation">{pages.map(section => <div key={section.group}><p>{section.group}</p>{section.items.map(item => <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''} onClick={() => setOpen(false)}>{item.label}</Link>)}</div>)}</nav>

  return <div className="docs-frame">
    <header className="docs-header"><button className="docs-menu" onClick={() => setOpen(!open)} aria-label="Toggle documentation menu">☰</button><Link className="docs-brand" href="/"><img src="/favicon.ico" alt="" /><b>crumb</b><span>Docs</span></Link><div className="docs-header-actions"><button className="copy-llm" onClick={copyForLlm}>{copied ? '✓ Copied' : '▣ Copy for LLM'}</button><a href="https://github.com/elixpo/crumb.elixpo" aria-label="Crumb on GitHub"><GitHubIcon /></a></div></header>
    <div className="docs-body"><aside className={`docs-sidebar ${open ? 'open' : ''}`}>{navigation}</aside>{open && <button className="docs-overlay" aria-label="Close documentation menu" onClick={() => setOpen(false)} />}
      <main id="docs-content" className="docs-content">{children}<div className="docs-help"><b>Need more context?</b><span>Copy this page for an LLM or open a GitHub discussion.</span><button onClick={copyForLlm}>{copied ? 'Copied to clipboard' : 'Copy page for LLM'}</button></div></main>
      <aside className="docs-toc"><p>On this page</p>{headings.map(heading => <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>)}</aside>
    </div>
  </div>
}
