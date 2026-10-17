"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useUIStore from '@/store/useUIStore'
import useSketchStore from '@/store/useSketchStore'
import useAuthStore, { WORKER_URL } from '@/store/useAuthStore'
import { useProfileStore } from '@/hooks/useGuestProfile'
import { beginWorkspaceDeletion } from '@/hooks/useAutoSave'
import { discardPendingDocChanges } from '@/hooks/useDocAutoSave'
import { useTranslation } from '@/hooks/useTranslation'
import { CANVAS_BACKGROUNDS } from '@/utils/canvasBackgrounds'

function DangerWarningDialog({ action, busy, error, workspaceName, onCancel, onConfirm }) {
  useEffect(() => {
    if (!action || busy) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [action, busy, onCancel])

  if (!action) return null

  const deleting = action === 'delete'
  const title = deleting ? 'Delete workspace?' : 'Reset canvas?'
  const description = deleting
    ? `“${workspaceName || 'Untitled'}” will be permanently removed from cloud storage and this browser.`
    : 'Every shape on this canvas will be removed. The workspace and its document will remain available.'
  const warning = deleting
    ? 'This cannot be undone. Shared links to this workspace will stop working, and you will be moved to a new blank workspace.'
    : 'You can undo this with Ctrl+Z until the empty canvas syncs to the cloud or this page is reloaded.'

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center p-4 font-[lixFont]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="danger-warning-title"
      onClick={() => { if (!busy) onCancel() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[480px] rounded-2xl border border-red-500/35 bg-surface-card p-5 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
            <i className={`bx ${deleting ? 'bx-trash' : 'bx-reset'} text-xl`} />
          </div>
          <div>
            <h2 id="danger-warning-title" className="text-base text-text-primary">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-300">
          <i className="bx bx-error-circle mr-1.5" />
          {warning}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <i className="bx bx-loader-alt animate-spin" />}
            {deleting ? 'Delete workspace' : 'Reset canvas'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function focusItems(root) {
  return Array.from(root?.querySelectorAll(
    'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])',
  ) || []).filter((element) => !element.closest('[inert]'))
}

function handleArrowNavigation(event, root) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = focusItems(root)
  if (!items.length) return
  const current = items.indexOf(document.activeElement)
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : event.key === 'ArrowDown'
        ? (current + 1 + items.length) % items.length
        : (current - 1 + items.length) % items.length
  event.preventDefault()
  items[next]?.focus()
}

export default function AppMenu() {
  const { t, language } = useTranslation()

  const LINKS = [
    { label: 'Templates', icon: 'bx-store-alt', href: '/templates' },
    { label: t('links.documentation'), icon: 'bx-book-open', href: '/docs' },
    { label: t('links.github'), icon: 'bxl-github', href: 'https://github.com/elixpo/sketch.elixpo' },
    { label: t('links.reportIssue'), icon: 'bx-bug', href: 'https://github.com/elixpo/sketch.elixpo/issues' },
  ]

  const PREFERENCE_ITEMS = [
    { label: t('prefs.toolLock'), shortcut: 'Q', id: 'toolLock' },
    { label: t('prefs.snapObjects'), shortcut: 'Alt+S', id: 'snapObjects' },
    { label: t('menu.showGrid'), shortcut: "Ctrl+'", id: 'toggleGrid' },
    { label: 'Show rulers', shortcut: 'Shift+R', id: 'toggleRulers' },
    { label: t('prefs.zenMode'), shortcut: 'Alt+Z', id: 'zenMode' },
    { label: t('prefs.viewMode'), shortcut: 'Alt+R', id: 'viewMode' },
    { label: t('prefs.canvasShapeProps'), shortcut: 'Alt+/', id: 'properties' },
    { label: t('prefs.arrowBinding'), id: 'arrowBinding', toggle: true },
    { label: t('prefs.snapMidpoints'), id: 'snapMidpoints', toggle: true },
  ]

  const menuOpen = useUIStore((s) => s.menuOpen)
  const closeMenu = useUIStore((s) => s.closeMenu)
  const toggleSaveModal = useUIStore((s) => s.toggleSaveModal)
  const toggleExportImageModal = useUIStore((s) => s.toggleExportImageModal)
  const theme = useUIStore((s) => s.theme)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const setTheme = useUIStore((s) => s.setTheme)
  const persistUIPrefs = useUIStore((s) => s.persistUIPrefs)
  const canvasBackground = useSketchStore((s) => s.canvasBackground)
  const setCanvasBackground = useSketchStore((s) => s.setCanvasBackground)
  const clearShapes = useSketchStore((s) => s.clearShapes)
  const clearHistory = useSketchStore((s) => s.clearHistory)
  const gridEnabled = useSketchStore((s) => s.gridEnabled)
  const toggleGrid = useSketchStore((s) => s.toggleGrid)
  const rulersEnabled = useSketchStore((s) => s.rulersEnabled)
  const toggleRulers = useSketchStore((s) => s.toggleRulers)
  const rulerUnit = useSketchStore((s) => s.rulerUnit)
  const setRulerUnit = useSketchStore((s) => s.setRulerUnit)

  const viewMode = useSketchStore((s) => s.viewMode)
  const zenMode = useSketchStore((s) => s.zenMode)
  const toolLock = useSketchStore((s) => s.toolLock)
  const snapToObjects = useSketchStore((s) => s.snapToObjects)
  const toggleViewMode = useSketchStore((s) => s.toggleViewMode)
  const toggleZenMode = useSketchStore((s) => s.toggleZenMode)
  const toggleToolLock = useSketchStore((s) => s.toggleToolLock)
  const toggleSnapToObjects = useSketchStore((s) => s.toggleSnapToObjects)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const authUser = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)

  const [prefsOpen, setPrefsOpen] = useState(false)
  // Flyouts render through a portal so the vertically scrolling menu never
  // needs overflow-visible. This keeps its bottom edge inside the viewport.
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsFlyoutPosition, setActionsFlyoutPosition] = useState({ top: 0, left: 0 })
  const [prefsFlyoutPosition, setPrefsFlyoutPosition] = useState({ top: 0, left: 0 })
  const [dangerAction, setDangerAction] = useState(null)
  const [dangerBusy, setDangerBusy] = useState(false)
  const [dangerError, setDangerError] = useState('')
  const actionsButtonRef = useRef(null)
  const prefsButtonRef = useRef(null)
  const menuRef = useRef(null)
  const actionsFlyoutRef = useRef(null)
  const prefsFlyoutRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    if (menuOpen) {
      openerRef.current = document.activeElement
      requestAnimationFrame(() => actionsButtonRef.current?.focus())
      return undefined
    }
    setActionsOpen(false)
    setPrefsOpen(false)
    openerRef.current?.focus?.()
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (actionsOpen) {
        setActionsOpen(false)
        actionsButtonRef.current?.focus()
      } else if (prefsOpen) {
        setPrefsOpen(false)
        prefsButtonRef.current?.focus()
      } else {
        closeMenu()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [actionsOpen, closeMenu, menuOpen, prefsOpen])

  useEffect(() => {
    if (actionsOpen) requestAnimationFrame(() => focusItems(actionsFlyoutRef.current)[0]?.focus())
  }, [actionsOpen])

  useEffect(() => {
    if (prefsOpen) requestAnimationFrame(() => focusItems(prefsFlyoutRef.current)[0]?.focus())
  }, [prefsOpen])

  const flyoutPosition = (button, width, estimatedHeight) => {
    const rect = button?.getBoundingClientRect()
    if (!rect || typeof window === 'undefined') return { top: 8, left: 8 }
    return {
      top: Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8)),
      left: Math.max(8, rect.left - width - 8),
    }
  }

  const toggleActionsFlyout = () => {
    const opening = !actionsOpen
    setPrefsOpen(false)
    setActionsOpen(opening)
    if (opening) setActionsFlyoutPosition(flyoutPosition(actionsButtonRef.current, 230, 190))
  }

  const togglePreferencesFlyout = () => {
    const opening = !prefsOpen
    setActionsOpen(false)
    setPrefsOpen(opening)
    if (opening) setPrefsFlyoutPosition(flyoutPosition(prefsButtonRef.current, 240, Math.min(window.innerHeight * .6, 420)))
  }

  const preferenceIsActive = (item) =>
    (item.id === 'toolLock' && toolLock) ||
    (item.id === 'snapObjects' && snapToObjects) ||
    (item.id === 'toggleGrid' && gridEnabled) ||
    (item.id === 'toggleRulers' && rulersEnabled) ||
    (item.id === 'zenMode' && zenMode) ||
    (item.id === 'viewMode' && viewMode) ||
    item.toggle

  const handlePreference = (item) => {
    if (item.id === 'toolLock') toggleToolLock()
    else if (item.id === 'snapObjects') toggleSnapToObjects()
    else if (item.id === 'toggleGrid') toggleGrid()
    else if (item.id === 'toggleRulers') toggleRulers()
    else if (item.id === 'zenMode') { toggleZenMode(); closeMenu() }
    else if (item.id === 'viewMode') { toggleViewMode(); closeMenu() }
    else if (item.id === 'properties') { useUIStore.getState().toggleCanvasProperties(); closeMenu() }
  }

  // Menu is always accessible (via floating button in view/zen mode)

  const handleOpen = () => {
    const serializer = window.__sceneSerializer
    if (serializer) {
      serializer.upload().then((result) => {
        if (result && result.success) closeMenu()
        else if (result && result.error) {
          console.warn('[Open] Invalid scene file:', result.error)
        }
      })
    }
    closeMenu()
  }

  const handleQuickSave = () => {
    const serializer = window.__sceneSerializer
    if (serializer) {
      const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
      serializer.download(workspaceName)
    }
    closeMenu()
  }

  const actionItems = [
    { label: t('menu.quickSave'), icon: 'bx-check-circle', shortcut: 'Ctrl+S', onClick: handleQuickSave },
    { label: t('menu.open'), icon: 'bx-folder-open', shortcut: 'Ctrl+O', onClick: handleOpen },
    { label: t('menu.saveShare'), icon: 'bx-save', shortcut: 'Ctrl+Shift+S', onClick: () => { toggleSaveModal(); closeMenu() } },
    { label: t('menu.exportImage'), icon: 'bx-image', shortcut: 'Ctrl+Shift+E', onClick: () => { toggleExportImageModal(); closeMenu() } },
    { label: t('menu.findText'), icon: 'bx-search', shortcut: 'Ctrl+F', onClick: () => { useUIStore.getState().toggleFindBar(); closeMenu() } },
  ]

  const openDangerWarning = (action) => {
    setDangerError('')
    setDangerAction(action)
    closeMenu()
  }

  useEffect(() => {
    window.__requestCanvasResetConfirmation = () => openDangerWarning('reset')
    return () => {
      delete window.__requestCanvasResetConfirmation
    }
  }, [])

  const closeDangerWarning = () => {
    if (dangerBusy) return
    setDangerError('')
    setDangerAction(null)
  }

  const clearLocalWorkspace = (sessionId) => {
    const keys = [
      'lixsketch-autosave',
      'lixsketch-autosave-meta',
      'lixsketch-doc-autosave',
      'lixsketch-doc-autosave-meta',
      'lixsketch-workspace-name',
    ]
    if (sessionId) {
      keys.push(
        `lixsketch-autosave-${sessionId}`,
        `lixsketch-autosave-meta-${sessionId}`,
        `lixsketch-doc-autosave-${sessionId}`,
        `lixsketch-doc-autosave-meta-${sessionId}`,
        `lixsketch-enc-key-${sessionId}`,
      )
    }
    keys.forEach((key) => localStorage.removeItem(key))
  }

  const handleDangerConfirm = async () => {
    if (!dangerAction || dangerBusy) return
    setDangerBusy(true)
    setDangerError('')

    try {
      const serializer = window.__sceneSerializer
      if (dangerAction === 'reset') {
        serializer?.resetCanvas?.({ workspaceName: useUIStore.getState().workspaceName || 'Untitled' })
        clearShapes()
        clearHistory()
        useUIStore.getState().setSaveStatus('local')
        setDangerAction(null)
        return
      }

      const sessionId = window.__sessionID
      if (!sessionId) throw new Error('The current workspace session is not ready yet.')

      const profile = useProfileStore.getState().profile
      const createdBy = isAuthenticated && authUser?.id
        ? authUser.id
        : (profile?.id || localStorage.getItem('lixsketch-guest-session'))

      const response = await fetch(`${WORKER_URL}/api/scenes/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, createdBy }),
      })

      const localDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const ignorableLocalBackendFailure = localDevelopment && response.status >= 500
      if (!response.ok && response.status !== 404 && !ignorableLocalBackendFailure) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Cloud deletion failed. The workspace was not removed.')
      }

      beginWorkspaceDeletion()
      discardPendingDocChanges()
      window.__disconnectCollaboration?.()
      clearLocalWorkspace(sessionId)
      serializer?.resetCanvas?.({ undoable: false })
      clearShapes()
      clearHistory()
      useUIStore.getState().setSaveStatus('idle')
      const nextSessionId = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      window.location.assign(`/c/${nextSessionId}?new=1&preserveLocal=1`)
    } catch (error) {
      setDangerError(error.message || 'The workspace could not be deleted.')
    } finally {
      setDangerBusy(false)
    }
  }

  return (
    <>
      {menuOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-999"
          onClick={() => { closeMenu(); setActionsOpen(false); setPrefsOpen(false) }}
        />
      )}
      <div
        ref={menuRef}
        role="dialog"
        aria-label="Application menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        onKeyDown={(event) => handleArrowNavigation(event, menuRef.current)}
        onScroll={() => { setActionsOpen(false); setPrefsOpen(false) }}
        className={`absolute top-14 right-4 w-[230px] max-h-[calc(100vh-72px)] overflow-y-auto overscroll-contain no-scrollbar bg-surface/75 backdrop-blur-lg rounded-2xl z-[1000] border border-border-light p-1.5 font-[lixFont] text-[13px] transition-all duration-200 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent ${
          menuOpen
            ? 'opacity-100 blur-0 pointer-events-auto'
            : 'opacity-0 blur-[20px] pointer-events-none'
        }`}
      >
        {/* File/search actions */}
        <button
          ref={actionsButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          aria-controls="app-actions-menu"
          onClick={toggleActionsFlyout}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-text-secondary text-[12.5px] hover:bg-surface-hover cursor-pointer transition-all duration-200 ${actionsOpen ? 'bg-surface-hover' : ''}`}
        >
          <span className="flex items-center gap-2">
            <i className="bx bx-bolt-circle text-sm" />
            Actions
          </span>
          <i className="bx bx-chevron-left text-sm text-text-dim" />
        </button>

        <hr className="border-border-light my-1" />

        <div className="relative">
          <button
            ref={prefsButtonRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={prefsOpen}
            aria-controls="app-preferences-menu"
            onClick={togglePreferencesFlyout}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-text-secondary text-[12.5px] hover:bg-surface-hover cursor-pointer transition-all duration-200 ${prefsOpen ? 'bg-surface-hover' : ''}`}
          >
            <span className="flex items-center gap-2">
              <i className="bx bx-cog text-sm" />
              {t('menu.preferences')}
            </span>
            <i className="bx bx-chevron-left text-sm text-text-dim" />
          </button>

        </div>

        <hr className="border-border-light my-1" />

        {/* Links */}
        {LINKS.map((link) => {
          const isExternal = link.href.startsWith('http')
          return (
            <a
              key={link.label}
              href={link.href}
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={closeMenu}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-secondary text-[12.5px] hover:bg-surface-hover cursor-pointer transition-all duration-200"
            >
              <i className={`bx ${link.icon} text-sm`} />
              {link.label}
            </a>
          )
        })}

        <hr className="border-border-light my-1" />

        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-1">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-red-400/80">Danger zone</p>
          <button
            onClick={() => openDangerWarning('reset')}
            className="w-full flex items-center gap-2 border-b border-red-500/20 px-2 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <i className="bx bx-reset text-sm" />
            {t('menu.resetCanvas')}
          </button>
          <button
            onClick={() => openDangerWarning('delete')}
            className="w-full flex items-center gap-2 px-2 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <i className="bx bx-trash text-sm" />
            Delete workspace
          </button>
        </div>

        <hr className="border-border-light my-1" />

        {/* Sign In / Sign Out */}
        {isAuthenticated ? (
          <>
            <div className="px-3 py-2 flex items-center gap-2">
              {authUser?.avatar ? (
                <img src={authUser.avatar} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <i className="bx bx-user-circle text-sm text-accent-blue" />
              )}
              <span className="text-text-secondary text-xs truncate flex-1">{authUser?.displayName || authUser?.email}</span>
            </div>
            <button
              onClick={() => { logout(); closeMenu() }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-200 text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <i className="bx bx-log-out text-sm" />
                {t('menu.signOut')}
              </span>
            </button>
          </>
        ) : (
          <button
            onClick={() => { login(); closeMenu() }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-200 text-text-secondary hover:bg-surface-hover cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <i className="bx bx-log-in text-sm" />
              {t('menu.signIn')}
            </span>
            <span className="text-text-dim text-[10px] px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue">Elixpo</span>
          </button>
        )}

        <hr className="border-border-light my-1" />

        {/* Theme toggle */}
        <div className="px-3 py-2">
          <p className="text-text-dim text-xs uppercase tracking-wider mb-2">
            {t('menu.theme')}
          </p>
          <div className="flex items-center gap-1">
            {[
              { value: 'light', icon: 'bxs-sun' },
              { value: 'dark', icon: 'bxs-moon' },
              { value: 'system', icon: 'bx-laptop' },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                aria-label={`Use ${t.value} theme`}
                aria-pressed={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs cursor-pointer transition-all duration-200 ${
                  theme === t.value
                    ? 'bg-accent text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                <i className={`bx ${t.icon} text-sm`} />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas background */}
        <div className="px-3 py-2">
          <p className="text-text-dim text-xs uppercase tracking-wider mb-2">
            {t('menu.canvasBackground')}
          </p>
          <div className="flex items-center gap-1.5">
            {CANVAS_BACKGROUNDS[resolvedTheme].map((bg) => (
              <button
                key={bg.color}
                type="button"
                onClick={() => setCanvasBackground(bg.color, resolvedTheme)}
                title={t(bg.label)}
                aria-label={`Use ${t(bg.label)} canvas background`}
                aria-pressed={canvasBackground === bg.color}
                className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all duration-200 ${
                  canvasBackground === bg.color
                    ? 'border-accent scale-110'
                    : 'border-border hover:border-border-light'
                }`}
                style={{ backgroundColor: bg.color }}
              />
            ))}
          </div>
        </div>

      </div>

      {menuOpen && typeof document !== 'undefined' && createPortal(
        <>
          {actionsOpen && (
            <div
              id="app-actions-menu"
              ref={actionsFlyoutRef}
              role="menu"
              aria-label="Actions"
              onKeyDown={(event) => handleArrowNavigation(event, actionsFlyoutRef.current)}
              className="fixed w-[230px] bg-surface-card border border-border-light rounded-2xl p-1.5 shadow-2xl shadow-black/40 z-[1001] font-[lixFont] [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent"
              style={actionsFlyoutPosition}
            >
              {actionItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => { setActionsOpen(false); item.onClick() }}
                  className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light last:border-b-0 text-text-secondary text-[11.5px] hover:bg-surface-hover cursor-pointer transition-all duration-200"
                >
                  <span className="flex items-center gap-2">
                    <i className={`bx ${item.icon} text-sm text-text-muted`} />
                    {item.label}
                  </span>
                  <span className="text-text-dim text-[10px]">{item.shortcut}</span>
                </button>
              ))}
            </div>
          )}

          {prefsOpen && (
            <div
              id="app-preferences-menu"
              ref={prefsFlyoutRef}
              role="menu"
              aria-label="Preferences"
              onKeyDown={(event) => handleArrowNavigation(event, prefsFlyoutRef.current)}
              className="fixed w-[240px] max-h-[60vh] overflow-y-auto overscroll-contain no-scrollbar bg-surface-card border border-border-light rounded-2xl p-1.5 shadow-2xl shadow-black/40 z-[1001] font-[lixFont] [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent [&_select:focus-visible]:outline-none [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-accent"
              style={prefsFlyoutPosition}
            >
              <div className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light text-text-secondary text-[11px]">
                <span>{t('prefs.language')}</span>
                <select
                  className="bg-surface-hover text-text-primary text-[10px] rounded px-1 outline-none border border-border-light"
                  value={language}
                  onChange={(e) => persistUIPrefs({ language: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="bg">Български</option>
                  <option value="de">Deutsch</option>
                  <option value="hi">हिन्दी</option>
                </select>
              </div>

              <div className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light text-text-secondary text-[11px]">
                <span>Ruler unit</span>
                <select
                  aria-label="Ruler unit"
                  className="cursor-pointer rounded border border-border-light bg-surface-hover px-1 text-[10px] uppercase text-text-primary outline-none"
                  value={rulerUnit}
                  onChange={(event) => setRulerUnit(event.target.value)}
                >
                  <option value="px">px</option>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>

              {PREFERENCE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handlePreference(item)}
                  className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light last:border-b-0 text-text-secondary text-[11px] hover:bg-surface-hover cursor-pointer transition-all duration-200"
                >
                  <span className="flex items-center gap-2">
                    {preferenceIsActive(item) && <i className="bx bx-check text-sm text-accent-blue" />}
                    {item.label}
                  </span>
                  {item.shortcut && <span className="text-text-dim text-[10px]">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </>,
        document.body,
      )}

      <DangerWarningDialog
        action={dangerAction}
        busy={dangerBusy}
        error={dangerError}
        workspaceName={useUIStore.getState().workspaceName}
        onCancel={closeDangerWarning}
        onConfirm={handleDangerConfirm}
      />
    </>
  )
}
