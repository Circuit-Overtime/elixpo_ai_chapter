import Link from 'next/link'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { DynamicCta } from './components/DynamicCta'
import { InstallCommands } from './components/InstallCommands'

export default function Home() {
  return <><SiteHeader /><main>
    <section className="hero">
      <div className="hero-glow" />
      <div className="hero-intro"><div className="hero-message"><p className="status-pill"><span /> Open source · self-hosted · cross-platform</p><h1>A terminal for commands.<br /><em>An agent for outcomes.</em></h1><p className="hero-copy">Crumb is a native Rust terminal with an autonomous agent built in. Use Bash, Zsh, or PowerShell normally, or describe a larger goal and let Crumb plan and execute it through tools and permissions you control. Pollinations supplies the model intelligence.</p><div className="hero-actions"><Link className="button" href="/docs/getting-started">Read the quickstart <span>→</span></Link><a className="button button-secondary" href="https://github.com/elixpo/crumb.elixpo">View source <span>↗</span></a></div></div><InstallCommands /></div>
      <dl className="hero-facts"><div><dt>Native Rust</dt><dd>Fast local harness and terminal</dd></div><div><dt>Real shell</dt><dd>Normal commands do not need AI</dd></div><div><dt>Your policy</dt><dd>Models cannot grant permissions</dd></div><div><dt>Pollinations</dt><dd>Connected model intelligence</dd></div></dl>
      <div className="terminal-window" aria-label="Crumb terminal preview">
        <div className="terminal-title"><div><i /><i /><i /></div><span>crumb — ~/projects/NLT</span><b>NLT</b></div>
        <pre><span className="dim">╭─[ crumb ]─[ ~/projects/NLT ]─[ linux ]─[ git:main ]</span>{'\n'}<span className="caret">╰─❯</span> <span className="ask">find why the API tests fail and fix the smallest issue</span>{'\n'}<span className="agent">◆ harness</span> qwen-coder · effort: high · skill: rust-maintainer{'\n'}<span className="tool">  ↳ read</span> Cargo.toml, crates/api/tests{'\n'}<span className="tool">  ↳ run </span><span className="command">cargo test -p crumb-api</span>{'\n'}<span className="red">    error[E0308]</span> mismatched status type at src/routes.rs:84{'\n'}<span className="tool">  ↳ patch</span> crates/api/src/routes.rs <span className="yes">approved</span>{'\n'}<span className="tool">  ↳ run </span><span className="command">cargo test -p crumb-api</span>{'\n'}<span className="green">    12 passed</span>; 0 failed{'\n\n'}<span className="agent">◆ done</span> Normalized the handler&apos;s status conversion; no API behavior changed.{'\n'}<span className="dim">  1 file changed · session saved · Ctrl+C cancels at any step</span></pre>
      </div>
    </section>

    <section className="starter-section" id="quickstart">
      <div className="starter-copy"><p className="kicker">Start in sixty seconds</p><h2>Open Crumb.<br />Try something real.</h2><p>Native commands work immediately. Connect Pollinations when you want the agent, then describe an outcome in ordinary language.</p><Link className="text-link" href="/docs/getting-started">Read the quickstart <span>→</span></Link></div>
      <div className="starter-terminal" aria-label="Commands to try after installing Crumb">
        <div><span>1</span><small>Launch</small><code>crumb</code></div>
        <div><span>2</span><small>Connect the agent</small><code>/auth login</code></div>
        <div><span>3</span><small>Learn a codebase</small><code>explain this workspace and show me where to start</code></div>
        <div><span>4</span><small>Ship a safe fix</small><code>find why the tests fail, fix the smallest issue, and run the checks</code></div>
      </div>
    </section>

    <section className="section" id="features"><p className="kicker">A terminal and an agent</p><div className="section-heading"><h2>Autonomous work without replacing your shell.</h2><p>Your normal commands still run in Bash, Zsh, or PowerShell. Larger goals enter Crumb's own harness, where planning, memory, tools, checkpoints, and supervision stay under local policy. <Link className="inline-arrow" href="/features">Explore every feature →</Link></p></div>
      <div className="feature-grid">
        <article><span>01</span><div className="feature-icon">$_</div><h3>Your shell still works</h3><p>Keep using the commands, programs, shortcuts, and full-screen tools you already know.</p></article>
        <article><span>02</span><div className="feature-icon">◆</div><h3>Delegate the outcome</h3><p>Describe a goal and let Crumb's native harness plan, use approved tools, verify progress, and continue across multiple steps.</p></article>
        <article><span>03</span><div className="feature-icon">⌁</div><h3>Connect Pollinations safely</h3><p>Authorize Pollinations in the browser instead of pasting its private key into commands or chat.</p></article>
      </div>
    </section>

    <section className="boundary-section"><div><p className="kicker">Autonomy with evidence</p><h2>Let Crumb work, while keeping the boundary visible.</h2><p>The harness can pursue a goal independently inside permissions you control. Models cannot grant themselves access, and you can inspect activity, steer the task, restore a checkpoint, or cancel the entire chain.</p><Link className="text-link" href="/docs">See how it works <span>→</span></Link></div><ol><li><b>1</b><span><strong>Give Crumb a goal</strong>The native harness prepares the work.</span></li><li><b>2</b><span><strong>Apply local policy</strong>Skills, tools, memory, and permissions remain inspectable.</span></li><li><b>3</b><span><strong>Follow the evidence</strong>Progress, tool activity, and outcomes remain visible.</span></li></ol></section>

    <section className="flow-section">
      <div className="flow-heading"><p className="kicker">One line, three steps</p><h2>Quick for commands.<br />Careful with bigger jobs.</h2></div>
      <div className="flow-track"><article><span>01</span><b>Crumb understands the input</b><p>Known commands go straight to your shell. Plain-language requests go to the agent.</p></article><i>→</i><article><span>02</span><b>The right setup is loaded</b><p>Crumb picks the instructions, model, tools, and context needed for the job.</p></article><i>→</i><article><span>03</span><b>You see the work happen</b><p>Actions run with clear permissions, live progress, and one cancellation shortcut.</p></article></div>
    </section>

    <section className="namespace-section">
      <div><p className="kicker">Designed for recall</p><h2>A small grammar for serious work.</h2><p>Write normally to ask. Use `/` for Crumb actions and `@` to bring precise context into the request.</p><Link className="text-link" href="/docs/cli">Learn the CLI grammar <span>→</span></Link></div>
      <div className="namespace-cards"><article><code>/</code><span><b>Control the terminal</b><small>/skills · /mode · /connectors · /doctor</small></span></article><article><code>@</code><span><b>Reference context</b><small>@file · @folder · @skill · @connector</small></span></article><article><code>⌃C</code><span><b>Stop the whole chain</b><small>Cancel the model, Harness, and child process.</small></span></article></div>
    </section>

    <section className="ecosystem-section"><div><p className="kicker">Make it yours</p><h2>Add the knowledge<br />and tools you need.</h2><p>Skills show Crumb how to approach a job. Plugins provide local, permission-aware tools. Pollinations is the single external connector available in this release.</p><div><Link className="button" href="/skills">Explore skills</Link><Link className="button button-secondary" href="/plugins">Explore plugins</Link></div></div><aside><div><span>Skills</span><strong>Ways of working</strong><small>Clear · inspectable · reusable</small></div><div><span>Plugins</span><strong>Tools for the job</strong><small>Limited · permissioned · replaceable</small></div><div><span>Connector</span><strong>Pollinations</strong><small>Secure · revocable · user-owned</small></div></aside></section>

    <DynamicCta />
  </main><SiteFooter /></>
}
