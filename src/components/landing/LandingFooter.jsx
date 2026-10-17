import Link from 'next/link'

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/5 py-10 px-6 mt-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Product */}
          <div>
            <h4 className="text-text-secondary text-xs uppercase tracking-wider mb-4">Product</h4>
            <div className="flex flex-col gap-2.5">
              <Link href="/pricing" className="text-text-dim text-sm hover:text-text-primary transition-colors">Pricing</Link>
              <Link href="/teams" className="text-text-dim text-sm hover:text-text-primary transition-colors">Teams</Link>
              <Link href="/templates" className="text-text-dim text-sm hover:text-text-primary transition-colors">Templates</Link>
              <a href="https://www.npmjs.com/package/@elixpo/lixsketch" target="_blank" rel="noopener noreferrer" className="text-text-dim text-sm hover:text-text-primary transition-colors flex items-center gap-1.5">
                <i className="bx bxl-nodejs text-sm" />NPM Package
              </a>
              <a href="https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch" target="_blank" rel="noopener noreferrer" className="text-text-dim text-sm hover:text-text-primary transition-colors flex items-center gap-1.5">
                <i className="bx bxl-visual-studio text-sm" />VS Code Extension
              </a>
            </div>
          </div>

          {/* Docs & Blog */}
          <div>
            <h4 className="text-text-secondary text-xs uppercase tracking-wider mb-4">Docs</h4>
            <div className="flex flex-col gap-2.5">
              <Link href="/docs" className="text-text-dim text-sm hover:text-text-primary transition-colors">LixScript Docs</Link>
              <Link href="/docs/connectors" className="text-text-dim text-sm hover:text-text-primary transition-colors">Connector Docs</Link>
              <Link href="/docs#blog" className="text-text-dim text-sm hover:text-text-primary transition-colors">Blog</Link>
              <Link href="/docs/blog/e2e-encryption" className="text-text-dim text-sm hover:text-text-primary transition-colors">E2E Encryption</Link>
              <Link href="/docs/blog/lixscript-dsl" className="text-text-dim text-sm hover:text-text-primary transition-colors">LixScript DSL</Link>
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-text-secondary text-xs uppercase tracking-wider mb-4">Resources</h4>
            <div className="flex flex-col gap-2.5">
              <Link href="/resources/how-to-start" className="text-text-dim text-sm hover:text-text-primary transition-colors">How to start</Link>
              <Link href="/resources/community" className="text-text-dim text-sm hover:text-text-primary transition-colors">Community</Link>
              <Link href="/resources/security" className="text-text-dim text-sm hover:text-text-primary transition-colors">Security</Link>
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-text-secondary text-xs uppercase tracking-wider mb-4">Company</h4>
            <div className="flex flex-col gap-2.5">
              <a href="https://elixpo.com" target="_blank" rel="noopener noreferrer" className="text-text-dim text-sm hover:text-text-primary transition-colors">Elixpo</a>
              <a href="https://github.com/elixpo/sketch.elixpo" target="_blank" rel="noopener noreferrer" className="text-text-dim text-sm hover:text-text-primary transition-colors">GitHub</a>
              <Link href="/docs/blog/engine-package-launch" className="text-text-dim text-sm hover:text-text-primary transition-colors">Engine Launch Blog</Link>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-white/5">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="LixSketch" className="w-5 h-5 rounded" />
            <span className="text-text-dim text-xs">LixSketch &mdash; Open source canvas for visual thinking</span>
          </div>

          <div className="flex items-center gap-4">
            <a href="https://github.com/elixpo/sketch.elixpo" target="_blank" rel="noopener noreferrer" className="text-text-dim hover:text-text-primary transition-colors">
              <i className="bx bxl-github text-lg" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
