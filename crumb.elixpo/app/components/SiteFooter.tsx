import Link from 'next/link'
import { FooterActions } from './FooterActions'

const REPO = 'https://github.com/elixpo/crumb.elixpo'

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-grid">
      <div className="footer-brand">
        <p className="kicker">Natural Language Terminal</p>
        <h2>Native when you type.<br />Intelligent when you ask.</h2>
        <FooterActions />
      </div>
      <div><h3>Product</h3><Link href="/features">Features</Link><Link href="/skills">Skills</Link><Link href="/plugins">Plugins</Link><Link href="/profile/connectors">Pollinations</Link><Link href="/docs">Documentation</Link><a href={`${REPO}/releases`}>Releases</a></div>
      <div><h3>Project</h3><Link href="/about">About</Link><a href={`${REPO}/issues`}>Issues</a><a href="https://status.elixpo.com">Status</a></div>
      <div><h3>Legal</h3><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href={`${REPO}/blob/main/LICENSE`}>License</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Elixpo · Crumb NLT</span><span>Open source terminal infrastructure.</span></div>
  </footer>
}
