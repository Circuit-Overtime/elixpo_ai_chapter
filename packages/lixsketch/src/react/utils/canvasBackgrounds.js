export const CANVAS_BACKGROUNDS = {
  light: [
    { color: '#FFFFFF', label: 'menu.canvasBg.white' },
    { color: '#F6DBC0', label: 'menu.canvasBg.cream' },
    { color: '#F5EED2', label: 'menu.canvasBg.paper' },
    { color: '#F5F2ED', label: 'menu.canvasBg.skyTint' },
    { color: '#F5DABF', label: 'menu.canvasBg.sageTint' },
  ],
  dark: [
    { color: '#000000', label: 'menu.canvasBg.black' },
    { color: '#161718', label: 'menu.canvasBg.darkGray' },
    { color: '#15111f', label: 'menu.canvasBg.blueBlack' },
    { color: '#181605', label: 'menu.canvasBg.darkYellow' },
    { color: '#1B1615', label: 'menu.canvasBg.darkBrown' },
  ],
}

export const DEFAULT_CANVAS_BACKGROUNDS = { dark: '#15111f', light: '#FFFFFF' }
const LEGACY_LIGHT_DEFAULT = '#F5F2ED'
const LIGHT_DEFAULT_MIGRATION_KEY = 'lixsketch-canvas-light-default-v2'
export const canvasBackgroundStorageKey = (theme) => `lixsketch-canvas-background-${theme}`

export function readCanvasBackground(theme, storage) {
  const resolved = theme === 'light' ? 'light' : 'dark'
  try {
    const stored = storage?.getItem(canvasBackgroundStorageKey(resolved))
    if (resolved === 'light' && storage?.getItem(LIGHT_DEFAULT_MIGRATION_KEY) !== '1') {
      storage?.setItem?.(LIGHT_DEFAULT_MIGRATION_KEY, '1')
      if (stored?.toLowerCase() === LEGACY_LIGHT_DEFAULT.toLowerCase()) {
        storage?.setItem?.(canvasBackgroundStorageKey(resolved), DEFAULT_CANVAS_BACKGROUNDS.light)
        return DEFAULT_CANVAS_BACKGROUNDS.light
      }
    }
    const match = CANVAS_BACKGROUNDS[resolved].find(({ color }) => color.toLowerCase() === stored?.toLowerCase())
    if (match) return match.color
  } catch {}
  return DEFAULT_CANVAS_BACKGROUNDS[resolved]
}
