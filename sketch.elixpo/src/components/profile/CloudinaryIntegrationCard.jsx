'use client'

import { useEffect, useMemo, useState } from 'react'

function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`
}

function formatConnectionDate(value) {
  if (!value) return 'Not connected'
  const date = new Date(Number(value) * 1000)
  return Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const DISCONNECTED_STATUS = {
  connected: false,
  useForUploads: false,
  cloudName: null,
  scope: '',
  mediaCount: 0,
  trackedBytes: 0,
  connectedAt: null,
}

function MeterTrack({ percentage, label }) {
  return (
    <div
      className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]"
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(percentage)}
    >
      <div className="h-full rounded-full bg-[#9E91EE] transition-all duration-500" style={{ width: `${percentage}%` }} />
    </div>
  )
}

function ManagedStorageMeter({ usage, active }) {
  const usedBytes = Math.max(0, Number(usage?.usedBytes) || 0)
  const limitBytes = Math.max(0, Number(usage?.limitBytes) || 0)
  const remainingBytes = Math.max(0, limitBytes - usedBytes)
  const percentage = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0

  return (
    <div className={`rounded-xl border p-3 ${active ? 'border-[#8B88E8]/45 bg-[#8B88E8]/10' : 'border-white/[0.07] bg-black/10'}`}>
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className="uppercase tracking-wider text-text-dim">LixSketch managed</span>
        {active && <span className="rounded-full bg-[#8B88E8]/20 px-2 py-0.5 text-[#C4B8F8]">Active</span>}
      </div>
      <MeterTrack percentage={percentage} label="LixSketch managed storage usage" />
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-text-dim">
        <span>{formatBytes(usedBytes)} used of {formatBytes(limitBytes)}</span>
        <span className="font-mono text-text-secondary">{formatBytes(remainingBytes)} left</span>
      </div>
    </div>
  )
}

function PersonalStorageMeter({ usage, active }) {
  if (!usage) return null
  const percentage = Math.max(0, Math.min(100, Number(usage.usedPercent) || 0))
  const usesCredits = usage.mode === 'credits'
  const hasQuota = usesCredits || usage.mode === 'storage'
  return (
    <div className={`rounded-xl border p-3 ${active ? 'border-[#8B88E8]/45 bg-[#8B88E8]/10' : 'border-white/[0.07] bg-black/10'}`}>
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className="uppercase tracking-wider text-text-dim">Personal Cloudinary</span>
        {active && <span className="rounded-full bg-[#8B88E8]/20 px-2 py-0.5 text-[#C4B8F8]">Active</span>}
      </div>

      {hasQuota && <MeterTrack percentage={percentage} label="Personal Cloudinary storage usage" />}
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-text-dim">
        <span>
          {usesCredits
            ? `${formatBytes(usage.usedBytes)} stored · ${usage.creditUsage.toFixed(2)} of ${usage.creditLimit.toFixed(2)} credits used`
            : usage.mode === 'storage'
              ? `${formatBytes(usage.usedBytes)} used of ${formatBytes(usage.limitBytes)}`
              : 'Storage allowance is managed by Cloudinary'}
        </span>
        <span className="font-mono text-text-secondary">
          {usesCredits
            ? `${usage.remainingCredits.toFixed(2)} credits left`
            : usage.mode === 'storage'
              ? `${formatBytes(usage.remainingBytes)} left`
              : usage.plan || 'Provider managed'}
        </span>
      </div>
      {usage.plan && usage.mode !== 'storage-used' && <p className="mt-1 text-[9px] text-text-dim">{usage.plan} plan</p>}
    </div>
  )
}

const RESULT_MESSAGES = {
  connected: { ok: true, text: 'Cloudinary connected. New media will use your product environment.' },
  disconnected: { ok: true, text: 'Cloudinary disconnected. Existing media remains in your Cloudinary account.' },
  denied: { ok: false, text: 'Cloudinary authorization was cancelled.' },
  invalid_state: { ok: false, text: 'The authorization session expired. Please try again.' },
  not_authenticated: { ok: false, text: 'Your LixSketch session could not be verified. Sign in again before connecting Cloudinary.' },
  failed_environment: { ok: false, text: 'Cloudinary did not identify the product environment selected during authorization. Reconnect and select it again.' },
  failed_validation: { ok: false, text: 'Cloudinary did not authorize access to the selected product environment. Confirm the account selection and requested permissions.' },
  config_error: { ok: false, text: 'Cloudinary OAuth is not configured on this deployment.' },
}

export default function CloudinaryIntegrationCard({ managedUsage }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [oauthResult, setOauthResult] = useState(null)
  const [oauthReference, setOauthReference] = useState(null)

  const oauthMessage = useMemo(() => {
    if (!oauthResult) return null
    if (RESULT_MESSAGES[oauthResult]) return RESULT_MESSAGES[oauthResult]
    return { ok: false, text: 'Cloudinary could not be connected.' }
  }, [oauthResult])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudinary?includeUsage=1', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load Cloudinary status')
      const data = await response.json()
      setStatus((current) => ({ ...current, ...data }))
      window.__personalCloudinary = data
    } catch {
      // Cloudinary is optional. A failed status probe must leave uploads on
      // managed storage without presenting the disconnected state as an error.
      setStatus(DISCONNECTED_STATUS)
      window.__personalCloudinary = DISCONNECTED_STATUS
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setOauthResult(params.get('cloudinary'))
    setOauthReference(params.get('cloudinary_ref'))
    load()
  }, [])

  useEffect(() => {
    if (!confirmDisconnect) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) {
        setConfirmDisconnect(false)
        setError('')
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, confirmDisconnect])

  const toggleStorage = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudinary', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useForUploads: !status.useForUploads }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update storage preference')
      setStatus((current) => ({ ...current, ...data }))
      window.__personalCloudinary = data
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudinary', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not disconnect Cloudinary')
      window.__personalCloudinary = { connected: false, useForUploads: false }
      window.location.href = data.postLogoutRedirect || '/settings?tab=integrations'
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }

  return (
    <section id="integrations" className="rounded-2xl border border-[#8B88E8]/25 bg-[#8B88E8]/[0.045] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8B88E8]/15 text-[#A99CF1]">
            <i className="bx bx-cloud text-2xl" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-text-primary">Personal Cloudinary storage</h2>
              {status && (
                <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${status.connected ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-text-dim'}`}>
                  {status.connected ? 'Connected' : 'Not connected'}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-text-dim">
              Store new canvas and document images in your own Cloudinary product environment. Personal storage does not consume LixSketch’s per-workspace image allowance.
            </p>
            <a href="/docs/connectors#cloudinary" className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#A99CF1] hover:text-white">Connector docs <i className="bx bx-right-arrow-alt" /></a>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[9px] uppercase tracking-wider text-text-dim">Provider</p>
          <p className="mt-1 text-xs text-text-secondary">{status?.connected ? 'Cloudinary' : 'Not connected'}</p>
          <p className="mt-1 text-[9px] text-text-dim">{status?.connected ? status.cloudName : 'Connect a product environment'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[9px] uppercase tracking-wider text-text-dim">Authorization</p>
          <p className="mt-1 text-xs text-text-secondary">{status?.connected ? 'OAuth 2.0 active' : 'Authorization required'}</p>
          <p className="mt-1 text-[9px] text-text-dim">{status?.connected ? 'Encrypted refresh-token storage' : 'No Cloudinary access granted'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[9px] uppercase tracking-wider text-text-dim">Upload route</p>
          <p className="mt-1 text-xs text-text-secondary">{status?.useForUploads ? 'Personal storage' : 'LixSketch managed'}</p>
          <p className="mt-1 text-[9px] text-text-dim">Only new media follows this route</p>
        </div>
      </div>

      {oauthMessage && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${oauthMessage.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {oauthMessage.text}{oauthReference && !oauthMessage.ok ? ` Reference: ${oauthReference}` : ''}
        </p>
      )}

      {!loading && (
        <div className={`mt-4 grid gap-2 ${status?.connected && status.providerUsage ? 'sm:grid-cols-2' : ''}`}>
          <ManagedStorageMeter usage={managedUsage} active={!status?.connected || !status.useForUploads} />
          {status?.connected && status.providerUsage && (
            <PersonalStorageMeter usage={status.providerUsage} active={status.useForUploads} />
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-white/[0.035]" />
      ) : !status?.connected ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-text-secondary">Authorize upload and asset management access</p>
            <p className="mt-1 text-[10px] text-text-dim">Choose your product environment on Cloudinary. OAuth authorizes access and offline access lets the server refresh encrypted tokens. Your API secret is never requested.</p>
          </div>
          <a href="/api/integrations/cloudinary/connect" className="shrink-0 cursor-pointer rounded-lg bg-[#8B88E8] px-4 py-2 text-center text-xs text-white transition-colors hover:bg-[#9E91EE]">
            {oauthResult === 'failed_environment' ? 'Reconnect Cloudinary' : 'Connect Cloudinary'}
          </a>
        </div>
      ) : (
        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-dim">Product environment</p>
              <p className="mt-1 text-sm text-text-primary">{status.cloudName}</p>
              <p className="mt-1 text-[10px] text-text-dim">{formatBytes(status.trackedBytes)} across {status.mediaCount} tracked {status.mediaCount === 1 ? 'asset' : 'assets'}</p>
              <p className="mt-1 text-[10px] text-text-dim">Connected {formatConnectionDate(status.connectedAt)} · {status.scope || 'OAuth scopes active'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={toggleStorage} className="cursor-pointer rounded-lg border border-[#8B88E8]/30 px-3 py-2 text-xs text-[#A99CF1] hover:bg-[#8B88E8]/10 disabled:opacity-50">
                {status.useForUploads ? 'Use LixSketch storage' : 'Use personal storage'}
              </button>
              <button type="button" disabled={busy} onClick={() => { setError(''); setConfirmDisconnect(true) }} className="cursor-pointer rounded-lg border border-red-500/25 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                Disconnect
              </button>
            </div>
          </div>
          {status.providerUsageUnavailable && (
            <p className="mt-3 text-[10px] text-amber-300/80">
              Cloudinary usage details are available in its dashboard. LixSketch has tracked {formatBytes(status.trackedBytes)} of uploaded media.
            </p>
          )}
          <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${status.useForUploads ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.035] text-text-dim'}`}>
            New media will use {status.useForUploads ? status.cloudName : 'LixSketch managed storage'}. Existing images stay where they were uploaded.
          </p>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      {confirmDisconnect && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setConfirmDisconnect(false)
              setError('')
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-400/25 bg-[#1B1426] p-5 shadow-2xl shadow-black/50"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cloudinary-disconnect-title"
            aria-describedby="cloudinary-disconnect-description"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <i className="bx bx-unlink text-xl" />
              </div>
              <div>
                <h3 id="cloudinary-disconnect-title" className="text-base font-medium text-text-primary">Disconnect personal Cloudinary?</h3>
                <p id="cloudinary-disconnect-description" className="mt-2 text-xs leading-5 text-text-dim">
                  New uploads will switch to LixSketch-managed storage. Existing media will remain in your Cloudinary account and will not be deleted.
                </p>
              </div>
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                disabled={busy}
                autoFocus
                onClick={() => { setConfirmDisconnect(false); setError('') }}
                className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-xs text-text-secondary hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={disconnect}
                className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-xs text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Disconnecting…' : 'Disconnect Cloudinary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
