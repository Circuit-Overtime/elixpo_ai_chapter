import Link from 'next/link'

const DEPLOYED_ORIGIN = 'https://sketch.elixpo.com'

function Value({ children }) {
  return <code className="break-all rounded-md border border-white/[0.08] bg-[#171120] px-2 py-1 font-[lixCode] text-xs text-[#cbb7f5]">{children}</code>
}

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-2 border-b border-white/[0.055] py-3 last:border-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-xs text-text-dim">{label}</dt>
      <dd><Value>{value}</Value></dd>
    </div>
  )
}

function ConnectorCard({ id, icon, title, summary, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-surface-card p-5 sm:p-7">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <i className={`bx ${icon} text-2xl`} />
        </div>
        <div>
          <h2 className="text-xl text-text-primary">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{summary}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function ConnectorsDocsPage() {
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
            <span className="text-text-secondary">Connectors</span>
          </div>
          <Link href="/profile?tab=integrations" className="cursor-pointer rounded-lg bg-accent px-3.5 py-2 text-xs text-white transition hover:bg-accent/85">
            Manage integrations
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 rounded-xl border border-white/[0.06] bg-surface-card p-3 text-sm">
            <a href="#overview" className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">Overview</a>
            <a href="#cloudinary" className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">Cloudinary</a>
            <a href="#pollinations" className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">Pollinations</a>
            <a href="#security" className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">Security</a>
            <a href="#troubleshooting" className="block rounded-lg px-3 py-2 text-text-muted hover:bg-surface-hover hover:text-text-primary">Troubleshooting</a>
          </nav>
        </aside>

        <div className="min-w-0 space-y-7">
          <section id="overview" className="scroll-mt-24 pb-3">
            <p className="text-xs uppercase tracking-[0.18em] text-accent">LixSketch Docs</p>
            <h1 className="mt-3 text-3xl text-text-primary sm:text-4xl">Personal connectors</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-text-muted sm:text-base">
              Connect provider accounts without sharing API secrets with LixSketch. Cloudinary stores new canvas and document media in your product environment; Pollinations powers AI image generation using your Pollen.
            </p>
            <div className="mt-5 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-text-muted">
              Production application origin: <Value>{DEPLOYED_ORIGIN}</Value>
            </div>
          </section>

          <ConnectorCard
            id="cloudinary"
            icon="bx-cloud"
            title="Cloudinary storage"
            summary="Route new canvas and document images to a personal Cloudinary product environment. Personal uploads do not consume the LixSketch per-workspace image allowance."
          >
            <h3 className="text-sm text-text-secondary">Connect as a user</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-text-muted">
              <li>Sign in to LixSketch and open <Link href="/profile?tab=integrations" className="text-accent hover:underline">Profile → Integrations</Link>.</li>
              <li>Select <strong className="text-text-secondary">Connect Cloudinary</strong>, choose a product environment, and approve the requested access.</li>
              <li>Enable personal uploads. Existing media stays where it is; only new uploads follow the selected route.</li>
            </ol>

            <h3 className="mt-6 text-sm text-text-secondary">Production OAuth configuration</h3>
            <dl className="mt-2 rounded-xl border border-white/[0.07] bg-black/10 px-4">
              <DetailRow label="Application URL" value={DEPLOYED_ORIGIN} />
              <DetailRow label="Redirect URI" value={`${DEPLOYED_ORIGIN}/api/integrations/cloudinary/callback`} />
              <DetailRow label="Post-logout URI" value={`${DEPLOYED_ORIGIN}/settings?tab=integrations`} />
              <DetailRow label="Scopes" value="openid offline_access asset_management upload" />
            </dl>
            <p className="mt-4 text-xs leading-5 text-text-dim">LixSketch requests OAuth access and refreshes it server-side. It never requests the product environment API secret.</p>
          </ConnectorCard>

          <ConnectorCard
            id="pollinations"
            icon="bx-palette"
            title="Pollinations image generation"
            summary="Generate images with Flux or Klein from the canvas image tool. This is included in Free and Pro, but every request consumes the connected account’s personal Pollen balance."
          >
            <h3 className="text-sm text-text-secondary">Connect as a user</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-text-muted">
              <li>Sign in and open <Link href="/profile?tab=integrations" className="text-accent hover:underline">Profile → Integrations</Link>.</li>
              <li>Select <strong className="text-text-secondary">Connect Pollinations</strong>, review the Pollen budget and expiry, then approve.</li>
              <li>In a workspace, choose the Image tool → <strong className="text-text-secondary">Generate with AI</strong>.</li>
              <li>Generated images behave like normal images and retain a small AI provenance badge.</li>
            </ol>

            <h3 className="mt-6 text-sm text-text-secondary">Production OAuth configuration</h3>
            <dl className="mt-2 rounded-xl border border-white/[0.07] bg-black/10 px-4">
              <DetailRow label="Application URL" value={DEPLOYED_ORIGIN} />
              <DetailRow label="Connect URL" value={`${DEPLOYED_ORIGIN}/api/integrations/pollinations/connect`} />
              <DetailRow label="Redirect URI" value={`${DEPLOYED_ORIGIN}/api/integrations/pollinations/callback`} />
              <DetailRow label="Scopes" value="profile usage" />
              <DetailRow label="Authorized models" value="flux,klein" />
              <DetailRow label="Authorization" value="OAuth authorization code + PKCE · 30-day expiry" />
            </dl>
            <p className="mt-4 text-xs leading-5 text-text-dim">The publishable Pollinations App Key identifies LixSketch. The issued user key is encrypted server-side and is never sent to the browser.</p>
          </ConnectorCard>

          <section id="security" className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-surface-card p-5 sm:p-7">
            <h2 className="text-xl text-text-primary">Security and data boundaries</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-muted">
              <li className="flex gap-2"><i className="bx bx-check-shield mt-1 text-accent" />OAuth callbacks are bound to the signed-in LixSketch user and protected with short-lived state.</li>
              <li className="flex gap-2"><i className="bx bx-check-shield mt-1 text-accent" />Pollinations additionally uses PKCE. Provider access tokens are encrypted at rest with per-user authenticated encryption.</li>
              <li className="flex gap-2"><i className="bx bx-check-shield mt-1 text-accent" />Disconnecting removes the encrypted connection from LixSketch. Provider-hosted media is not deleted automatically.</li>
              <li className="flex gap-2"><i className="bx bx-check-shield mt-1 text-accent" />Cloudinary receives uploaded media; Pollinations receives image prompts and generation parameters. Canvas documents are not sent to either connector automatically.</li>
            </ul>
          </section>

          <section id="troubleshooting" className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-surface-card p-5 sm:p-7">
            <h2 className="text-xl text-text-primary">Troubleshooting</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-text-muted">
              <div><h3 className="text-text-secondary">The provider returns a redirect mismatch</h3><p className="mt-1">Copy the production redirect URI above exactly, including HTTPS and the full callback path. Do not register the localhost callback for the deployed application.</p></div>
              <div><h3 className="text-text-secondary">LixSketch asks me to reconnect</h3><p className="mt-1">The grant may have expired or been revoked. Reconnect from Profile → Integrations and approve the required scopes again.</p></div>
              <div><h3 className="text-text-secondary">AI image generation is unavailable</h3><p className="mt-1">Confirm Pollinations is connected, personal Pollen is enabled, the authorization has not expired, and the account has sufficient Pollen.</p></div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-5 text-sm">
            <Link href="/docs" className="text-text-muted hover:text-text-primary"><i className="bx bx-left-arrow-alt mr-1" />Back to Docs</Link>
            <Link href="/profile?tab=integrations" className="text-accent hover:underline">Manage connectors</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
