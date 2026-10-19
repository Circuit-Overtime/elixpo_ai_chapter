import Link from 'next/link'
import { SiteFooter } from '@/app/components/SiteFooter'
import { SiteHeader } from '@/app/components/SiteHeader'
import { SkillIcon } from '@/app/components/SkillIcon'
import { pageMetadata } from '@/lib/seo'
import { marketplacePackages } from '@/lib/marketplace'

const REPO = 'https://github.com/elixpo/crumb.elixpo'

export const metadata = pageMetadata({
  title: 'Skills',
  description: 'Give Crumb clear instructions for coding, debugging, operations, and other repeatable work.',
  path: '/skills',
  keywords: ['AI terminal skills', 'coding agent skills', 'terminal workflows', 'developer automation'],
})

const skillExamples = [
  { icon: 'code' as const, title: 'Rust maintainer', copy: 'Find test failures, explain compiler errors, and prepare small fixes that follow the project’s rules.', state: 'Foundation' },
  { icon: 'database' as const, title: 'Database debugger', copy: 'Check schemas and migrations, spot likely mistakes, and keep every database change reviewable.', state: 'Planned' },
  { icon: 'repository' as const, title: 'Repository operator', copy: 'Help with local branches, commits, releases, and CI evidence while service connectors remain disabled.', state: 'Planned' },
  { icon: 'incident' as const, title: 'Incident investigator', copy: 'Gather useful diagnostics, build a timeline, and suggest safe recovery steps.', state: 'Planned' },
]

const publicSkills = marketplacePackages.filter(entry => entry.skills?.length)

export default function SkillsPage() {
  return <><SiteHeader /><main className="product-page skills-page">
    <header className="product-hero"><p className="kicker">Skills</p><h1>Give Crumb a better<br />way to do the job.</h1><p>A skill is a set of clear instructions for repeatable work. It tells Crumb what to look at, which tools may help, and when it must ask you before acting.</p><div><a className="button" href={`${REPO}/issues/new?template=skill.yml`}>Request a skill <span>↗</span></a><Link className="button button-secondary" href="/plugins">Explore plugins</Link></div></header>

    <section className="skill-definition"><article><span>01</span><h2>Pick a skill</h2><p>Use a suggestion or type a skill name when you want a specific way of working.</p><code>@skill:rust-maintainer</code></article><article><span>02</span><h2>Review the access</h2><p>See the files, commands, services, and approvals the skill may need before you use it.</p><code>/skills</code></article><article><span>03</span><h2>Stay in control</h2><p>Crumb can suggest actions, but you still approve anything that can change your work.</p><code>Ctrl+C to stop</code></article></section>

    <section className="skill-gallery"><div className="section-heading"><div><p className="kicker">Public marketplace</p><h2>Install inspectable<br />expertise.</h2></div><p>Browse in the terminal with <code>/marketplace</code>. Installation verifies every file and does not enable a skill automatically.</p></div><div className="skill-grid">{publicSkills.map(skill => <article key={skill.id}><div><SkillIcon kind="code" /><span>v{skill.version}</span></div><h3>{skill.display_name}</h3><p>{skill.description}</p><small><code>/marketplace install {skill.id}</code></small></article>)}</div></section>

    <section className="skill-gallery"><div className="section-heading"><div><p className="kicker">Coming next</p><h2>More ways<br />to work.</h2></div><p>Community packages use the same namespaced manifest, integrity checks, and explicit enablement boundary.</p></div><div className="skill-grid">{skillExamples.map(skill => <article key={skill.title}><div><SkillIcon kind={skill.icon} /><span>{skill.state}</span></div><h3>{skill.title}</h3><p>{skill.copy}</p><small>Clear instructions · limited access</small></article>)}</div></section>

    <section className="skill-lifecycle"><div><p className="kicker">Simple and visible</p><h2>Nothing installs itself.</h2><p>You decide which skills are available and what they are allowed to do.</p></div><ol><li><b>Find</b><span>See what the skill is made for.</span></li><li><b>Check</b><span>Review its tools and permissions.</span></li><li><b>Enable</b><span>Add it to your setup yourself.</span></li><li><b>Use</b><span>Approve important actions as they happen.</span></li></ol></section>

    <section className="request-banner"><div><p className="kicker">Missing your workflow?</p><h2>Tell us what you<br />want Crumb to learn.</h2><p>Share the job, a few example requests, and the access it would need.</p></div><div><a className="button button-light" href={`${REPO}/issues/new?template=skill.yml`}>Propose a skill</a></div></section>
  </main><SiteFooter /></>
}
