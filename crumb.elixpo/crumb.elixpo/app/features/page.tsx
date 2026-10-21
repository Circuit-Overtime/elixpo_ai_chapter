import Link from 'next/link'
import { SiteFooter } from '@/app/components/SiteFooter'
import { SiteHeader } from '@/app/components/SiteHeader'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Features',
  description: 'See how Crumb combines a self-hosted autonomous harness, Pollinations intelligence, a real shell, supervised tools, memory, and explicit permissions.',
  path: '/features',
  keywords: ['autonomous agent harness', 'self-hosted AI agent', 'Pollinations agent', 'AI terminal features', 'native shell AI'],
})

const features = [
  { icon: '$_', title: 'Your real shell', copy: 'Use Bash, Zsh, or PowerShell normally—including pipes, environment variables, interactive programs, and shortcuts.', tag: 'Native' },
  { icon: '↳', title: 'No AI for normal commands', copy: 'Crumb recognizes commands on your computer before deciding whether a request needs an agent. This check is local and free.', tag: 'Fast' },
  { icon: '◆', title: 'Crumb-owned agent harness', copy: 'Use the native Rust planning and tool loop for autonomous work, with optional compatibility adapters kept outside the terminal core.', tag: 'Autonomous' },
  { icon: '⌃C', title: 'Stop everything with Ctrl+C', copy: 'One shortcut stops the answer, its tools, and the command currently running underneath it.', tag: 'Control' },
  { icon: '◇', title: 'Reusable skills', copy: 'Skills give Crumb clear instructions for jobs such as fixing tests, reviewing code, or investigating an incident.', tag: 'Expertise' },
  { icon: '⌁', title: 'Safer Pollinations connection', copy: 'Authorize Pollinations in your browser so its private key does not end up in prompts, files, logs, or terminal history.', tag: 'Secure' },
  { icon: '◫', title: 'Work you can return to', copy: 'Sessions keep enough safe context to continue a task later without saving every secret or line of output.', tag: 'Sessions' },
  { icon: '⚑', title: 'Permissions you control', copy: 'Crumb can ask to use a tool, but the model cannot approve that request for itself.', tag: 'Approval' },
  { icon: '⊘', title: 'Still useful without AI', copy: 'If a model, network, plugin, or connector fails, the native terminal keeps working.', tag: 'Reliable' },
]

export default function FeaturesPage() {
  return <><SiteHeader /><main className="product-page">
    <header className="product-hero"><p className="kicker">Product features</p><h1>One terminal for commands<br />and autonomous work.</h1><p>Use the shell you already know. When a job needs multiple steps, give Crumb the outcome and let its self-hosted harness work through it with Pollinations intelligence and explicit local policy.</p><div><Link className="button" href="/docs/getting-started">Get started</Link><Link className="button button-secondary" href="/docs/security">See how Crumb stays safe</Link></div></header>

    <section className="product-feature-grid">{features.map((feature, index) => <article key={feature.title}><div><span>{String(index + 1).padStart(2, '0')}</span><em>{feature.tag}</em></div><i>{feature.icon}</i><h2>{feature.title}</h2><p>{feature.copy}</p></article>)}</section>

    <section className="feature-comparison"><div><p className="kicker">Easy to predict</p><h2>Commands stay commands.<br />Requests get help.</h2></div><div className="comparison-table"><div><span>You type</span><span>What handles it</span><span>Needs internet?</span></div><div><strong>cargo test --workspace</strong><span>Your shell</span><b>No</b></div><div><strong>fix the failing tests</strong><span>Crumb agent</span><b>Usually</b></div><div><strong>/skills</strong><span>Crumb</span><b>No</b></div><div><strong>@file:Cargo.toml</strong><span>Local context</span><b>Only when sent</b></div></div></section>

    <section className="product-banner"><p className="kicker">Shape your setup</p><h2>Skills show how.<br />Plugins make it possible.</h2><p>Add the knowledge and tools your work needs without turning the terminal into a closed system.</p><Link className="button button-light" href="/skills">Explore skills</Link><Link className="button button-outline-light" href="/plugins">Explore plugins</Link></section>
  </main><SiteFooter /></>
}
