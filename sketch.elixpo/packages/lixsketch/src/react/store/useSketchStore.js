import { create } from 'zustand'
import { DEFAULT_CANVAS_BACKGROUNDS, canvasBackgroundStorageKey, readCanvasBackground } from '../utils/canvasBackgrounds'

const GRID_STORAGE_KEY = 'lixsketch-grid-enabled'
const RULER_STORAGE_KEY = 'lixsketch-rulers-enabled'
const RULER_UNIT_STORAGE_KEY = 'lixsketch-ruler-unit'

// Tool enum replaces 15 boolean flags
export const TOOLS = {
  SELECT: 'select',
  PAN: 'pan',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  LINE: 'line',
  ARROW: 'arrow',
  FREEHAND: 'freehand',
  TEXT: 'text',
  CODE: 'code',
  ERASER: 'eraser',
  LASER: 'laser',
  IMAGE: 'image',
  FRAME: 'frame',
  ICON: 'icon',
  DRAW_SHAPE: 'draw-shape',
  PAINT_BUCKET: 'paint-bucket',
  LASSO: 'lasso',
  WEB_EMBED: 'web-embed',
}

// Action types for undo/redo
export const ACTION = {
  CREATE: 'create',
  DELETE: 'delete',
  MODIFY: 'modify',
  PASTE: 'paste',
}

// Tool -> cursor mapping
const TOOL_CURSORS = {
  [TOOLS.SELECT]: 'default',
  [TOOLS.PAN]: 'grab',
  [TOOLS.RECTANGLE]: 'crosshair',
  [TOOLS.CIRCLE]: 'crosshair',
  [TOOLS.LINE]: 'crosshair',
  [TOOLS.ARROW]: 'crosshair',
  [TOOLS.FREEHAND]: 'crosshair',
  [TOOLS.TEXT]: 'text',
  [TOOLS.CODE]: 'text',
  [TOOLS.LASER]: 'crosshair',
  [TOOLS.IMAGE]: 'crosshair',
  [TOOLS.FRAME]: 'crosshair',
  [TOOLS.ICON]: 'crosshair',
  [TOOLS.DRAW_SHAPE]: 'crosshair',
  [TOOLS.PAINT_BUCKET]: 'cell',
  [TOOLS.LASSO]: 'crosshair',
  [TOOLS.WEB_EMBED]: 'crosshair',
}

// Tool -> sidebar mapping
const TOOL_SIDEBARS = {
  [TOOLS.FREEHAND]: 'paintbrush',
  [TOOLS.RECTANGLE]: 'rectangle',
  [TOOLS.CIRCLE]: 'circle',
  [TOOLS.LINE]: 'line',
  [TOOLS.ARROW]: 'arrow',
  [TOOLS.TEXT]: 'text',
  [TOOLS.CODE]: 'text',
  [TOOLS.FRAME]: 'frame',
  [TOOLS.DRAW_SHAPE]: 'paintbrush',
}

// Keyboard shortcut -> tool mapping
export const SHORTCUT_MAP = {
  h: TOOLS.PAN,
  v: TOOLS.SELECT,
  1: TOOLS.SELECT,
  r: TOOLS.RECTANGLE,
  2: TOOLS.RECTANGLE,
  o: TOOLS.CIRCLE,
  4: TOOLS.CIRCLE,
  a: TOOLS.ARROW,
  5: TOOLS.ARROW,
  l: TOOLS.LINE,
  6: TOOLS.LINE,
  p: TOOLS.FREEHAND,
  7: TOOLS.FREEHAND,
  t: TOOLS.TEXT,
  8: TOOLS.TEXT,
  9: TOOLS.IMAGE,
  e: TOOLS.ERASER,
  0: TOOLS.ERASER,
  i: TOOLS.ICON,
  f: TOOLS.FRAME,
  k: TOOLS.LASER,
  d: TOOLS.DRAW_SHAPE,
  b: TOOLS.PAINT_BUCKET,
  s: TOOLS.LASSO,
  w: TOOLS.WEB_EMBED,
}

const useSketchStore = create((set, get) => ({
  // --- Active tool (replaces 15 boolean flags) ---
  activeTool: TOOLS.SELECT,
  activeSidebar: null, // which sidebar to show
  selectedShapeSidebar: null, // sidebar shown when a shape is selected (overrides activeSidebar)

  setActiveTool: (tool, { afterDraw } = {}) => {
    // In view mode, only pan is allowed
    if (get().viewMode && tool !== TOOLS.PAN) return
    // Tool lock: don't switch to SELECT after drawing
    if (afterDraw && tool === TOOLS.SELECT && get().toolLock) return
    set({
      activeTool: tool,
      activeSidebar: TOOL_SIDEBARS[tool] || null,
      selectedShapeSidebar: null,
    })
  },

  // Called by engine when a shape is selected/deselected
  setSelectedShapeSidebar: (sidebar) => set({ selectedShapeSidebar: sidebar }),
  clearSelectedShapeSidebar: () => set({ selectedShapeSidebar: null }),

  getCursor: () => {
    const tool = get().activeTool
    if (tool === TOOLS.ERASER) {
      const isLight = typeof document !== 'undefined' && document.documentElement.dataset.canvasTheme === 'light'
      const fill = isLight ? '#31283f' : '#f5effb'
      const stroke = isLight ? '#ffffff' : '#31283f'
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`
      return `url("data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(svg) : ''}") 10 10, auto`
    }
    if (tool === TOOLS.LASER) {
      return `url("data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1971c2" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>') : ''}") 0 0, auto`
    }
    return TOOL_CURSORS[tool] || 'crosshair'
  },

  // --- Shapes ---
  shapes: [],
  currentShape: null,
  lastMousePos: null,

  addShape: (shape) =>
    set((s) => ({ shapes: [...s.shapes, shape] })),

  removeShape: (shape) =>
    set((s) => ({ shapes: s.shapes.filter((sh) => sh !== shape) })),

  setCurrentShape: (shape) => set({ currentShape: shape }),
  setLastMousePos: (pos) => set({ lastMousePos: pos }),

  clearShapes: () => set({ shapes: [], currentShape: null }),

  // --- Undo/Redo ---
  undoStack: [],
  redoStack: [],

  pushUndo: (action) =>
    set((s) => ({
      undoStack: [...s.undoStack, action],
      redoStack: [], // clear redo on new action
    })),

  popUndo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return null
    const action = undoStack[undoStack.length - 1]
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, action],
    }))
    return action
  },

  popRedo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return null
    const action = redoStack[redoStack.length - 1]
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, action],
    }))
    return action
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  // --- Viewport / Zoom ---
  zoom: 1,
  viewBox: { x: 0, y: 0, width: 0, height: 0 },
  translation: { x: 0, y: 0 },
  isPanning: false,
  panStart: null,

  setZoom: (zoom) => set({ zoom: Math.max(0.4, Math.min(30, zoom)) }),
  setViewBox: (vb) => set({ viewBox: vb }),
  setTranslation: (t) => set({ translation: t }),
  setIsPanning: (v) => set({ isPanning: v }),
  setPanStart: (p) => set({ panStart: p }),

  // --- Canvas background ---
  canvasBackground: DEFAULT_CANVAS_BACKGROUNDS.dark,
  canvasBackgrounds: { ...DEFAULT_CANVAS_BACKGROUNDS },
  setCanvasBackground: (color, theme = 'dark') => {
    const resolved = theme === 'light' ? 'light' : 'dark'
    set((state) => ({ canvasBackground: color, canvasBackgrounds: { ...state.canvasBackgrounds, [resolved]: color } }))
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(canvasBackgroundStorageKey(resolved), color) } catch {}
      requestAnimationFrame(() => window.__adaptCanvasContrast?.(color))
    }
  },
  restoreCanvasBackground: (theme) => {
    const resolved = theme === 'light' ? 'light' : 'dark'
    const color = readCanvasBackground(resolved, typeof window === 'undefined' ? null : localStorage)
    set((state) => ({ canvasBackground: color, canvasBackgrounds: { ...state.canvasBackgrounds, [resolved]: color } }))
    if (typeof window !== 'undefined') requestAnimationFrame(() => window.__adaptCanvasContrast?.(color))
  },

  // --- Grid ---
  gridEnabled: false,
  toggleGrid: () => set((s) => {
    const gridEnabled = !s.gridEnabled
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(GRID_STORAGE_KEY, String(gridEnabled)) } catch {}
    }
    return { gridEnabled }
  }),
  hydrateGrid: () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(GRID_STORAGE_KEY)
      if (saved === 'true' || saved === 'false') {
        set({ gridEnabled: saved === 'true' })
      }
    } catch {}
  },

  // --- Rulers ---
  rulersEnabled: false,
  rulerUnit: 'px',
  toggleRulers: () => set((s) => {
    const rulersEnabled = !s.rulersEnabled
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(RULER_STORAGE_KEY, String(rulersEnabled)) } catch {}
    }
    return { rulersEnabled }
  }),
  setRulerUnit: (unit) => {
    const rulerUnit = ['px', 'cm', 'in'].includes(unit) ? unit : 'px'
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(RULER_UNIT_STORAGE_KEY, rulerUnit) } catch {}
    }
    set({ rulerUnit })
  },
  hydrateRulers: () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(RULER_STORAGE_KEY)
      if (saved === 'true' || saved === 'false') {
        set({ rulersEnabled: saved === 'true' })
      }
      const savedUnit = localStorage.getItem(RULER_UNIT_STORAGE_KEY)
      if (['px', 'cm', 'in'].includes(savedUnit)) set({ rulerUnit: savedUnit })
    } catch {}
  },

  // --- Modes ---
  viewMode: false,
  zenMode: false,
  toolLock: false,
  snapToObjects: false,

  toggleViewMode: () => {
    const entering = !get().viewMode
    if (entering) {
      set({ viewMode: true, zenMode: false, activeTool: TOOLS.PAN, activeSidebar: null, selectedShapeSidebar: null })
    } else {
      set({ viewMode: false, activeTool: TOOLS.SELECT, activeSidebar: null })
    }
  },
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode, viewMode: false })),

  // --- Canvas/Docs split layout ---
  // 'canvas' = sketch only, 'split' = side-by-side, 'docs' = doc only
  // Hydrated from localStorage on first store consumption (see
  // hydrateLayoutMode below). Persisted on every change.
  layoutMode: 'canvas',
  setLayoutMode: (mode) => {
    if (!['canvas', 'split', 'docs'].includes(mode)) return
    set({ layoutMode: mode })
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('lixsketch-layout-mode', mode) } catch {}
    }
  },
  hydrateLayoutMode: () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('lixsketch-layout-mode')
      if (saved && ['canvas', 'split', 'docs'].includes(saved)) {
        set({ layoutMode: saved })
      }
    } catch {}
  },
  toggleToolLock: () => set((s) => ({ toolLock: !s.toolLock })),
  toggleSnapToObjects: () => set((s) => ({ snapToObjects: !s.snapToObjects })),

  // --- RoughJS refs (set once after mount) ---
  roughCanvas: null,
  roughGenerator: null,
  setRoughRefs: (canvas, generator) =>
    set({ roughCanvas: canvas, roughGenerator: generator }),
}))

export default useSketchStore
