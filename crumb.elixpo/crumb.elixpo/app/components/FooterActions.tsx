'use client'

import { useEffect, useState } from 'react'
import { GitHubIcon } from './GitHubIcon'

const REPO = 'https://github.com/elixpo/crumb.elixpo'

function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function FooterActions() {
  const [copied, setCopied] = useState(false)
  const [stars, setStars] = useState<number | null>(null)
  useEffect(() => { fetch('/api/github/stars').then(response => response.ok ? response.json() : null).then(data => { if (typeof data?.stars === 'number') setStars(data.stars) }).catch(() => undefined) }, [])

  async function copyEmail() {
    try { await navigator.clipboard.writeText('hello@elixpo.com') } catch {
      const input = document.createElement('input'); input.value = 'hello@elixpo.com'; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove()
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }

  return <div className="footer-actions"><button className="contact-pill" onClick={copyEmail} aria-label="Copy hello@elixpo.com">{copied ? '✓ Email copied' : '✉ hello@elixpo.com'}</button><a className="github-star-pill" href={REPO} target="_blank" rel="noreferrer"><GitHubIcon /><span>View source</span><b>★ {stars === null ? 'Star' : compact(stars)}</b></a></div>
}
