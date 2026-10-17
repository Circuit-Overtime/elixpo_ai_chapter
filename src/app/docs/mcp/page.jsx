import Link from 'next/link'
import { MCP_CONNECTION_TEST_PROMPT } from '@/lib/mcpClientConfig'

const CLIENT_CONFIG = `{
  "mcpServers": {
    "lixsketch": {
      "command": "npx",
      "args": [
        "-y",
        "@elixpo/lixsketch@latest",
        "--scene",
        "/absolute/path/to/architecture.lixjson"
      ]
    }
  }
}`

const REMOTE_CONFIG = `{
  "mcpServers": {
    "lixsketch": {
      "command": "npx",
      "args": [
        "-y", "@elixpo/lixsketch@latest",
        "--remote", "https://sketch.elixpo.com",
        "--workspace", "lx-..."
      ],
      "env": {
        "LIXSKETCH_AGENT_TOKEN": "lixmcp_...",
        "LIXSKETCH_ENCRYPTION_KEY": "workspace-key"
      }
    }
  }
}`

const CODEX_CONFIG = `[mcp_servers.lixsketch]
command = "npx"
args = ["-y", "@elixpo/lixsketch@latest", "--remote", "https://sketch.elixpo.com", "--workspace", "lx-..."]
startup_timeout_sec = 30

[mcp_servers.lixsketch.env]
LIXSKETCH_AGENT_TOKEN = "lixmcp_..."
LIXSKETCH_ENCRYPTION_KEY = "workspace-key"`

const CODEX_COMMAND = `codex mcp add lixsketch \\
  --env LIXSKETCH_AGENT_TOKEN="lixmcp_..." \\
  --env LIXSKETCH_ENCRYPTION_KEY="workspace-key" \\
  -- npx -y @elixpo/lixsketch@latest \\
  --remote https://sketch.elixpo.com \\
  --workspace lx-...`

const CLAUDE_COMMAND = `claude mcp add --scope user lixsketch \\
  --env LIXSKETCH_AGENT_TOKEN="lixmcp_..." \\
  --env LIXSKETCH_ENCRYPTION_KEY="workspace-key" \\
  -- npx -y @elixpo/lixsketch@latest \\
  --remote https://sketch.elixpo.com \\
  --workspace lx-...`

const VSCODE_CONFIG = `{
  "servers": {
    "lixsketch": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y", "@elixpo/lixsketch@latest",
        "--remote", "https://sketch.elixpo.com",
        "--workspace", "lx-..."
      ],
      "env": {
        "LIXSKETCH_AGENT_TOKEN": "lixmcp_...",
        "LIXSKETCH_ENCRYPTION_KEY": "workspace-key"
      }
    }
  }
}`

const PATCH_EXAMPLE = `{
  "expectedRevision": 0,
  "dryRun": true,
  "operations": [
    {
      "op": "add",
      "shape": {
        "type": "rectangle",
        "shapeID": "api-service",
        "x": 120,
        "y": 80,
        "width": 220,
        "height": 100,
        "options": {
          "stroke": "#a78bfa",
          "fill": "#2f2442"
        }
      }
    }
  ]
}`

const NODE_EXAMPLE = `import {
  createLixSketchMcpServer,
  MemorySceneStore,
  createEmptyScene,
} from '@elixpo/lixsketch/mcp'

const server = createLixSketchMcpServer({
  store: new MemorySceneStore(createEmptyScene('Architecture')),
})`

const TOOLS = [
  ['canvas_get', 'Read the canvas summary, current revision, and optionally selected or all shapes.'],
  ['canvas_apply_patch', 'Atomically add, update, translate, delete, or rename scene content.'],
  ['canvas_validate', 'Check scene format, geometry, unique IDs, and package limits.'],
  ['canvas_preview', 'Render a lightweight SVG preview before or after a change.'],
  ['canvas_new', 'Replace the scene with a blank canvas after explicit confirmation.'],
  ['lixscript_apply', 'Compile LixScript into the validated atomic patch pipeline.'],
  ['templates_search', 'Search public workspace and component templates.'],
  ['template_insert', 'Insert a published template with remapped shape and relationship IDs.'],
]

function CodeBlock({ children }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#171120] p-4 text-xs leading-6 text-[#d8c9f5] sm:text-sm">
      <code className="font-[lixCode]">{children}</code>
    </pre>
  )
}

function DocSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-surface-card p-5 sm:p-7">
      <h2 className="text-xl text-text-primary">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-text-muted">{children}</div>
    </section>
  )
}

export default function McpDocsPage() {
  return (
    <div className="min-h-screen bg-surface-dark font-[lixFont] text-text-primary">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-dark/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/?noredirect=1" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <img src="/icon.png" alt="LixSketch" className="h-7 w-7 rounded-md" />
              <span>LixSketch</span>
            </Link>
            <span className="text-text-dim">/</span>
            <Link href="/docs" className="text-text-muted hover:text-text-primary">Docs</Link>
            <span className="text-text-dim">/</span>
            <span className="text-text-secondary">MCP Server</span>
          </div>
          <Link href="/resources/npm-package" className="rounded-lg bg-accent px-3.5 py-2 text-xs text-white transition hover:bg-accent/85">
            Package docs
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 rounded-xl border border-white/[0.06] bg-surface-card p-3 text-sm">
            {[
              ['overview', 'Overview'],
              ['quick-start', 'Quick start'],
              ['agents', 'Agent setup'],
              ['troubleshooting', 'Troubleshooting'],
              ['test', 'Test connection'],
              ['setup', 'Local scene'],
              ['remote', 'Remote workspace'],
              ['tools', 'Tools'],
              ['workflow', 'Safe workflow'],
              ['templates', 'Templates'],
              ['embedding', 'Package API'],
              ['limits', 'Limits'],
              ['deployment', 'Deployment'],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">{label}</a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-7">
          <section id="overview" className="scroll-mt-24 pb-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent">
              <i className="bx bx-plug text-base" />
              LixSketch Docs
            </div>
            <h1 className="mt-3 text-3xl text-text-primary sm:text-4xl">MCP server</h1>
            <div className="mt-4 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-200">
              <i className="bx bx-time-five mt-0.5 text-lg" aria-hidden="true" />
              <div><p className="text-text-primary">Remote workspace connection is coming soon</p><p className="mt-1 text-xs leading-6 text-text-muted">The package-local scene server remains available for development. Production workspace grants and remote canvas edits are disabled while the connector completes validation.</p></div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-text-muted sm:text-base">
              The LixSketch package includes a local MCP server that lets compatible tools inspect and edit structured canvas scenes, validate changes, render previews, and reuse published templates.
            </p>
            <div className="mt-5 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-6 text-text-muted">
              MCP can edit an atomic local scene file today. Encrypted cloud-workspace access and its LixScript batch-input connection remain a preview until the production connector is released.
            </div>
          </section>

          <DocSection id="quick-start" title="Remote workspace preview">
            <p className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-6 text-text-muted">These steps are available in local development only. Production profiles show the connector as Coming soon.</p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>Open <Link href="/profile?tab=workspaces" className="text-accent hover:underline">Profile → Workspaces</Link>, choose a workspace, and open <strong className="font-normal text-text-secondary">Remote MCP</strong>.</li>
              <li>Create access with only the permissions your agent needs. LixSketch generates the workspace ID, token, and E2E key for you.</li>
              <li>Select your client format and copy the <strong className="font-normal text-text-secondary">entire configuration</strong>. Do not copy individual lines or edit the generated secrets.</li>
            </ol>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4"><p className="text-text-secondary">Codex TOML</p><p className="mt-2 text-xs leading-6">Paste the complete output, including both square-bracket headings, into <code className="font-[lixCode] text-accent">~/.codex/config.toml</code>. Restart Codex and run <code className="font-[lixCode] text-accent">codex mcp list</code>.</p></div>
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4"><p className="text-text-secondary">MCP JSON</p><p className="mt-2 text-xs leading-6">Paste the complete JSON object into Cursor, Claude Desktop, Windsurf, or another client that accepts a top-level <code className="font-[lixCode] text-accent">mcpServers</code> object.</p></div>
            </div>
          </DocSection>

          <DocSection id="agents" title="Set up common agent clients">
            <div className="space-y-7">
              <div>
                <h3 className="text-base text-text-secondary">Codex CLI, IDE, and desktop</h3>
                <p className="mb-3 mt-1 text-xs">Easiest: copy <strong className="font-normal text-text-secondary">Codex TOML</strong> from LixSketch and paste the whole block into <code className="font-[lixCode] text-accent">~/.codex/config.toml</code> (or a trusted project’s <code className="font-[lixCode] text-accent">.codex/config.toml</code>).</p>
                <CodeBlock>{CODEX_CONFIG}</CodeBlock>
                <p className="mb-3 mt-4 text-xs">CLI alternative:</p>
                <CodeBlock>{CODEX_COMMAND}</CodeBlock>
                <p className="mt-3 text-xs">Verify with <code className="font-[lixCode] text-accent">codex mcp list</code>, then restart the active Codex session. See the <a href="https://developers.openai.com/codex/mcp/" target="_blank" rel="noreferrer" className="text-accent hover:underline">Codex MCP guide</a>.</p>
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-base text-text-secondary">Claude Code and Claude Desktop</h3>
                <p className="mb-3 mt-1 text-xs">Claude Desktop accepts the generated <strong className="font-normal text-text-secondary">MCP JSON</strong>. Claude Code can use that JSON or this command:</p>
                <CodeBlock>{CLAUDE_COMMAND}</CodeBlock>
                <p className="mt-3 text-xs">Verify with <code className="font-[lixCode] text-accent">claude mcp get lixsketch</code>. See Anthropic’s <a href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noreferrer" className="text-accent hover:underline">Claude Code MCP guide</a>.</p>
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-base text-text-secondary">Cursor and Windsurf</h3>
                <p className="mt-1 text-xs">Paste the generated <strong className="font-normal text-text-secondary">MCP JSON</strong> unchanged into <code className="font-[lixCode] text-accent">~/.cursor/mcp.json</code> for Cursor or <code className="font-[lixCode] text-accent">~/.codeium/windsurf/mcp_config.json</code> for Windsurf. Restart the MCP server from the client after saving.</p>
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-base text-text-secondary">VS Code agent mode</h3>
                <p className="mb-3 mt-1 text-xs">VS Code uses a different top-level key. Create <code className="font-[lixCode] text-accent">.vscode/mcp.json</code> for the current project, replace the placeholders with values from the generated configuration, and use:</p>
                <CodeBlock>{VSCODE_CONFIG}</CodeBlock>
                <p className="mt-3 text-xs">Run <strong className="font-normal text-text-secondary">MCP: List Servers</strong> from the Command Palette. See the <a href="https://code.visualstudio.com/docs/agents/reference/mcp-configuration" target="_blank" rel="noreferrer" className="text-accent hover:underline">VS Code MCP reference</a>.</p>
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-6 text-amber-100/75">Generated configurations contain workspace credentials. Keep personal config files out of source control, grant only necessary scopes, and revoke access from LixSketch when a client is no longer used.</div>
          </DocSection>

          <DocSection id="troubleshooting" title="Troubleshoot server startup">
            <p className="mb-4">An error ending with <code className="font-[lixCode] text-accent">connection closed: initialize response</code> means the local command exited before the client completed the MCP handshake. It does not indicate a workspace or usage-limit error.</p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>In the same terminal that launches the client, run <code className="font-[lixCode] text-accent">type -a codex</code>, <code className="font-[lixCode] text-accent">node --version</code>, and <code className="font-[lixCode] text-accent">command -v npx</code>. LixSketch requires Node.js 20 or newer and an accessible <code className="font-[lixCode] text-accent">npx</code>.</li>
              <li>Run <code className="font-[lixCode] text-accent">npx -y @elixpo/lixsketch@latest --help</code>. Fix this command before testing it through an MCP client.</li>
              <li>If more than one Codex installation is listed, use the first one from the same Node.js installation as the working <code className="font-[lixCode] text-accent">npx</code>. Remove or reorder stale installations if they shadow it.</li>
              <li>If <code className="font-[lixCode] text-accent">npx</code> works in your shell but not in the client, replace <code className="font-[lixCode] text-accent">command = &quot;npx&quot;</code> with the absolute path returned by <code className="font-[lixCode] text-accent">command -v npx</code>. The LixSketch website cannot detect local executable paths, so this replacement is intentionally manual.</li>
              <li>For Codex, keep <code className="font-[lixCode] text-accent">startup_timeout_sec = 30</code> in the generated TOML and restart Codex completely. <code className="font-[lixCode] text-accent">codex mcp list</code> confirms that the configuration was registered; <code className="font-[lixCode] text-accent">/mcp</code> in a fresh session confirms that the server actually started.</li>
            </ol>
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-6 text-amber-100/75">
              Avoid unofficial or confined Codex packages when they cannot inherit your Node.js PATH. Install Codex through an official OpenAI distribution, then repeat the preflight commands above.
            </div>
          </DocSection>

          <DocSection id="test" title="Test the workspace connection">
            <p className="mb-4">Start a fresh session after adding the MCP server, then send this prompt. It verifies reading, decryption, dry-run validation, previewing, writing, and revision persistence without changing existing content.</p>
            <CodeBlock>{MCP_CONNECTION_TEST_PROMPT}</CodeBlock>
            <p className="mt-4">Keep the canvas open in another tab while testing. The lavender card should appear after the committed step. If only the first step works, recreate the grant with <strong className="font-normal text-text-secondary">Edit canvas</strong> enabled.</p>
          </DocSection>

          <DocSection id="setup" title="Work with a local scene file">
            <p className="mb-4">Add the server to a client that supports local stdio MCP servers. Use an absolute scene path so the same canvas is opened on every launch.</p>
            <CodeBlock>{CLIENT_CONFIG}</CodeBlock>
            <p className="mt-4">The equivalent terminal command is <code className="font-[lixCode] text-accent">npx @elixpo/lixsketch@latest --scene ./architecture.lixjson</code>. JSON-RPC uses stdout; status messages use stderr.</p>
          </DocSection>

          <DocSection id="remote" title="Remote encrypted workspace">
            <ol className="mb-4 list-decimal space-y-2 pl-5">
              <li>Sign in and open <Link href="/profile?tab=workspaces" className="text-accent hover:underline">Profile → Workspaces</Link>.</li>
              <li>Open the plug action for a workspace and create 30-day edit access.</li>
              <li>Copy the generated client configuration. The grant token is shown once.</li>
              <li>Revoke the client from the same panel whenever it is no longer needed.</li>
            </ol>
            <CodeBlock>{REMOTE_CONFIG}</CodeBlock>
            <p className="mt-4">The grant is scoped to one workspace. LixSketch stores only a hash of the token. The AES key remains in the browser and local MCP environment, so the server persists and relays ciphertext without being able to read the canvas.</p>
          </DocSection>

          <DocSection id="tools" title="Available tools">
            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="w-full min-w-[620px] text-left">
                <thead className="border-b border-white/[0.07] bg-black/10 text-xs text-text-dim">
                  <tr><th className="px-4 py-3 font-normal">Tool</th><th className="px-4 py-3 font-normal">Purpose</th></tr>
                </thead>
                <tbody>
                  {TOOLS.map(([name, purpose]) => (
                    <tr key={name} className="border-b border-white/[0.055] last:border-0">
                      <td className="px-4 py-3 font-[lixCode] text-xs text-accent">{name}</td>
                      <td className="px-4 py-3 text-xs text-text-muted">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocSection>

          <DocSection id="workflow" title="Safe editing workflow">
            <ol className="mb-5 list-decimal space-y-2 pl-5">
              <li>Call <code className="font-[lixCode] text-accent">canvas_get</code> and retain its revision.</li>
              <li>Submit a patch with that <code className="font-[lixCode] text-accent">expectedRevision</code> and <code className="font-[lixCode] text-accent">dryRun: true</code>.</li>
              <li>Inspect <code className="font-[lixCode] text-accent">canvas_preview</code> when geometry or layout changed.</li>
              <li>Repeat the same patch with <code className="font-[lixCode] text-accent">dryRun: false</code> to save it.</li>
            </ol>
            <CodeBlock>{PATCH_EXAMPLE}</CodeBlock>
            <p className="mt-4">A patch is stored in full or not at all. A stale revision returns a conflict instead of overwriting a newer edit.</p>
            <p className="mt-3"><code className="font-[lixCode] text-accent">lixscript_apply</code> follows this exact workflow: source is compiled into structured operations, validated, previewable through a dry run, and committed atomically.</p>
          </DocSection>

          <DocSection id="templates" title="Published templates">
            <p>Use <code className="font-[lixCode] text-accent">templates_search</code> to find public workspace or component templates, including reusable symbol packs. Then call <code className="font-[lixCode] text-accent">template_insert</code> with its slug and target coordinates.</p>
            <p className="mt-3">Insertion remaps shape, frame, group, and attachment identifiers before adding the template to the current scene, so repeated imports do not collide.</p>
            <Link href="/templates" className="mt-4 inline-flex items-center gap-2 text-accent hover:underline">Browse the marketplace <i className="bx bx-right-arrow-alt" /></Link>
          </DocSection>

          <DocSection id="embedding" title="Package API">
            <p className="mb-4">Custom hosts can use the runtime-neutral server factory with a memory store or an asynchronous store implementing <code className="font-[lixCode] text-accent">read()</code> and <code className="font-[lixCode] text-accent">write(scene)</code>.</p>
            <CodeBlock>{NODE_EXAMPLE}</CodeBlock>
            <p className="mt-4">Node-only hosts can import <code className="font-[lixCode] text-accent">FileSceneStore</code> and <code className="font-[lixCode] text-accent">serveLixSketchStdio</code> from <code className="font-[lixCode] text-accent">@elixpo/lixsketch/mcp/node</code>.</p>
          </DocSection>

          <DocSection id="limits" title="Supported content and limits">
            <ul className="space-y-2">
              <li>Writable types: rectangle, circle, line, arrow, frame, freehand stroke, and text.</li>
              <li>Images, icons, and code shapes can be preserved and read, but direct arbitrary markup writes are blocked.</li>
              <li>Maximum 5,000 shapes per scene and 500 operations per patch.</li>
              <li>Local scene files are capped at 20 MB, requests at 10 MB, and SVG previews at 5 MB.</li>
              <li><code className="font-[lixCode] text-accent">canvas_new</code> requires explicit confirmation because it replaces the current scene.</li>
            </ul>
          </DocSection>

          <DocSection id="deployment" title="Deployment configuration">
            <ul className="space-y-2">
              <li>Apply D1 migration <code className="font-[lixCode] text-accent">0010_mcp_workspace_grants.sql</code> before deploying the routes.</li>
              <li>Set the same high-entropy <code className="font-[lixCode] text-accent">MCP_RELAY_SECRET</code> on the Pages and collaboration Worker deployments.</li>
              <li>Set <code className="font-[lixCode] text-accent">MCP_RELAY_URL</code> on Pages to the collaboration Worker origin.</li>
              <li>Do not expose either deployment value through a <code className="font-[lixCode] text-accent">NEXT_PUBLIC_</code> variable.</li>
            </ul>
          </DocSection>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-5 text-sm">
            <Link href="/docs" className="text-text-muted hover:text-text-primary"><i className="bx bx-left-arrow-alt mr-1" />Back to Docs</Link>
            <Link href="/templates" className="text-accent hover:underline">Explore templates</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
