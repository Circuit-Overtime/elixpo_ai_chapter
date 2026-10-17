const LEGACY_LABEL_COLORS = new Set(['#e0e0e0', '#e8e3f3'])

export function getThemeForeground() {
  if (typeof document === 'undefined') return '#ffffff'
  return document.body?.classList.contains('theme-dark') ? '#ffffff' : '#000000'
}

export function resolveThemeLabelColor(color) {
  if (!color) return getThemeForeground()
  return LEGACY_LABEL_COLORS.has(String(color).trim().toLowerCase())
    ? getThemeForeground()
    : color
}
