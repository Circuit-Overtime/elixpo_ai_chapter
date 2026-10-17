"use client"

import { useState, useEffect, useCallback } from 'react'
import useUIStore, { MAX_WORKSPACE_NAME_LENGTH } from '@/store/useUIStore'
import useCollabStore from '@/store/useCollabStore'
import { getSessionID } from '@/hooks/useSessionID'
import { generateKey, encrypt } from '@/utils/encryption'
import { WORKER_URL } from '@/lib/env'
import usePlanEntitlements from '@/hooks/usePlanEntitlements'
import useAuthStore from '@/store/useAuthStore'
import useSketchStore from '@/store/useSketchStore'
import { triggerCloudSync } from '@/hooks/useAutoSave'
import {
  canvasToLosslessPNG,
  createExportSVG,
  downloadBlob,
  getExportBackground,
  renderExportCanvas,
} from '@/utils/canvasExport'

async function validatePublicSceneMedia(sceneData) {
  const sources = [...new Set((sceneData?.shapes || [])
    .filter((shape) => shape?.type === 'image')
    .map((shape) => String(shape.href || ''))
    .filter(Boolean))]
  const invalid = sources.filter((source) => source.startsWith('blob:') || (!source.startsWith('data:image/') && !/^https?:\/\//i.test(source)))
  if (invalid.length) throw new Error('Replace local or unsupported images before publishing')
  const remote = sources.filter((source) => /^https?:\/\//i.test(source))
  const results = await Promise.all(remote.map((source) => new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => { image.src = ''; resolve(false) }, 5000)
    image.onload = () => { clearTimeout(timer); resolve(true) }
    image.onerror = () => { clearTimeout(timer); resolve(false) }
    image.src = source
  })))
  if (results.some((available) => !available)) {
    throw new Error('One or more workspace images are private or unavailable. Make them public or remove them before publishing.')
  }
}

async function validatePublicDocumentMedia(blocks) {
  const sceneLike = {
    shapes: (blocks || []).filter((block) => block?.type === 'image' && block?.props?.url)
      .map((block) => ({ type: 'image', href: block.props.url })),
  }
  return validatePublicSceneMedia(sceneLike)
}

const MODAL_TABS = [
  { id: 'save', label: 'Save', icon: 'bx-cloud-upload', description: 'Rename and securely sync the current workspace.' },
  { id: 'export', label: 'Export', icon: 'bx-export', description: 'Download a lossless image, vector, PDF, or scene file.' },
  { id: 'share', label: 'Share', icon: 'bx-share-alt', description: 'Collaborate live or create an encrypted view-only link.' },
  { id: 'publish', label: 'Publish', icon: 'bx-world', description: 'Publish a public template that others can fork or clone.' },
]

// ── Component ────────────────────────────────────────────────

export default function SaveModal() {
  const { tier, limits } = usePlanEntitlements()
  const saveModalOpen = useUIStore((s) => s.saveModalOpen)
  const toggleSaveModal = useUIStore((s) => s.toggleSaveModal)
  const workspaceName = useUIStore((s) => s.workspaceName)
  const setWorkspaceName = useUIStore((s) => s.setWorkspaceName)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const canvasBackground = useSketchStore((s) => s.canvasBackground)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const login = useAuthStore((s) => s.login)
  const saveStatus = useUIStore((s) => s.saveStatus)
  const templateSlug = useUIStore((s) => s.templateSlug)
  const [activeTab, setActiveTab] = useState('save')
  const [savingNow, setSavingNow] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // Live collab state
  const [collabLink, setCollabLink] = useState('')
  const [collabCopied, setCollabCopied] = useState(false)
  const [startingCollab, setStartingCollab] = useState(false)
  const [collabError, setCollabError] = useState('')
  const collabConnected = useCollabStore((s) => s.connected)
  const collabRuntimeError = useCollabStore((s) => s.error)
  const collabRoomId = useCollabStore((s) => s.roomId)
  const collabInviteToken = useCollabStore((s) => s.inviteToken)
  const collabSharingEnabled = useCollabStore((s) => s.sharingEnabled)
  const collabIsAdmin = useCollabStore((s) => s.isAdmin)
  const collabWs = useCollabStore((s) => s.ws)

  useEffect(() => {
    if (!collabRoomId || !collabInviteToken) return
    const key = useUIStore.getState().sessionEncryptionKey
      || useUIStore.getState().loadEncryptionKeyForSession(collabRoomId)
    if (!key) return
    setCollabLink(`${window.location.origin}/room/${encodeURIComponent(collabRoomId)}?invite=${encodeURIComponent(collabInviteToken)}#key=${encodeURIComponent(key)}`)
    setCollabCopied(false)
  }, [collabRoomId, collabInviteToken])

  // Issue #24 bug #9: one-time view-only share link. Creates a separate
  // read-only snapshot of the current scene that anyone with the link can
  // view, distinct from the editable session above.
  const [shareLink, setShareLink] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [creatingShare, setCreatingShare] = useState(false)
  const [shareError, setShareError] = useState('')

  // Public template publishing uses its own public snapshot key. It never
  // reuses the key for the editable workspace.
  const [publishTitle, setPublishTitle] = useState(workspaceName || '')
  const [publishDescription, setPublishDescription] = useState('')
  const [publishTags, setPublishTags] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [publishedUrl, setPublishedUrl] = useState('')
  const [publishedSlug, setPublishedSlug] = useState('')

  useEffect(() => {
    if (templateSlug) {
      setPublishedSlug(templateSlug)
      setPublishedUrl(`${window.location.origin}/templates/${templateSlug}`)
    }
  }, [templateSlug])

  // Export state
  const [bgMode, setBgMode] = useState(resolvedTheme)
  const [exportScale, setExportScale] = useState(4)
  const [previewUrl, setPreviewUrl] = useState(null)

  const getBgColor = useCallback(() => {
    return getExportBackground(bgMode, resolvedTheme, canvasBackground)
  }, [bgMode, canvasBackground, resolvedTheme])

  useEffect(() => {
    if (saveModalOpen) setBgMode(resolvedTheme)
  }, [saveModalOpen, resolvedTheme])

  // Generate preview when modal opens or bg changes
  useEffect(() => {
    if (!saveModalOpen) return
    let cancelled = false
    const generate = async () => {
      const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
      if (!clone) return
      const canvas = await renderExportCanvas(clone, 1)
      if (cancelled || !canvas) return
      setPreviewUrl(canvas.toDataURL('image/webp', 0.78))
    }
    generate()
    return () => { cancelled = true }
  }, [saveModalOpen, bgMode, resolvedTheme, canvasBackground])

  useEffect(() => {
    if (saveModalOpen && !publishTitle) setPublishTitle(workspaceName || '')
  }, [saveModalOpen, publishTitle, workspaceName])

  if (!saveModalOpen) return null

  // ── Collab handlers ──

  const handleStartCollab = async () => {
    setStartingCollab(true)
    setCollabError('')

    try {
      const sessionId = getSessionID()

      let key = useUIStore.getState().sessionEncryptionKey
      if (!key) {
        key = useUIStore.getState().loadEncryptionKeyForSession(sessionId)
      }
      if (!key) {
        key = await generateKey()
      }
      useUIStore.getState().setSessionEncryptionKey(key, sessionId)
      const roomId = sessionId
      useCollabStore.getState().startRoom(roomId)
      setCollabLink('')
      setCollabCopied(false)
    } catch (err) {
      console.error('[SaveModal] Failed to start collab:', err)
      setCollabError(err.message || 'Failed to start collaboration')
    } finally {
      setStartingCollab(false)
    }
  }

  // Snapshot the current scene, encrypt with a fresh key, save with
  // permission='view' on the worker, and build a /s/<token>#key=<k> URL.
  const handleCreateShareLink = async () => {
    if (creatingShare) return
    setCreatingShare(true)
    setShareError('')
    try {
      const serializer = window.__sceneSerializer
      if (!serializer || typeof serializer.save !== 'function') {
        throw new Error('Scene serializer not ready')
      }
      const sceneData = serializer.save(workspaceName || 'Untitled')
      const sceneJSON = JSON.stringify(sceneData)

      // Independent key for the share snapshot — don't reuse the editable
      // session's key so revoking the share later doesn't break the
      // user's own session.
      const shareKey = await generateKey()
      const encryptedData = await encrypt(sceneJSON, shareKey)

      // Independent sessionId so the worker treats this as a new scene
      // (not an update to the user's editable record).
      const snapSessionId = `snap-${crypto.randomUUID().slice(0, 16)}`

      const res = await fetch(`${WORKER_URL}/api/scenes/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: snapSessionId,
          encryptedData,
          permission: 'view',
          workspaceName: workspaceName || 'Untitled',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server returned ${res.status}`)
      }
      const { token } = await res.json()
      if (!token) throw new Error('Server did not return a share token')
      setShareLink(`${window.location.origin}/s/${token}#key=${shareKey}`)
      setShareCopied(false)
    } catch (err) {
      console.error('[SaveModal] Failed to create share link:', err)
      setShareError(err.message || 'Failed to create share link')
    } finally {
      setCreatingShare(false)
    }
  }

  const handleCopyShareLink = () => {
    if (!shareLink) return
    navigator.clipboard.writeText(shareLink).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    }).catch(() => {})
  }

  const handlePublishTemplate = async (updateExisting = false) => {
    if (!isAuthenticated) {
      login(`${window.location.pathname}${window.location.search}`)
      return
    }
    if (publishing) return
    setPublishing(true)
    setPublishError('')
    try {
      const serializer = window.__sceneSerializer
      const sessionId = getSessionID()
      if (!serializer || typeof serializer.save !== 'function' || !sessionId) {
        throw new Error('The workspace is not ready to publish yet')
      }
      if (!publishTitle.trim()) throw new Error('Add a public template title')
      const publicKey = await generateKey()
      const sceneData = serializer.save(workspaceName || 'Untitled')
      await validatePublicSceneMedia(sceneData)
      const encryptedData = await encrypt(JSON.stringify(sceneData), publicKey)
      let encryptedDocData = null
      try {
        const savedDoc = localStorage.getItem(`lixsketch-doc-autosave-${sessionId}`)
        const blocks = savedDoc ? JSON.parse(savedDoc)?.blocks : null
        if (Array.isArray(blocks) && blocks.length) {
          await validatePublicDocumentMedia(blocks)
          encryptedDocData = await encrypt(JSON.stringify(blocks), publicKey)
        }
      } catch {}
      const coverDataUrl = previewUrl && new Blob([previewUrl]).size <= 200_000 ? previewUrl : null
      const response = await fetch(updateExisting && publishedSlug ? `/api/templates/${encodeURIComponent(publishedSlug)}` : '/api/templates', {
        method: updateExisting && publishedSlug ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceSessionId: sessionId,
          title: publishTitle,
          description: publishDescription,
          tags: publishTags.split(','),
          coverDataUrl,
          encryptedData,
          publicKey,
          encryptedDocData,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not publish workspace')
      if (body.url) {
        setPublishedSlug(body.slug)
        setPublishedUrl(`${window.location.origin}${body.url}`)
      }
    } catch (reason) {
      setPublishError(reason.message || 'Could not publish workspace')
    } finally {
      setPublishing(false)
    }
  }

  const handleCopyCollabLink = () => {
    if (!collabLink) return
    navigator.clipboard.writeText(collabLink).then(() => {
      setCollabCopied(true)
      setTimeout(() => setCollabCopied(false), 2000)
    })
  }

  const handleEndSession = () => {
    if (collabIsAdmin && collabWs?.readyState === WebSocket.OPEN) {
      collabWs.send(JSON.stringify({ type: 'sharing-update', enabled: false }))
    }
    // Let the ordered WebSocket control frame leave the browser before the
    // owner closes their connection.
    setTimeout(() => {
      window.__disconnectCollaboration?.()
      useCollabStore.getState().stopRoom()
      setCollabLink('')
      setCollabCopied(false)
    }, collabIsAdmin ? 60 : 0)
  }

  const handleSaveNow = async () => {
    if (savingNow) return
    setSavingNow(true)
    setSaveMessage('')
    try {
      const saved = await triggerCloudSync()
      setSaveMessage(saved ? 'Workspace saved locally and synced to the cloud.' : 'Workspace saved locally. Cloud sync is unavailable or waiting for a workspace slot.')
    } catch {
      setSaveMessage('Workspace saved locally, but cloud sync could not complete.')
    } finally {
      setSavingNow(false)
    }
  }

  // ── Export handlers ──

  const fileName = (workspaceName || 'lixsketch-export').replace(/[^a-zA-Z0-9_-]/g, '_')

  const handleExportLixjson = () => {
    const serializer = window.__sceneSerializer
    if (!serializer) return
    serializer.download(workspaceName || 'Untitled')
    toggleSaveModal()
  }

  const handleExportPNG = async () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const canvas = await renderExportCanvas(clone, exportScale)
    const blob = await canvasToLosslessPNG(canvas)
    downloadBlob(blob, `${fileName}-${exportScale}x.png`)
    toggleSaveModal()
  }

  const handleExportSVG = () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const svgData = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(blob, `${fileName}.svg`)
    toggleSaveModal()
  }

  const handleExportPDF = () => {
    if (!limits.pdfExport) {
      const toast = document.getElementById('save-toast')
      if (toast) {
        toast.innerHTML = '<i class="bx bxs-lock-alt text-[#b99be9] mr-1.5"></i>PDF export is available on Pro'
        toast.classList.remove('hidden')
        setTimeout(() => toast.classList.add('hidden'), 3500)
      }
      return
    }
    const serializer = window.__sceneSerializer
    if (!serializer) return
    serializer.exportPDF()
    toggleSaveModal()
  }

  // ── Render ──

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center font-[lixFont]"
      onClick={toggleSaveModal}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-surface-card border border-border-light rounded-2xl w-[640px] max-w-[94vw] mx-4 max-h-[90vh] overflow-y-auto docs-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-text-primary text-base font-medium">Workspace actions</h2>
          <button
            onClick={toggleSaveModal}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-all duration-200"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>

        <div className="mx-6 mb-4 grid grid-cols-4 gap-1 rounded-xl border border-border-light bg-surface/70 p-1">
          {MODAL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition ${activeTab === tab.id ? 'bg-accent-blue/20 text-accent-blue shadow-sm' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'}`}
            >
              <i className={`bx ${tab.icon} text-sm`} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          <div className="rounded-xl border border-border-light bg-surface/35 px-4 py-3">
            <p className="text-sm text-text-primary">{MODAL_TABS.find((tab) => tab.id === activeTab)?.label}</p>
            <p className="mt-1 text-[11px] leading-5 text-text-dim">{MODAL_TABS.find((tab) => tab.id === activeTab)?.description}</p>
          </div>
          {/* Workspace Name */}
          {activeTab === 'save' && <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-text-dim text-xs uppercase tracking-wider">Workspace Name</label>
              <span className="text-[10px] text-text-dim">{workspaceName.length}/{MAX_WORKSPACE_NAME_LENGTH}</span>
            </div>
            <input
              type="text"
              value={workspaceName}
              maxLength={MAX_WORKSPACE_NAME_LENGTH}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. cosmic-penguin"
              className="w-full bg-surface text-text-primary text-sm border border-border-light rounded-lg px-3 py-2 outline-none focus:border-accent-blue transition-all duration-200"
              spellCheck={false}
            />
          </div>
          <div className="rounded-xl border border-border-light bg-surface/50 p-4">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${saveStatus === 'cloud' ? 'bg-green-400' : saveStatus === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
              <div className="flex-1"><p className="text-sm text-text-primary">Encrypted workspace save</p><p className="mt-1 text-[10px] leading-5 text-text-dim">Save the canvas and paired document locally, then sync the encrypted payload when cloud storage is available.</p></div>
            </div>
            <button onClick={handleSaveNow} disabled={savingNow} className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent-blue py-2.5 text-sm text-white hover:bg-accent-blue-hover disabled:opacity-50"><i className={`bx ${savingNow ? 'bx-loader-alt animate-spin' : 'bx-save'}`} />{savingNow ? 'Saving…' : 'Save workspace now'}</button>
            {saveMessage && <p className="mt-2 text-[10px] leading-4 text-text-muted">{saveMessage}</p>}
          </div>
          </div>}

          {/* ── Export As ── */}
          {activeTab === 'export' && <div className="p-3.5 rounded-xl border border-border-light bg-surface/50">
            <div className="flex items-center gap-2 mb-3">
              <i className="bx bx-export text-lg text-accent-blue" />
              <span className="text-text-primary text-sm font-medium">Export As</span>
            </div>

            {/* Preview */}
            <div
              className="w-full h-[140px] rounded-lg overflow-hidden border border-border-light mb-3 flex items-center justify-center"
              style={{
                background: bgMode === 'none'
                  ? 'repeating-conic-gradient(#2a2a35 0% 25%, #1e1e28 0% 50%) 0 0 / 16px 16px'
                  : getBgColor(),
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <span className="text-text-dim text-xs">Generating preview...</span>
              )}
            </div>

            {/* Background toggle */}
            <div className="flex items-center gap-3 mb-3">
              <p className="text-text-dim text-[10px] uppercase tracking-wider shrink-0">BG</p>
              <div className="flex items-center gap-1 flex-1">
                {[
                  { value: 'dark', label: 'Dark', icon: 'bxs-moon' },
                  { value: 'light', label: 'Light', icon: 'bxs-sun' },
                  { value: 'none', label: 'None', icon: 'bx-hide' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBgMode(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] cursor-pointer transition-all duration-200 ${
                      bgMode === opt.value
                        ? 'bg-accent-blue/20 text-accent-blue'
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    <i className={`bx ${opt.icon} text-xs`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale selector (for PNG) */}
            <div className="flex items-center gap-3 mb-3">
              <p className="text-text-dim text-[10px] uppercase tracking-wider shrink-0">Scale</p>
              <div className="flex items-center gap-1 flex-1">
                {[1, 2, 4, 8].map((s) => (
                  <button
                    key={s}
                    onClick={() => setExportScale(s)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] cursor-pointer transition-all duration-200 ${
                      exportScale === s
                        ? 'bg-accent-blue/20 text-accent-blue'
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <p className="text-text-dim text-[10px] mb-3">
              PNG exports are lossless and rendered at the selected full resolution.
            </p>

            {/* Format buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportPNG}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-blue hover:bg-accent-blue-hover text-text-primary text-xs cursor-pointer transition-all duration-200"
              >
                <i className="bx bx-image text-sm" />
                PNG Image
              </button>
              <button
                onClick={handleExportSVG}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border-light text-text-secondary text-xs cursor-pointer transition-all duration-200"
              >
                <i className="bx bx-code-alt text-sm" />
                SVG Vector
              </button>
              <button
                onClick={handleExportPDF}
                title={limits.pdfExport ? 'Export PDF' : 'PDF export is available on Pro'}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border-light text-text-secondary text-xs cursor-pointer transition-all duration-200"
              >
                <i className="bx bxs-file-pdf text-sm" />
                PDF Document
                {!limits.pdfExport && <span className="ml-auto rounded bg-accent-blue/15 px-1.5 py-0.5 text-[8px] uppercase text-accent-blue">Pro</span>}
              </button>
              <button
                onClick={handleExportLixjson}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border-light text-text-secondary text-xs cursor-pointer transition-all duration-200"
              >
                <i className="bx bx-braces text-sm" />
                .lixjson Scene
              </button>
            </div>
          </div>}

          {/* ── Live Collaborate ── */}
          {activeTab === 'share' && <div className="p-3.5 rounded-xl border border-border-light bg-surface/50">
            <div className="flex items-center gap-2 mb-2.5">
              <i className="bx bx-group text-lg text-accent-blue" />
              <div className="flex-1">
                <span className="text-text-primary text-sm font-medium">Live Collaborate</span>
                <p className="text-text-dim text-[10px] leading-relaxed">Real-time E2E encrypted editing with up to {limits.collaborators} {limits.collaborators === 1 ? 'person' : 'people'} on {tier === 'guest' ? 'Guest' : tier[0].toUpperCase() + tier.slice(1)}</p>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-green-400/80">
                <i className="bx bxs-lock-alt text-xs" />
                Encrypted
              </span>
            </div>

            {collabLink || collabConnected ? (
              <>
                {collabLink && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={collabLink}
                      readOnly
                      className="flex-1 bg-surface text-text-secondary text-xs border border-border-light rounded-lg px-2.5 py-2 outline-none truncate"
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      onClick={handleCopyCollabLink}
                      className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200 ${
                        collabCopied
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-accent-blue hover:bg-accent-blue-hover text-text-primary'
                      }`}
                    >
                      {collabCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
                {collabConnected && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-green-400/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live — {collabSharingEnabled ? 'invite access enabled' : 'invite access paused'}
                  </div>
                )}
                <button
                  onClick={handleEndSession}
                  className="w-full mt-2 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs cursor-pointer hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center gap-1.5"
                >
                  <i className="bx bx-power-off text-sm" />
                  End Session
                </button>
              </>
            ) : (
              <button
                onClick={handleStartCollab}
                disabled={startingCollab}
                className="w-full py-2.5 rounded-lg bg-accent-blue hover:bg-accent-blue-hover text-text-primary text-sm cursor-pointer transition-all duration-200 disabled:opacity-50"
              >
                {startingCollab ? 'Starting room...' : 'Start Live Session'}
              </button>
            )}

            {(collabError || collabRuntimeError) && (
              <p className="text-red-400 text-[10px] mt-2">{collabError || collabRuntimeError}</p>
            )}
          </div>}

          {/* ── One-time view-only share (issue #24 bug #9) ── */}
          {activeTab === 'share' && <div className="p-3.5 rounded-xl border border-border-light bg-surface/50">
            <div className="flex items-center gap-2 mb-2.5">
              <i className="bx bx-link-alt text-lg text-accent-blue" />
              <div className="flex-1">
                <span className="text-text-primary text-sm font-medium">View-only share</span>
                <p className="text-text-dim text-[10px] leading-relaxed">Snapshot the canvas — anyone with the link can view, no editing</p>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-green-400/80">
                <i className="bx bxs-lock-alt text-xs" />
                Encrypted
              </span>
            </div>

            {shareLink ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 bg-surface text-text-secondary text-xs border border-border-light rounded-lg px-2.5 py-2 outline-none truncate"
                  onClick={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopyShareLink}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200 ${
                    shareCopied
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-accent-blue hover:bg-accent-blue-hover text-text-primary'
                  }`}
                >
                  {shareCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleCreateShareLink}
                disabled={creatingShare}
                className="w-full py-2.5 rounded-lg bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue text-sm cursor-pointer transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <i className="bx bx-share-alt text-sm" />
                {creatingShare ? 'Creating link…' : 'Create view-only link'}
              </button>
            )}

            {shareError && (
              <p className="text-red-400 text-[10px] mt-2">{shareError}</p>
            )}
          </div>}

          {/* ── Public workspace template ── */}
          {activeTab === 'publish' && <div className="p-3.5 rounded-xl border border-accent-blue/25 bg-accent-blue/5">
            <div className="mb-3 flex items-start gap-2">
              <i className="bx bx-world text-lg text-accent-blue" />
              <div className="flex-1">
                <span className="text-text-primary text-sm font-medium">Publish as a template</span>
                <p className="text-text-dim text-[10px] leading-relaxed">Create a public canvas and document snapshot others can fork or clone.</p>
              </div>
              <a href="/templates" target="_blank" rel="noreferrer" className="text-[10px] text-accent-blue hover:underline">Browse</a>
            </div>
            {publishedUrl ? (
              <div>
                <div className="flex gap-2">
                  <input readOnly value={publishedUrl} onClick={(event) => event.target.select()} className="min-w-0 flex-1 rounded-lg border border-border-light bg-surface px-2.5 py-2 text-xs text-text-secondary outline-none" />
                  <button onClick={() => navigator.clipboard.writeText(publishedUrl)} className="cursor-pointer rounded-lg bg-accent-blue px-3 text-xs text-white hover:bg-accent-blue-hover">Copy</button>
                </div>
                <a href={publishedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent-blue hover:underline">Open published template <i className="bx bx-link-external" /></a>
                <button onClick={() => handlePublishTemplate(true)} disabled={publishing} className="mt-2 ml-4 cursor-pointer text-[10px] text-text-dim hover:text-accent-blue disabled:opacity-50"><i className="bx bx-refresh mr-1" />{publishing ? 'Updating…' : 'Update public snapshot'}</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <input value={publishTitle} maxLength={72} onChange={(event) => setPublishTitle(event.target.value)} placeholder="Public title" className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-blue" />
                <textarea value={publishDescription} maxLength={600} onChange={(event) => setPublishDescription(event.target.value)} placeholder="What can people build with this workspace?" rows={3} className="w-full resize-none rounded-lg border border-border-light bg-surface px-3 py-2 text-xs leading-5 text-text-primary outline-none focus:border-accent-blue" />
                <input value={publishTags} onChange={(event) => setPublishTags(event.target.value)} placeholder="Tags, separated by commas (up to 6)" className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-blue" />
                <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-2.5 text-[10px] leading-4 text-yellow-200/80">
                  <i className="bx bx-info-circle mr-1" />Everything in this snapshot becomes public. Private or access-controlled media may not work for other users.
                </div>
                <button onClick={() => handlePublishTemplate(false)} disabled={publishing} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent-blue py-2.5 text-sm text-white hover:bg-accent-blue-hover disabled:opacity-50">
                  <i className="bx bx-upload" />{!isAuthenticated ? 'Sign in to publish' : publishing ? 'Publishing…' : 'Publish workspace'}
                </button>
              </div>
            )}
            {publishError && <p className="mt-2 text-[10px] text-red-400">{publishError}</p>}
          </div>}
        </div>
      </div>
    </div>
  )
}
