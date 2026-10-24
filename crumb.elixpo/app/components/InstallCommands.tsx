'use client'

import { useState } from 'react'

const commands = [
  {
    id: 'unix',
    label: 'Linux and macOS',
    command: "curl --proto '=https' --tlsv1.2 -LsSf https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.sh | sh",
  },
  {
    id: 'windows',
    label: 'Windows PowerShell',
    command: 'irm https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.ps1 | iex',
  },
] as const

export function InstallCommands() {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(command: string, id: string) {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      const area = document.createElement('textarea')
      area.value = command
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1800)
  }

  return <aside className="hero-install" aria-labelledby="hero-install-title">
    <div className="hero-install-heading"><div><span>Install Crumb</span><strong id="hero-install-title">Choose your terminal.</strong></div><b>v1.0.4</b></div>
    <p>The installer detects your platform, downloads the matching release, verifies its SHA-256 checksum, and installs the <code>crumb</code> command for your user.</p>
    <div className="hero-install-commands">{commands.map(item => <div className="hero-install-command" key={item.id}><div><span>{item.label}</span><button type="button" onClick={() => copy(item.command, item.id)} aria-label={`Copy ${item.label} installation command`}>{copied === item.id ? 'Copied' : 'Copy'}</button></div><pre><code>{item.command}</code></pre></div>)}</div>
    <small>No administrator access required · release checksums verified</small>
  </aside>
}
