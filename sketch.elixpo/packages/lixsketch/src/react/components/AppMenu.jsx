"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useUIStore from '../store/useUIStore'
import useSketchStore from '../store/useSketchStore'
import { useAuthStore } from '../hooks/inertStores'
import { triggerCloudSync } from '../hooks/inertStores'
import { useTranslation } from '../hooks/useTranslation'
import { CANVAS_BACKGROUNDS } from '../utils/canvasBackgrounds'

function DangerWarningDialog({ action, workspaceName, onCancel, onConfirm }) {
  useEffect(() => {
    if (!action) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [action, onCancel])

  if (!action) return null
  const deleting = action === 'delete'

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center p-4 font-[lixFont]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="danger-warning-title"
      onClick={onCancel}
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
            <h2 id="danger-warning-title" className="text-base text-text-primary">
              {deleting ? 'Delete workspace?' : 'Reset canvas?'}
            </h2>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {deleting
                ? `“${workspaceName || 'Untitled'}” will be removed from this browser.`
                : 'Every shape on this canvas will be removed. The workspace shell remains available.'}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-300">
          <i className="bx bx-error-circle mr-1.5" />
          {deleting
            ? 'This cannot be undone. Persistence managed by the host application is not deleted by the offline package.'
            : 'This cannot be undone after the empty canvas is saved.'}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600 cursor-pointer"
          >
            {deleting ? 'Delete workspace' : 'Reset canvas'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function AppMenu() {
  const { t, language } = useTranslation()

  const LINKS = [
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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsFlyoutPosition, setActionsFlyoutPosition] = useState({ top: 0, left: 0 })
  const actionsButtonRef = useRef(null)
  const [dangerAction, setDangerAction] = useState(null)

  useEffect(() => {
    if (menuOpen) return
    setActionsOpen(false)
    setPrefsOpen(false)
  }, [menuOpen])

  const toggleActionsFlyout = () => {
    const opening = !actionsOpen
    setPrefsOpen(false)
    setActionsOpen(opening)
    if (!opening || typeof window === 'undefined') return
    const rect = actionsButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setActionsFlyoutPosition({
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 198)),
      left: Math.max(8, rect.left - 238),
    })
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
      const sceneData = serializer.save(workspaceName)
      const sessionId = window.__sessionID
      const key = sessionId ? `lixsketch-autosave-${sessionId}` : 'lixsketch-autosave'
      localStorage.setItem(key, JSON.stringify(sceneData))
      useUIStore.getState().setSaveStatus('local')
      triggerCloudSync()
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
    setDangerAction(action)
    closeMenu()
  }

  const handleDangerConfirm = () => {
    const serializer = window.__sceneSerializer
    if (dangerAction === 'delete') {
      const sessionId = window.__sessionID
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
      useUIStore.getState().setWorkspaceName?.('Untitled')
      useUIStore.getState().setSaveStatus?.('idle')
    }
    serializer?.resetCanvas?.()
    clearShapes()
    clearHistory()
    setDangerAction(null)
  }

  return (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-[999]"
          onClick={() => { closeMenu(); setActionsOpen(false); setPrefsOpen(false) }}
        />
      )}
      <div
        onScroll={() => setActionsOpen(false)}
        className={`absolute top-14 right-4 w-[230px] max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar bg-surface/75 backdrop-blur-lg rounded-2xl z-[1000] border border-border-light p-1.5 font-[lixFont] text-[13px] transition-all duration-200 ${
          menuOpen
            ? 'opacity-100 blur-0 pointer-events-auto'
            : 'opacity-0 blur-[20px] pointer-events-none'
        }`}
      >
        {/* File/search actions */}
        <button
          ref={actionsButtonRef}
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

        {/* Preferences - inline expandable */}
        <button
          onClick={() => setPrefsOpen((p) => !p)}
          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-text-secondary text-[12.5px] hover:bg-surface-hover cursor-pointer transition-all duration-200 ${prefsOpen ? 'bg-surface-hover' : ''}`}
        >
          <span className="flex items-center gap-2">
            <i className="bx bx-cog text-sm" />
            {t('menu.preferences')}
          </span>
          <i className={`bx bx-chevron-down text-sm text-text-dim transition-transform duration-150 ${prefsOpen ? 'rotate-180' : ''}`} />
        </button>

        {prefsOpen && (
          <div className="ml-2 border-l border-border-light pl-1">
            {/* Language Switcher */}
            <div className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light text-text-secondary text-[11px] transition-all duration-200">
              <span className="flex items-center gap-2">
                {t('prefs.language')}
              </span>
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
            
            {PREFERENCE_ITEMS.map((item) => {
              const isActive =
                (item.id === 'toolLock' && toolLock) ||
                (item.id === 'snapObjects' && snapToObjects) ||
                (item.id === 'toggleGrid' && gridEnabled) ||
                (item.id === 'toggleRulers' && rulersEnabled) ||
                (item.id === 'zenMode' && zenMode) ||
                (item.id === 'viewMode' && viewMode) ||
                (item.toggle) // arrow binding, snap midpoints default on

              const handleClick = () => {
                if (item.id === 'toolLock') toggleToolLock()
                else if (item.id === 'snapObjects') toggleSnapToObjects()
                else if (item.id === 'toggleGrid') toggleGrid()
                else if (item.id === 'toggleRulers') toggleRulers()
                else if (item.id === 'zenMode') { toggleZenMode(); closeMenu() }
                else if (item.id === 'viewMode') { toggleViewMode(); closeMenu() }
                else if (item.id === 'properties') { useUIStore.getState().toggleCanvasProperties(); closeMenu() }
              }

              return (
                <button
                  key={item.id}
                  onClick={handleClick}
                  className="w-full flex items-center justify-between px-3 py-2 border-b border-border-light last:border-b-0 text-text-secondary text-[11px] hover:bg-surface-hover cursor-pointer transition-all duration-200"
                >
                  <span className="flex items-center gap-2">
                    {isActive && (
                      <i className="bx bx-check text-sm text-accent-blue" />
                    )}
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span className="text-text-dim text-[10px]">{item.shortcut}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

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
            {CANVAS_BACKGROUNDS[theme === 'light' ? 'light' : 'dark'].map((bg) => (
              <button
                key={bg.color}
                onClick={() => setCanvasBackground(bg.color, theme === 'light' ? 'light' : 'dark')}
                title={t(bg.label)}
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

      {menuOpen && actionsOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed w-[230px] bg-surface-card border border-border-light rounded-2xl p-1.5 shadow-2xl shadow-black/40 z-[1001] font-[lixFont]"
          style={actionsFlyoutPosition}
        >
          {actionItems.map((item) => (
            <button
              key={item.label}
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
        </div>,
        document.body,
      )}

      <DangerWarningDialog
        action={dangerAction}
        workspaceName={useUIStore.getState().workspaceName}
        onCancel={() => setDangerAction(null)}
        onConfirm={handleDangerConfirm}
      />
    </>
  )
}
