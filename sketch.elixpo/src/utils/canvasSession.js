export const LAST_CANVAS_ID_STORAGE_KEY = 'lixsketch-last-canvas-id'

const CANVAS_ID_PATTERN = /^lx-[a-z0-9]+(?:-[a-z0-9]+)+$/i

export function createCanvasSessionId() {
  return `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function isCanvasSessionId(value) {
  return typeof value === 'string' && value.length <= 128 && CANVAS_ID_PATTERN.test(value)
}

export function rememberCanvasId(canvasId) {
  if (typeof window === 'undefined' || !isCanvasSessionId(canvasId)) return false
  try {
    localStorage.setItem(LAST_CANVAS_ID_STORAGE_KEY, canvasId)
    return true
  } catch {
    return false
  }
}

export function getRememberedCanvasId() {
  if (typeof window === 'undefined') return null
  try {
    const canvasId = localStorage.getItem(LAST_CANVAS_ID_STORAGE_KEY)
    return isCanvasSessionId(canvasId) ? canvasId : null
  } catch {
    return null
  }
}

export function clearRememberedCanvasId(canvasId) {
  if (typeof window === 'undefined') return
  try {
    if (!canvasId || localStorage.getItem(LAST_CANVAS_ID_STORAGE_KEY) === canvasId) {
      localStorage.removeItem(LAST_CANVAS_ID_STORAGE_KEY)
    }
  } catch {}
}

export function hasLocalSavedWorkspace(canvasId) {
  if (typeof window === 'undefined' || !isCanvasSessionId(canvasId)) return false
  try {
    return Boolean(
      localStorage.getItem(`lixsketch-autosave-${canvasId}`) ||
      localStorage.getItem(`lixsketch-doc-autosave-${canvasId}`),
    )
  } catch {
    return false
  }
}

export function hasStoredCanvasKey(canvasId) {
  if (typeof window === 'undefined' || !isCanvasSessionId(canvasId)) return false
  try {
    return Boolean(localStorage.getItem(`lixsketch-enc-key-${canvasId}`))
  } catch {
    return false
  }
}
