"use client"

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { LIXSCRIPT_LLM_SPEC } from '@/lib/lixscript-llm-spec'
import { blogPosts } from '@/content/blog'

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        copied
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-surface-hover text-text-muted border border-white/[0.08] hover:border-white/[0.2] hover:text-text-primary'
      }`}
    >
      <i className={`bx ${copied ? 'bx-check' : 'bx-copy'} text-sm`} />
      {copied ? 'Copied!' : label}
    </button>
  )
}

function CodeBlock({ code, language = 'lixscript' }) {
  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="bg-[#171120] border border-white/[0.08] rounded-xl p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-text-secondary font-[lixCode]">{code}</code>
      </pre>
    </div>
  )
}

function Section({ id, title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={id} className="border border-white/[0.06] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <i className={`bx ${icon} text-xl text-accent-blue`} />
        <h2 className="text-text-primary text-base font-medium flex-1">{title}</h2>
        <i className={`bx bx-chevron-down text-xl text-text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-6 pb-6 border-t border-white/[0.04]">{children}</div>}
    </section>
  )
}

function PropTable({ rows }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th className="text-left py-2 pr-4 text-text-muted font-medium">Property</th>
            <th className="text-left py-2 pr-4 text-text-muted font-medium">Type</th>
            <th className="text-left py-2 text-text-muted font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="py-2 pr-4 font-[lixCode] text-accent-blue text-xs">{r[0]}</td>
              <td className="py-2 pr-4 text-text-dim text-xs">{r[1]}</td>
              <td className="py-2 text-text-secondary text-xs">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NavItem({ href, label, icon, active }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
        active ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
      }`}
    >
      <i className={`bx ${icon} text-base`} />
      {label}
    </a>
  )
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'quickstart', 'shapes', 'arrows', 'positioning', 'frames', 'styling', 'api', 'llm', 'blog']
      for (const id of sections) {
        const el = document.getElementById(id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 120) setActiveSection(id)
        }
      }
    }
    const container = document.getElementById('docs-scroll')
    container?.addEventListener('scroll', handleScroll)
    return () => container?.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-surface-dark text-text-primary font-[lixFont]">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-dark/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <a href="/?noredirect=1" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/icon.png" alt="LixSketch" className="w-7 h-7 rounded-md" />
              <span className="text-text-primary font-medium">LixSketch</span>
            </a>
            <span className="text-text-dim">/</span>
            <span className="text-text-muted">Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-text-muted text-sm hover:text-text-primary transition-colors">
              <i className="bx bx-arrow-back mr-1" />
              Back to Home
            </a>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1400px] mx-auto pt-14">
        {/* Sidebar */}
        <nav className="hidden lg:block w-64 shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto docs-scroll p-4 border-r border-white/[0.06]">
          <div className="space-y-1">
            <p className="text-text-dim text-[10px] uppercase tracking-widest px-3 pt-3 pb-2">Getting Started</p>
            <NavItem href="#overview" label="Overview" icon="bx-info-circle" active={activeSection === 'overview'} />
            <NavItem href="#quickstart" label="Quick Start" icon="bx-rocket" active={activeSection === 'quickstart'} />

            <p className="text-text-dim text-[10px] uppercase tracking-widest px-3 pt-5 pb-2">Language Reference</p>
            <NavItem href="#shapes" label="Shapes" icon="bx-shape-square" active={activeSection === 'shapes'} />
            <NavItem href="#arrows" label="Arrows & Lines" icon="bx-right-arrow-alt" active={activeSection === 'arrows'} />
            <NavItem href="#positioning" label="Positioning" icon="bx-move" active={activeSection === 'positioning'} />
            <NavItem href="#frames" label="Frames" icon="bx-border-all" active={activeSection === 'frames'} />
            <NavItem href="#styling" label="Styling" icon="bx-palette" active={activeSection === 'styling'} />

            <p className="text-text-dim text-[10px] uppercase tracking-widest px-3 pt-5 pb-2">Integration</p>
            <Link
              href="/docs/connectors"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
            >
              <i className="bx bx-plug text-base" />
              Connectors
            </Link>
            <Link
              href="/docs/mcp"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
            >
              <i className="bx bx-plug text-base" />
              MCP Server
            </Link>
            <NavItem href="#api" label="JavaScript API" icon="bx-code-alt" active={activeSection === 'api'} />
            <NavItem href="#llm" label="LixScript Spec" icon="bx-code-block" active={activeSection === 'llm'} />

            <p className="text-text-dim text-[10px] uppercase tracking-widest px-3 pt-5 pb-2">Install</p>
            <Link
              href="/resources/npm-package"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
            >
              <i className="bx bxl-nodejs text-base text-text-dim" />
              NPM Package
            </Link>
            <Link
              href="/resources/vscode-extension"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
            >
              <i className="bx bxl-visual-studio text-base text-text-dim" />
              VS Code Extension
            </Link>

            <p className="text-text-dim text-[10px] uppercase tracking-widest px-3 pt-5 pb-2">Blog</p>
            <NavItem href="#blog" label="All Posts" icon="bx-news" active={activeSection === 'blog'} />
            {blogPosts.map(post => (
              <Link
                key={post.slug}
                href={`/docs/blog/${post.slug}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
              >
                <i className={`${post.icon} text-base text-text-dim`} />
                <span className="truncate">{post.title.split(':')[0]}</span>
              </Link>
            ))}
          </div>

          {/* MCP link in sidebar */}
          <div className="mt-8 p-3 rounded-xl bg-surface-card border border-white/[0.06]">
            <p className="text-text-dim text-[10px] uppercase tracking-widest mb-2">Package MCP</p>
            <Link
              href="/docs/mcp"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/20"
            >
              <i className="bx bx-plug text-base" />
              Setup MCP
            </Link>
            <p className="text-text-dim text-[10px] mt-2 leading-relaxed">
              Structured canvas tools are available in the LixSketch package.
            </p>
          </div>
        </nav>

        {/* Main content */}
        <main id="docs-scroll" className="flex-1 min-w-0 overflow-y-auto docs-scroll h-[calc(100vh-56px)] px-6 lg:px-12 py-8">
          {/* Hero */}
          <div id="overview" className="mb-12">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-semibold text-text-primary">LixScript</h1>
                  <span className="px-2 py-0.5 text-[10px] rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium uppercase">Coming soon</span>
                </div>
                <p className="text-text-muted text-lg max-w-2xl leading-relaxed">
                  LixScript is being prepared as the programmable MCP interface for LixSketch.
                  The documentation below is a preview and the production integration is not available yet.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-card border border-white/[0.06] text-sm">
                <i className="bx bx-shape-square text-accent-blue" />
                <span className="text-text-muted">7 shape types</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-card border border-white/[0.06] text-sm">
                <i className="bx bx-link text-green-400" />
                <span className="text-text-muted">Auto-attached arrows</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-card border border-white/[0.06] text-sm">
                <i className="bx bx-move text-purple-400" />
                <span className="text-text-muted">Relative positioning</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-card border border-white/[0.06] text-sm">
                <i className="bx bx-bot text-orange-400" />
                <span className="text-text-muted">LLM-optimized spec</span>
              </div>
            </div>
          </div>

          <div className="mb-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 flex items-start gap-3">
            <i className="bx bx-info-circle text-xl text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-text-primary">LixScript MCP is coming soon</p>
              <p className="text-xs leading-relaxed text-text-muted mt-1">Syntax and APIs shown on this page are previews and may change before the MCP integration is released.</p>
            </div>
          </div>

          {/* Quick Start */}
          <div id="quickstart" className="mb-10">
            <Section id="quickstart-inner" title="Quick Start" icon="bx-rocket" defaultOpen={true}>
              <p className="text-text-muted text-sm mt-4 mb-4">
                Open the AI modal {'>'} Code tab, write LixScript, and place on canvas.
              </p>
              <CodeBlock code={`// A simple flowchart
$blue = #4A90D9
$green = #2ECC71

rect start at 100, 50 size 160x55 {
  stroke: $blue
  label: "Start"
}

rect end at 100, 170 size 160x55 {
  stroke: $green
  label: "End"
}

arrow a1 from start.bottom to end.top {
  stroke: #e0e0e0
}`} />
              <div className="mt-4 p-4 rounded-xl bg-accent-blue/5 border border-accent-blue/10">
                <p className="text-text-secondary text-sm leading-relaxed">
                  <strong className="text-accent-blue">Tip:</strong> All shapes are automatically wrapped in a frame when placed on canvas.
                  Variables (<code className="font-[lixCode] text-accent-blue">$name = value</code>) let you reuse colors and dimensions.
                </p>
              </div>
            </Section>
          </div>

          {/* Shapes */}
          <div id="shapes" className="mb-10 space-y-4">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Shapes</h2>

            <Section id="shape-rect" title="rect — Rectangle" icon="bx-rectangle" defaultOpen={false}>
              <CodeBlock code={`rect <id> at <x>, <y> size <w>x<h> {
  stroke: <color>          // border color (default: #fff)
  strokeWidth: <number>    // border thickness (default: 2)
  fill: <color>            // fill color (default: transparent)
  fillStyle: <style>       // none | solid | hachure | cross-hatch | dots
  roughness: <number>      // hand-drawn effect 0-3 (default: 1.5)
  style: <lineStyle>       // solid | dashed | dotted
  rotation: <degrees>
  label: "<text>"          // centered text
  labelColor: <color>      // (default: #e0e0e0)
  labelFontSize: <number>  // (default: 14)
}`} />
              <PropTable rows={[
                ['stroke', 'color', 'Border color and label text color. Default: #fff'],
                ['fill', 'color', 'Background fill. Default: transparent'],
                ['fillStyle', 'enum', 'none | solid | hachure | cross-hatch | dots'],
                ['roughness', '0-3', 'Hand-drawn wobble intensity. 0=clean, 3=sketchy'],
                ['label', 'string', 'Text centered inside the rectangle'],
              ]} />
            </Section>

            <Section id="shape-circle" title="circle / ellipse — Circle or Ellipse" icon="bx-circle" defaultOpen={false}>
              <CodeBlock code={`circle <id> at <x>, <y> size <w>x<h> {
  // Same properties as rect
  stroke: #E74C3C
  label: "Decision?"
}

// Equal w and h for perfect circle
circle c1 at 100, 100 size 80x80 { ... }

// Different w/h for ellipse
circle e1 at 100, 100 size 120x80 { ... }`} />
              <p className="text-text-muted text-sm mt-3">
                Position (<code className="font-[lixCode] text-accent-blue">at</code>) defines the top-left of the bounding box. The center is calculated automatically.
              </p>
            </Section>

            <Section id="shape-text" title="text — Text Label" icon="bx-text" defaultOpen={false}>
              <CodeBlock code={`text <id> at <x>, <y> {
  content: "<text>"        // required
  color: <color>           // text color (default: #fff)
  fontSize: <number>       // in px (default: 16)
  fontFamily: <family>     // (default: lixFont, sans-serif)
  anchor: start|middle|end // alignment (default: middle)
}`} />
            </Section>

            <Section id="shape-freehand" title="freehand — Freehand Stroke" icon="bx-pen" defaultOpen={false}>
              <CodeBlock code={`freehand <id> at 0, 0 {
  points: "x1,y1;x2,y2;x3,y3"  // semicolon-separated
  stroke: <color>                // (default: #fff)
  strokeWidth: <number>          // (default: 3)
  thinning: <0-1>                // pressure sensitivity
  roughness: smooth|medium|rough
}`} />
              <p className="text-text-muted text-sm mt-3">
                Each point is <code className="font-[lixCode] text-text-secondary">x,y</code> or <code className="font-[lixCode] text-text-secondary">x,y,pressure</code> (pressure 0-1, default 0.5).
              </p>
            </Section>
          </div>

          {/* Arrows & Lines */}
          <div id="arrows" className="mb-10 space-y-4">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Arrows & Lines</h2>

            <Section id="arrow-ref" title="arrow — Directed Arrow" icon="bx-right-arrow-alt" defaultOpen={false}>
              <CodeBlock code={`arrow <id> from <source> to <target> {
  stroke: <color>           // line color (default: #fff)
  strokeWidth: <number>     // (default: 2)
  style: solid|dashed|dotted
  head: default
  headLength: <number>      // arrowhead size (default: 15)
  curve: straight|curved|elbow
  curveAmount: <number>     // curve intensity (default: 50)
  label: "<text>"           // label at midpoint
  labelColor: <color>       // (default: #e0e0e0)
  labelFontSize: <number>   // (default: 12)
}`} />
              <h4 className="text-text-primary text-sm font-medium mt-5 mb-2">Connection Endpoints</h4>
              <CodeBlock code={`// Absolute coordinates
arrow a1 from 100, 200 to 300, 400 { ... }

// Shape references with side
arrow a2 from myRect.bottom to myCircle.top { ... }

// Shape reference (defaults to center)
arrow a3 from myRect to myCircle { ... }

// With offset
arrow a4 from myRect.right + 10 to other.left { ... }`} />
              <p className="text-text-muted text-sm mt-3">
                <strong>Sides:</strong> <code className="font-[lixCode] text-accent-blue">top</code>, <code className="font-[lixCode] text-accent-blue">bottom</code>, <code className="font-[lixCode] text-accent-blue">left</code>, <code className="font-[lixCode] text-accent-blue">right</code>, <code className="font-[lixCode] text-accent-blue">center</code>.
                Arrows auto-attach — they follow when the shape moves.
              </p>
            </Section>

            <Section id="line-ref" title="line — Undirected Line" icon="bx-minus" defaultOpen={false}>
              <CodeBlock code={`line <id> from <source> to <target> {
  stroke: <color>           // (default: #fff)
  strokeWidth: <number>     // (default: 2)
  style: solid|dashed|dotted
  curve: true|false         // (default: false)
  label: "<text>"
  labelColor: <color>
}`} />
              <p className="text-text-muted text-sm mt-3">
                Same <code className="font-[lixCode] text-accent-blue">from ... to ...</code> syntax as arrows. Supports both absolute coordinates and shape references.
              </p>
            </Section>
          </div>

          {/* Relative Positioning */}
          <div id="positioning" className="mb-10">
            <Section id="pos-inner" title="Relative Positioning" icon="bx-move" defaultOpen={false}>
              <p className="text-text-muted text-sm mt-4 mb-4">
                Reference other shapes' positions for dynamic layout. Shapes are resolved in declaration order.
              </p>
              <CodeBlock code={`rect node1 at 100, 100 size 160x60 {
  label: "First"
}

// Place node2 to the right of node1 with 40px gap
rect node2 at node1.right + 40, node1.y size 160x60 {
  label: "Second"
}

// Place node3 below node1
rect node3 at node1.x, node1.bottom + 30 size 160x60 {
  label: "Third"
}`} />
              <PropTable rows={[
                ['id.x', 'number', 'Left edge X'],
                ['id.y', 'number', 'Top edge Y'],
                ['id.right', 'number', 'Right edge (x + width)'],
                ['id.bottom', 'number', 'Bottom edge (y + height)'],
                ['id.left', 'number', 'Same as x'],
                ['id.top', 'number', 'Same as y'],
                ['id.centerX', 'number', 'Horizontal center'],
                ['id.centerY', 'number', 'Vertical center'],
                ['id.width', 'number', 'Shape width'],
                ['id.height', 'number', 'Shape height'],
              ]} />
            </Section>
          </div>

          {/* Frames */}
          <div id="frames" className="mb-10">
            <Section id="frames-inner" title="Frames — Group Containers" icon="bx-border-all" defaultOpen={false}>
              <CodeBlock code={`frame <id> at <x>, <y> size <w>x<h> {
  name: "<display name>"    // frame label (default: the id)
  stroke: <color>           // border color (default: #555)
  strokeWidth: <number>     // (default: 1)
  fill: <color>             // (default: transparent)
  opacity: <0-1>            // (default: 1)
  contains: id1, id2, id3   // specific shapes to include
}`} />
              <div className="mt-4 p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                <p className="text-text-secondary text-sm leading-relaxed">
                  <strong className="text-green-400">Auto-frame:</strong> If you don't define a frame, one is automatically created wrapping all shapes with 40px padding.
                  If <code className="font-[lixCode] text-green-400">contains</code> is omitted, all shapes are added to the frame.
                </p>
              </div>
            </Section>
          </div>

          {/* Styling */}
          <div id="styling" className="mb-10 space-y-4">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Styling Reference</h2>

            <Section id="style-colors" title="Colors" icon="bx-palette" defaultOpen={false}>
              <p className="text-text-muted text-sm mt-4 mb-4">
                Use hex colors (<code className="font-[lixCode] text-text-secondary">#RGB</code> or <code className="font-[lixCode] text-text-secondary">#RRGGBB</code>) or the <code className="font-[lixCode] text-text-secondary">transparent</code> keyword.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { color: '#4A90D9', name: 'Blue' },
                  { color: '#2ECC71', name: 'Green' },
                  { color: '#E74C3C', name: 'Red' },
                  { color: '#F39C12', name: 'Amber' },
                  { color: '#9B59B6', name: 'Purple' },
                  { color: '#1ABC9C', name: 'Teal' },
                  { color: '#E67E22', name: 'Orange' },
                  { color: '#e0e0e0', name: 'Gray' },
                ].map(({ color, name }) => (
                  <div key={color} className="flex items-center gap-2 p-2 rounded-lg bg-surface-card border border-white/[0.06]">
                    <div className="w-5 h-5 rounded-md border border-white/10" style={{ background: color }} />
                    <span className="text-text-secondary text-xs">{name}</span>
                    <span className="text-text-dim text-[10px] font-[lixCode] ml-auto">{color}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="style-lines" title="Line & Fill Styles" icon="bx-line-chart" defaultOpen={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <h4 className="text-text-primary text-sm font-medium mb-2">Line Styles</h4>
                  <PropTable rows={[
                    ['solid', 'default', 'Continuous line'],
                    ['dashed', '—', 'Long dashes'],
                    ['dotted', '...', 'Short dots'],
                  ]} />
                </div>
                <div>
                  <h4 className="text-text-primary text-sm font-medium mb-2">Fill Styles</h4>
                  <PropTable rows={[
                    ['none', 'default', 'Transparent / no fill'],
                    ['solid', '█', 'Solid color fill'],
                    ['hachure', '///', 'Diagonal line hatching'],
                    ['cross-hatch', 'XXX', 'Cross-hatched pattern'],
                    ['dots', '···', 'Dotted pattern fill'],
                  ]} />
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-text-primary text-sm font-medium mb-2">Arrow Curve Modes</h4>
                <PropTable rows={[
                  ['straight', 'default', 'Direct line between endpoints'],
                  ['curved', '~', 'Bezier curve'],
                  ['elbow', '⌐', 'Right-angle routing'],
                ]} />
              </div>
            </Section>
          </div>

          {/* JavaScript API */}
          <div id="api" className="mb-10">
            <Section id="api-inner" title="JavaScript API" icon="bx-code-alt" defaultOpen={false}>
              <p className="text-text-muted text-sm mt-4 mb-4">
                LixScript is exposed globally via window bridges after the SketchEngine initializes.
              </p>
              <CodeBlock language="javascript" code={`// Parse source — returns { variables, shapes, errors }
const parsed = window.__lixscriptParse(source)

// Generate SVG preview string (for modal preview)
const svgMarkup = window.__lixscriptPreview(source)

// Execute on canvas — creates real interactive shapes
const result = window.__lixscriptExecute(source)
// result: { success: boolean, shapesCreated: number, errors: [] }

// Render from pre-parsed AST
const result = window.__lixscriptRender(parsed)`} />
            </Section>
          </div>

          {/* LLM Spec */}
          <div id="llm" className="mb-10">
            <Section id="llm-inner" title="LixScript Compact Spec — Coming Soon" icon="bx-code-block" defaultOpen={true}>
              <div className="mt-4 mb-4">
                <p className="text-text-muted text-sm leading-relaxed mb-4">
                  Preview of the compact LixScript specification planned for programmable canvas generation.
                  This interface is separate from the available package MCP server.
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    disabled
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-surface-hover text-text-dim border border-border cursor-not-allowed"
                  >
                    <i className="bx bx-time-five text-base" />
                    LixScript access coming soon
                  </button>
                  <span className="text-text-dim text-xs">~2.5k tokens</span>
                </div>
              </div>

              <div className="relative group">
                <pre className="bg-[#171120] border border-white/[0.08] rounded-xl p-4 overflow-x-auto text-xs leading-relaxed max-h-[500px] overflow-y-auto">
                  <code className="text-text-dim font-[lixCode] whitespace-pre-wrap">{LIXSCRIPT_LLM_SPEC}</code>
                </pre>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
                <h4 className="text-purple-400 text-sm font-medium mb-2">Need MCP today?</h4>
                <p className="text-text-muted text-sm leading-relaxed">
                  Use the package-native MCP server for structured scene patches, previews, and published template imports. <Link href="/docs/mcp" className="text-accent hover:underline">Open the MCP setup guide.</Link>
                </p>
              </div>
            </Section>
          </div>

          {/* Complete Example */}
          <div className="mb-16">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Complete Example</h2>
            <CodeBlock code={`// User authentication flow
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$gray = #e0e0e0

rect login at 200, 50 size 170x55 {
  stroke: $blue
  label: "Login Page"
}

rect validate at 200, 170 size 170x55 {
  stroke: $blue
  label: "Validate Creds"
}

circle check at 200, 310 size 80x80 {
  stroke: $red
  label: "Valid?"
}

rect dashboard at 200, 440 size 170x55 {
  stroke: $green
  label: "Dashboard"
}

rect error at 430, 310 size 140x55 {
  stroke: $red
  label: "Show Error"
}

// Connections
arrow a1 from login.bottom to validate.top {
  stroke: $gray
  label: "Submit"
}

arrow a2 from validate.bottom to check.top {
  stroke: $gray
}

arrow a3 from check.bottom to dashboard.top {
  stroke: $green
  label: "Yes"
}

arrow a4 from check.right to error.left {
  stroke: $red
  label: "No"
}

arrow a5 from error.top to login.right {
  stroke: $red
  curve: curved
  style: dashed
  label: "Retry"
}`} />
          </div>

          {/* Blog */}
          <div id="blog" className="mb-16">
            <h2 className="text-xl font-semibold text-text-primary mb-2">Blog</h2>
            <p className="text-text-muted text-sm mb-6">Deep dives into how LixSketch works — architecture, security, and design decisions.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blogPosts.map(post => (
                <Link
                  key={post.slug}
                  href={`/docs/blog/${post.slug}`}
                  className="group p-5 rounded-xl border border-white/[0.06] hover:border-accent-blue/30 hover:bg-white/[0.02] transition-all duration-200"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center shrink-0">
                      <i className={`${post.icon} text-base text-accent-blue`} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded bg-surface-card text-text-dim uppercase tracking-wider">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <h3 className="text-text-primary text-sm font-medium mb-1.5 group-hover:text-accent-blue transition-colors">{post.title}</h3>
                  <p className="text-text-dim text-xs leading-relaxed mb-2">{post.description}</p>
                  <p className="text-text-dim text-[10px]">{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t border-white/[0.06] pt-8 pb-12">
            <div className="flex items-center justify-between">
              <p className="text-text-dim text-xs">LixScript is part of <a href="/" className="text-accent-blue hover:underline">LixSketch</a> — an open-source alternative to app.eraser.io</p>
              <span className="text-text-dim text-[10px] uppercase">Beta</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}
