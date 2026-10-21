import Link from 'next/link'
import { SiteFooter } from '@/app/components/SiteFooter'
import { SiteHeader } from '@/app/components/SiteHeader'
import { pageMetadata } from '@/lib/seo'
import { marketplacePackages } from '@/lib/marketplace'

const REPO = 'https://github.com/elixpo/crumb.elixpo'

export const metadata = pageMetadata({
  title: 'Plugins',
  description: 'Add useful tools to Crumb for files, repositories, databases, cloud services, and everyday developer work.',
  path: '/plugins',
  keywords: ['AI terminal plugins', 'MCP terminal', 'developer tools', 'terminal integrations'],
})

const plugins = [
  { mark: 'FS', name: 'Workspace tools', copy: 'Read files, search folders, and prepare edits inside the project you opened.', status: 'Built in' },
  { mark: 'PI', name: 'Pollinations', copy: 'Use the only external connector currently enabled for model inference and media generation.', status: 'Available' },
  { mark: 'CAT', name: 'Signed catalog', copy: 'Discover packages through bounded metadata with provenance and integrity checks.', status: 'Built in' },
  { mark: 'MCP', name: 'Local MCP servers', copy: 'Bring local tools into Crumb through one typed, permission-aware interface.', status: 'Foundation' },
]

const publicMcps = marketplacePackages.filter(entry => entry.mcp_servers?.length)

export default function PluginsPage() {
  return <><SiteHeader /><main className="product-page plugins-page">
    <header className="product-hero"><p className="kicker">Plugins</p><h1>Add tools without<br />giving up control.</h1><p>Plugins let Crumb do more than talk. They can read a file, check a pull request, or query a service—but only through clear inputs, limited output, and permissions you control.</p><div><a className="button" href={`${REPO}/issues/new?template=plugin.yml`}>Request a plugin <span>↗</span></a><Link className="button button-secondary" href="/skills">Explore skills</Link></div></header>

    <section className="plugin-grid">{publicMcps.map(plugin => <article key={plugin.id}><div><i>MCP</i><span>v{plugin.version}</span></div><h2>{plugin.display_name}</h2><p>{plugin.description}</p><code>/marketplace install {plugin.id}</code></article>)}</section>

    <section className="plugin-grid">{plugins.map(plugin => <article key={plugin.name}><div><i>{plugin.mark}</i><span>{plugin.status}</span></div><h2>{plugin.name}</h2><p>{plugin.copy}</p></article>)}</section>

    <section className="plugin-explainer"><div><p className="kicker">The easy distinction</p><h2>Skills know how.<br />Plugins can do.</h2><p>A skill explains the best way to approach a task. A plugin supplies a local tool for that task. The Pollinations connector authorizes model inference without exposing a private key.</p></div><ol><li><b>Skill</b><span>“Review this Rust change carefully.”</span></li><li><b>Plugin</b><span>Read the diff and prepare a review locally.</span></li><li><b>Connector</b><span>Use your approved Pollinations account.</span></li></ol></section>

    <section className="plugin-safety"><p className="kicker">Safe by default</p><h2>The model cannot give itself more access.</h2><div><article><b>See the request</b><p>Crumb shows what a tool wants to do before an important action.</p></article><article><b>Stop the chain</b><p>Ctrl+C stops the agent, the plugin, and its active command together.</p></article><article><b>Remove it cleanly</b><p>Disable a plugin or disconnect Pollinations without breaking the native shell.</p></article></div></section>

    <section className="request-banner"><div><p className="kicker">Need another tool?</p><h2>Request the capability.<br />We will keep it bounded.</h2><p>Tell us what the plugin should do, what access it needs, and how failure should behave.</p></div><div><a className="button button-light" href={`${REPO}/issues/new?template=plugin.yml`}>Propose a plugin</a></div></section>
  </main><SiteFooter /></>
}
