import { create } from 'zustand'
import useSketchStore from './useSketchStore'

export const MAX_WORKSPACE_NAME_LENGTH = 20

function limitWorkspaceName(name) {
  return String(name ?? '').slice(0, MAX_WORKSPACE_NAME_LENGTH)
}

/**
 * Swap black↔white colors on all shapes when theme changes.
 * prevTheme / nextTheme are resolved ('dark' | 'light').
 */
function invertShapeColors(prevResolved, nextResolved) {
  if (prevResolved === nextResolved) return
  const shapes = window.shapes
  if (!shapes || shapes.length === 0) return

  // Going light → dark: #000 → #fff.  Going dark → light: #fff → #000.
  const from = nextResolved === 'light' ? '#ffffff' : '#000000'
  const to   = nextResolved === 'light' ? '#000000' : '#ffffff'

  const normalize = (c) => {
    if (!c || c === 'transparent' || c === 'none') return c
    const lower = c.toLowerCase().trim()
    if (lower === '#fff' || lower === '#ffffff' || lower === 'white') return '#ffffff'
    if (lower === '#000' || lower === '#000000' || lower === 'black') return '#000000'
    return lower
  }

  for (const shape of shapes) {
    let changed = false
    if (shape.shapeName === 'icon' || shape.type === 'icon') {
      const isDark = nextResolved === 'dark'
      const targetDarkColor = '#1a1a2e'
      const bgDarkColor = '#15111f'

      if (shape.group) {
        shape.group.querySelectorAll('*').forEach((element) => {
          if (element.nodeType === 1) {
            const fill = element.getAttribute('fill')
            const stroke = element.getAttribute('stroke')

            if (fill && fill !== 'none' && fill !== 'transparent') {
              const normFill = fill.toLowerCase().trim()
              if (isDark) {
                if (normFill === targetDarkColor || normFill === '#000000' || normFill === '#000') {
                  element.setAttribute('fill', '#ffffff')
                  changed = true
                } else if (normFill === '#ffffff' || normFill === '#fff') {
                  element.setAttribute('fill', bgDarkColor)
                  changed = true
                }
              } else {
                if (normFill === '#ffffff' || normFill === '#fff') {
                  element.setAttribute('fill', targetDarkColor)
                  changed = true
                } else if (normFill === bgDarkColor) {
                  element.setAttribute('fill', '#ffffff')
                  changed = true
                }
              }
            }

            if (stroke && stroke !== 'none' && stroke !== 'transparent') {
              const normStroke = stroke.toLowerCase().trim()
              if (isDark) {
                if (normStroke === targetDarkColor || normStroke === '#000000' || normStroke === '#000') {
                  element.setAttribute('stroke', '#ffffff')
                  changed = true
                } else if (normStroke === '#ffffff' || normStroke === '#fff') {
                  element.setAttribute('stroke', bgDarkColor)
                  changed = true
                }
              } else {
                if (normStroke === '#ffffff' || normStroke === '#fff') {
                  element.setAttribute('stroke', targetDarkColor)
                  changed = true
                } else if (normStroke === bgDarkColor) {
                  element.setAttribute('stroke', '#ffffff')
                  changed = true
                }
              }
            }
          }
        })
      }
    } else {
      if (shape.options) {
        if (normalize(shape.options.stroke) === from) {
          shape.options.stroke = to
          changed = true
        }
        if (normalize(shape.options.fill) === from) {
          shape.options.fill = to
          changed = true
        }
      }
      // Text shapes store color directly
      if (shape.color !== undefined && normalize(shape.color) === from) {
        shape.color = to
        changed = true
      }
      if (shape.strokeColor !== undefined && normalize(shape.strokeColor) === from) {
        shape.strokeColor = to
        changed = true
      }
      if (shape.labelColor !== undefined) {
        const labelColor = normalize(shape.labelColor)
        if (labelColor === from || labelColor === '#e0e0e0' || labelColor === '#e8e3f3') {
          shape.labelColor = to
          changed = true
        }
      }
    }
    if (changed && typeof shape.draw === 'function') {
      shape.draw()
    }
  }
}

function readStoredTheme() {
  if (typeof window === 'undefined') return 'dark'
  try {
    const theme = localStorage.getItem('theme')
    if (theme && ['dark', 'light', 'system'].includes(theme)) return theme
  } catch {}
  try {
    const prefs = JSON.parse(localStorage.getItem('lix_ui_prefs') || '{}')
    return ['dark', 'light', 'system'].includes(prefs.theme) ? prefs.theme : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme) {
  // Issue #38 bug #1: scope theme to body classes so light mode only
  // affects the canvas, not the landing/blog pages. Token values live
  // in `body.canvas-mode` (light default) and `body.canvas-mode.theme-
  // dark` (toggle) rules in src/app/globals.css.
  const body = document.body
  if (!body) return
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  body.classList.remove('theme-dark', 'theme-light')
  body.classList.add(`theme-${resolved}`)

  const svgEl = window.svg
  if (svgEl) svgEl.style.background = resolved === 'light' ? '#ffffff' : '#15111f'
}

const useUIStore = create((set, get) => ({
  // --- Modals ---
  saveModalOpen: false,
  aiModalOpen: false,
  graphModalOpen: false,
  commandPaletteOpen: false,
  exportImageModalOpen: false,
  findBarOpen: false,
  canvasPropertiesOpen: false,
  imageGenerateModalOpen: false,

  toggleSaveModal: () =>
    set((s) => ({ saveModalOpen: !s.saveModalOpen })),
  toggleAIModal: () =>
    set((s) => ({ aiModalOpen: !s.aiModalOpen })),
  toggleGraphModal: () =>
    set((s) => ({ graphModalOpen: !s.graphModalOpen })),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleExportImageModal: () =>
    set((s) => ({ exportImageModalOpen: !s.exportImageModalOpen })),
  toggleFindBar: () =>
    set((s) => ({ findBarOpen: !s.findBarOpen })),
  closeFindBar: () =>
    set({ findBarOpen: false }),
  toggleCanvasProperties: () =>
    set((s) => ({ canvasPropertiesOpen: !s.canvasPropertiesOpen })),
  toggleImageGenerateModal: () =>
    set((s) => ({ imageGenerateModalOpen: !s.imageGenerateModalOpen })),
  closeImageGenerateModal: () =>
    set({ imageGenerateModalOpen: false }),
  closeAllModals: () =>
    set({ saveModalOpen: false, aiModalOpen: false, graphModalOpen: false, commandPaletteOpen: false, exportImageModalOpen: false, findBarOpen: false, canvasPropertiesOpen: false, imageGenerateModalOpen: false }),

  // --- Menu ---
  menuOpen: false,
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  closeMenu: () => set({ menuOpen: false }),

  // --- Workspace ---
  workspaceName: '',
  setWorkspaceName: (name) => {
    const workspaceName = limitWorkspaceName(name)
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('lixsketch-workspace-name', workspaceName) } catch {}
    }
    set({ workspaceName })
  },

  // --- Save Status ---
  // 'idle' | 'local' | 'cloud' | 'failed'
  saveStatus: 'idle',
  setSaveStatus: (status) => set({ saveStatus: status }),

  // --- Session / Encryption ---
  // Key is persisted in localStorage keyed by session ID so it survives page refreshes.
  // This ensures re-saving a workspace uses the same key, keeping old share links valid.
  sessionEncryptionKey: null,
  setSessionEncryptionKey: (key, sessionId) => {
    if (typeof window !== 'undefined' && sessionId) {
      localStorage.setItem(`lixsketch-enc-key-${sessionId}`, key)
    }
    set({ sessionEncryptionKey: key })
  },
  loadEncryptionKeyForSession: (sessionId) => {
    if (typeof window !== 'undefined' && sessionId) {
      const stored = localStorage.getItem(`lixsketch-enc-key-${sessionId}`)
      if (stored) {
        set({ sessionEncryptionKey: stored })
        return stored
      }
    }
    return null
  },
  clearEncryptionKeyForSession: (sessionId) => {
    if (typeof window !== 'undefined' && sessionId) {
      localStorage.removeItem(`lixsketch-enc-key-${sessionId}`)
    }
    set({ sessionEncryptionKey: null })
  },

  // --- Canvas Loading ---
  canvasLoading: false,
  canvasLoadingMessage: 'Loading canvas...',
  setCanvasLoading: (loading, message) => set({ canvasLoading: loading, canvasLoadingMessage: message || 'Loading canvas...' }),

  // --- Theme ---
  theme: readStoredTheme(),
  setTheme: (newTheme) => {
    const prev = get().theme
    const resolve = (t) => t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t
    invertShapeColors(resolve(prev), resolve(newTheme))
    applyTheme(newTheme)
    set({ theme: newTheme })
    useSketchStore.getState().restoreCanvasBackground(resolve(newTheme))
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('theme', newTheme)
        const prefs = JSON.parse(localStorage.getItem('lix_ui_prefs') || '{}')
        localStorage.setItem('lix_ui_prefs', JSON.stringify({ ...prefs, theme: newTheme }))
      } catch {}
    }
  },

  // --- Language / i18n ---
  language: 'en',
  setLanguage: (lang) => {
    set({ language: lang })
  },
  persistUIPrefs: (prefs) => {
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem('lix_ui_prefs')
      let parsed = {}
      try {
        if (existing) parsed = JSON.parse(existing)
      } catch (e) {}
      
      const updated = { ...parsed, ...prefs }
      localStorage.setItem('lix_ui_prefs', JSON.stringify(updated))
      
      if (prefs.language) {
        set({ language: prefs.language })
        window.dispatchEvent(new CustomEvent('lix-language-changed', { detail: { language: prefs.language } }))
      }
    }
  }
}))

export default useUIStore
