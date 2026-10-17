'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import { showToast } from '@/utils/toast'
import { MCP_CONNECTION_TEST_PROMPT, codexConfigFromMcpJson, createCodexTomlConfig, createMcpJsonConfig } from '@/lib/mcpClientConfig'

function authenticatedHeaders(sessionToken, headers = {}) {
  return sessionToken ? { ...headers, Authorization: `Bearer ${sessionToken}` } : headers
}

function configStorageKey(sessionId) {
  return `lixsketch-mcp-configs-${sessionId}`
}

function readSavedConfigs(sessionId) {
  if (typeof window === 'undefined' || !sessionId) return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(configStorageKey(sessionId)) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSavedConfigs(sessionId, configs) {
  if (!sessionId) return
  try {
    if (Object.keys(configs).length) localStorage.setItem(configStorageKey(sessionId), JSON.stringify(configs))
    else localStorage.removeItem(configStorageKey(sessionId))
  } catch {}
}

function RevokeAccessDialog({ grant, busy, onCancel, onConfirm }) {
  if (!grant) return null
  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="revoke-mcp-title" className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#171120] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300"><i className="bx bx-unlink text-xl" /></span>
          <div><h3 id="revoke-mcp-title" className="text-base text-text-primary">Revoke MCP access?</h3><p className="mt-1 text-xs leading-5 text-text-muted"><strong className="font-normal text-text-secondary">{grant.label}</strong> will immediately lose access to this workspace.</p></div>
        </div>
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-[11px] leading-5 text-red-300">Any saved configuration using this token will stop working. Canvas content and media will not be deleted.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">{busy && <i className="bx bx-loader-alt animate-spin" />}Revoke access</button>
        </div>
      </div>
    </div>
  )
}

export default function McpWorkspaceAccessModal({ workspace, onClose, onGrantCountChange }) {
  const [grants, setGrants] = useState([])
  const [savedConfigs, setSavedConfigs] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visibleGrantId, setVisibleGrantId] = useState(null)
  const [copiedGrantId, setCopiedGrantId] = useState(null)
  const [testPromptCopied, setTestPromptCopied] = useState(false)
  const [configFormat, setConfigFormat] = useState('json')
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [label, setLabel] = useState('Local MCP')
  const [writeAccess, setWriteAccess] = useState(true)
  const [expiresInDays, setExpiresInDays] = useState(30)
  const sessionToken = useAuthStore((state) => state.sessionToken)
  const sessionId = workspace?.session_id
  const encryptionKey = useMemo(() => {
    if (typeof window === 'undefined' || !sessionId) return ''
    return localStorage.getItem(`lixsketch-enc-key-${sessionId}`) || ''
  }, [sessionId])

  const notifyGrantCount = useCallback((count) => {
    onGrantCountChange?.(sessionId, count)
    window.dispatchEvent(new CustomEvent('lixsketch:mcp-grants-changed', {
      detail: { sessionId, count },
    }))
  }, [onGrantCountChange, sessionId])

  useEffect(() => {
    setSavedConfigs(readSavedConfigs(sessionId))
    setVisibleGrantId(null)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/mcp/grants?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: authenticatedHeaders(sessionToken),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load agent access')
        const activeGrants = body.grants || []
        setGrants(activeGrants)
        notifyGrantCount(activeGrants.length)
        setSavedConfigs((current) => {
          const activeIds = new Set(activeGrants.map((grant) => grant.id))
          const next = Object.fromEntries(Object.entries(current).filter(([grantId]) => activeIds.has(grantId)))
          writeSavedConfigs(sessionId, next)
          return next
        })
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [notifyGrantCount, sessionId, sessionToken])

  useEffect(() => {
    const close = (event) => {
      if (event.key !== 'Escape' || busy) return
      if (revokeTarget) setRevokeTarget(null)
      else onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy, onClose, revokeTarget])

  const createGrant = async () => {
    const normalizedLabel = label.trim()
    if (!normalizedLabel) {
      setError('Give this client a name before creating access.')
      return
    }
    if (!encryptionKey) {
      setError('Open this workspace on this device once before enabling remote access. Its E2E key is not available here.')
      return
    }
    setBusy(true)
    setError('')
    setCopiedGrantId(null)
    try {
      const scopes = ['canvas:read', ...(writeAccess ? ['canvas:write'] : [])]
      const response = await fetch('/api/mcp/grants', {
        method: 'POST',
        headers: authenticatedHeaders(sessionToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, label: normalizedLabel, scopes, expiresInDays }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not create agent access')
      const configOptions = { origin: window.location.origin, sessionId, token: body.token, encryptionKey }
      const jsonConfig = createMcpJsonConfig(configOptions)
      const codexConfig = createCodexTomlConfig(configOptions)
      const nextConfigs = { ...savedConfigs, [body.grant.id]: { config: jsonConfig, jsonConfig, codexConfig, savedAt: new Date().toISOString() } }
      writeSavedConfigs(sessionId, nextConfigs)
      setSavedConfigs(nextConfigs)
      setVisibleGrantId(body.grant.id)
      setGrants((current) => [body.grant, ...current])
      notifyGrantCount(grants.length + 1)
      showToast('Remote MCP access created', { tone: 'success', duration: 2200 })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!revokeTarget) return
    const grantId = revokeTarget.id
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/mcp/grants', {
        method: 'DELETE',
        headers: authenticatedHeaders(sessionToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ grantId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not revoke access')
      const nextConfigs = { ...savedConfigs }
      delete nextConfigs[grantId]
      writeSavedConfigs(sessionId, nextConfigs)
      setSavedConfigs(nextConfigs)
      setGrants((current) => current.filter((grant) => grant.id !== grantId))
      notifyGrantCount(Math.max(0, grants.length - 1))
      if (visibleGrantId === grantId) setVisibleGrantId(null)
      setRevokeTarget(null)
      showToast('Remote MCP access revoked', { tone: 'success', duration: 2200 })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const configFor = (grantId, format = configFormat) => {
    const saved = savedConfigs[grantId]
    if (!saved) return null
    if (format === 'json') return saved.jsonConfig || saved.config || null
    if (saved.codexConfig) return saved.codexConfig
    try {
      return codexConfigFromMcpJson(saved.jsonConfig || saved.config)
    } catch {
      return null
    }
  }

  const copy = async (grantId) => {
    const config = configFor(grantId)
    if (!config) return
    try {
      await navigator.clipboard.writeText(config)
      setCopiedGrantId(grantId)
      showToast(configFormat === 'codex' ? 'Codex configuration copied' : 'MCP JSON copied', { tone: 'success', duration: 2000 })
      setTimeout(() => setCopiedGrantId((current) => current === grantId ? null : current), 2200)
    } catch {
      setError('Could not copy the configuration. Select the text and copy it manually.')
    }
  }

  const copyTestPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MCP_CONNECTION_TEST_PROMPT)
      setTestPromptCopied(true)
      showToast('Workspace test prompt copied', { tone: 'success', duration: 2000 })
      setTimeout(() => setTestPromptCopied(false), 2200)
    } catch {
      setError('Could not copy the test prompt. Open the MCP guide to copy it manually.')
    }
  }

  if (!workspace) return null
  const visibleConfig = visibleGrantId ? configFor(visibleGrantId) : null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mcp-access-title" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[#8B88E8]/30 bg-[#171120] p-5 shadow-2xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.18em] text-[#A99CF1]">Workspace access</p><div className="mt-1 flex items-center gap-2"><h2 id="mcp-access-title" className="text-xl text-text-primary">Remote MCP</h2><span className="inline-flex items-center gap-1 rounded-full border border-[#54D6A0]/20 bg-[#54D6A0]/10 px-2 py-0.5 text-[9px] text-[#70DFB3]" title={`${grants.length} active MCP session${grants.length === 1 ? '' : 's'}`}><i className="bx bx-plug text-[10px]" aria-hidden="true" />{loading ? '…' : grants.length} active</span></div><p className="mt-1 text-xs text-text-dim">{workspace.workspace_name || 'Untitled'} · {sessionId}</p></div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            <a href="/docs/mcp#test" target="_blank" rel="noreferrer" className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-[10px] text-text-muted hover:bg-white/5 hover:text-text-primary"><i className="bx bx-book-open mr-1" />Guide</a>
            <button type="button" onClick={copyTestPrompt} className="cursor-pointer rounded-lg bg-[#8B88E8] px-3 py-2 text-[10px] text-white hover:bg-[#9E91EE]"><i className={`bx ${testPromptCopied ? 'bx-check' : 'bx-copy'} mr-1`} />{testPromptCopied ? 'Copied' : 'Copy test prompt'}</button>
            <button type="button" onClick={onClose} disabled={busy} className="ml-auto cursor-pointer rounded-lg p-2 text-text-dim hover:bg-white/5 hover:text-text-primary" aria-label="Close Remote MCP"><i className="bx bx-x text-xl" /></button>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#8B88E8]/20 bg-[#8B88E8]/5 p-3.5 text-xs leading-5 text-text-muted"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8B88E8]/10 text-[#B6ACF4]"><i className="bx bx-shield-quarter text-lg" /></span><div><p className="text-text-secondary">Private, workspace-scoped access</p><p className="mt-0.5 text-[10px] leading-5 text-text-dim">Configurations stay in this browser. The server stores a token hash and never receives your workspace E2E key.</p></div></div>
        {!encryptionKey && <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-300">This browser does not have the workspace encryption key. Open the canvas once, then return here.</div>}
        {error && <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>}

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        <section className="flex h-full flex-col rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div><p className="text-sm text-text-primary">New client access</p><p className="mt-1 text-[10px] text-text-dim">Name the client, choose its scopes, and set an expiry.</p></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-[10px] text-text-dim">Client name <span className="text-red-300">*</span><input value={label} maxLength={48} onChange={(event) => setLabel(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-text-primary outline-none focus:border-[#8B88E8]/60" placeholder="Desktop agent" /></label>
            <label className="text-[10px] text-text-dim">Expires <span className="text-red-300">*</span><select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} className="mt-1 block w-full cursor-pointer rounded-lg border border-white/10 bg-[#171120] px-3 py-2 text-xs text-text-primary outline-none focus:border-[#8B88E8]/60"><option value={7}>7 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select></label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-not-allowed items-start gap-2 rounded-lg border border-[#8B88E8]/20 bg-[#8B88E8]/5 p-2.5"><input type="checkbox" checked disabled className="mt-0.5 accent-[#8B88E8]" /><span><span className="block text-xs text-text-secondary">Read canvas</span><span className="text-[9px] text-text-dim">Required to inspect revisions and shapes</span></span></label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#8B88E8]/20 bg-[#8B88E8]/5 p-2.5"><input type="checkbox" checked={writeAccess} onChange={(event) => setWriteAccess(event.target.checked)} className="mt-0.5 accent-[#8B88E8]" /><span><span className="block text-xs text-text-secondary">Edit canvas</span><span className="text-[9px] text-text-dim">Apply patches and LixScript</span></span></label>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3 pt-4"><p className="max-w-52 text-[9px] leading-4 text-text-dim">You can revoke a client instantly without deleting canvas content.</p><button type="button" onClick={createGrant} disabled={busy || !encryptionKey || !label.trim()} className="shrink-0 cursor-pointer rounded-lg bg-[#8B88E8] px-3 py-2 text-xs text-white hover:bg-[#9E91EE] disabled:cursor-not-allowed disabled:opacity-40"><i className="bx bx-plus mr-1" />Create access</button></div>
        </section>

        <div className={`flex h-72 max-h-72 min-w-0 flex-col overflow-hidden rounded-xl border p-4 ${visibleConfig ? 'border-[#54D6A0]/25 bg-[#54D6A0]/[0.045]' : 'border-[#8B88E8]/20 bg-[#8B88E8]/5'}`}>
          {visibleConfig ? <>
            <div><p className="text-sm text-[#70DFB3]">Configuration ready</p><p className="mt-1 text-[10px] text-text-dim">Choose a client format and copy the complete block.</p></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-lg border border-white/10 bg-black/15 p-0.5">
                  <button type="button" onClick={() => { setConfigFormat('json'); setCopiedGrantId(null) }} className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] ${configFormat === 'json' ? 'bg-[#8B88E8]/25 text-[#d8c9f5]' : 'text-text-dim hover:text-text-secondary'}`}>MCP JSON</button>
                  <button type="button" onClick={() => { setConfigFormat('codex'); setCopiedGrantId(null) }} className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] ${configFormat === 'codex' ? 'bg-[#8B88E8]/25 text-[#d8c9f5]' : 'text-text-dim hover:text-text-secondary'}`}>Codex TOML</button>
                </div>
                <button type="button" onClick={() => copy(visibleGrantId)} className="cursor-pointer rounded-lg bg-[#8B88E8] px-3 py-2 text-xs text-white hover:bg-[#9E91EE]"><i className={`bx ${copiedGrantId === visibleGrantId ? 'bx-check' : 'bx-copy'} mr-1`} />{copiedGrantId === visibleGrantId ? 'Copied' : 'Copy config'}</button>
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[9px] leading-4 text-text-muted">
              {configFormat === 'codex' ? <>Paste this entire block—including both <code className="font-[lixCode] text-[#d8c9f5]">[mcp_servers.lixsketch]</code> headings—into <code className="font-[lixCode] text-[#d8c9f5]">~/.codex/config.toml</code>.</> : <>Paste this complete JSON object into a client that accepts <code className="font-[lixCode] text-[#d8c9f5]">mcpServers</code> configuration.</>}
            </div>
            <pre className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] leading-5 text-[#d8c9f5]"><code>{visibleConfig}</code></pre>
          </> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center"><i className="bx bx-code-block text-3xl text-[#A99CF1]" /><p className="mt-3 text-sm text-text-secondary">Your copy-ready configuration appears here</p><p className="mt-2 max-w-sm text-[10px] leading-5 text-text-dim">Create access or open a saved configuration. Choose MCP JSON for Cursor and similar clients, or Codex TOML for direct use in Codex.</p></div>}
        </div>
        </div>

        <section className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-3"><div><p className="text-sm text-text-primary">Authorized clients</p><p className="mt-0.5 text-[10px] text-text-dim">Only currently active grants are shown.</p></div><span className="rounded-full border border-white/[0.07] bg-black/15 px-2.5 py-1 text-[9px] text-text-dim">{grants.length} active</span></div>
        <div className="mt-3 flex w-full flex-col gap-2">
          {loading ? <p className="py-5 text-center text-xs text-text-dim">Loading access…</p> : grants.length === 0 ? <p className="py-5 text-center text-xs text-text-dim">No clients are authorized for this workspace.</p> : grants.map((grant) => {
            const hasConfig = Boolean(savedConfigs[grant.id]?.config)
            return <div key={grant.id} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-text-secondary">{grant.label}</p><p className="mt-1 text-[9px] text-text-dim">{grant.scopes?.join(' + ') || grant.permission} · expires {new Date(grant.expiresAt).toLocaleDateString()} {grant.lastUsedAt ? `· used ${new Date(grant.lastUsedAt).toLocaleDateString()}` : ''}</p></div><div className="flex items-center gap-1.5">{hasConfig ? <button type="button" onClick={() => setVisibleGrantId((current) => current === grant.id ? null : grant.id)} className="cursor-pointer rounded-lg border border-[#8B88E8]/30 px-2.5 py-1.5 text-[10px] text-[#B6ACF4] hover:bg-[#8B88E8]/10"><i className="bx bx-code-alt mr-1" />{visibleGrantId === grant.id ? 'Hide config' : 'Show config'}</button> : <span className="px-1 text-[9px] text-text-dim" title="This grant was created before configs were saved on this browser">Config not saved</span>}<button type="button" onClick={() => setRevokeTarget(grant)} disabled={busy} className="cursor-pointer rounded-lg border border-red-500/25 px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10">Revoke</button></div></div>
          })}
        </div>
        </section>
      </div>
      <RevokeAccessDialog grant={revokeTarget} busy={busy} onCancel={() => setRevokeTarget(null)} onConfirm={revoke} />
    </div>
  )
}
