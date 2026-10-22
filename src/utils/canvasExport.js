import { exportBackground } from '@/utils/canvasBackgrounds'

const CLEANUP_SELECTOR = [
  '[data-selection]',
  '.selection-handle',
  '.resize-handle',
  '.rotation-handle',
  '.anchor',
  '.rotate-anchor',
  '.resize-anchor',
  '.rotation-anchor',
  '.selection-outline',
].join(', ')

function normalizedColor(value) {
  if (!value) return ''
  const color = String(value).trim().toLowerCase().replace(/\s+/g, '')
  if (color === 'white' || color === '#fff') return '#ffffff'
  if (color === 'black' || color === '#000') return '#000000'
  if (color === 'rgb(255,255,255)') return '#ffffff'
  if (color === 'rgb(0,0,0)') return '#000000'
  return color
}

function adaptThemeDefaults(svg, currentTheme, targetTheme) {
  if (!targetTheme || currentTheme === targetTheme) return

  const fromColors = targetTheme === 'dark'
    ? new Set(['#000000', '#1a1a20', '#1a1a2e'])
    : new Set(['#ffffff'])
  const replacement = targetTheme === 'dark' ? '#ffffff' : '#1a1a2e'

  svg.querySelectorAll('*').forEach((element) => {
    for (const attribute of ['fill', 'stroke', 'color']) {
      if (fromColors.has(normalizedColor(element.getAttribute(attribute)))) {
        element.setAttribute(attribute, replacement)
      }
      if (fromColors.has(normalizedColor(element.style?.[attribute]))) {
        element.style[attribute] = replacement
      }
    }
  })
}

export function getExportBackground(bgMode, currentTheme, canvasBackground) {
  return exportBackground(bgMode, currentTheme, canvasBackground)
}

/**
 * Clone the visible canvas for export without mutating the live scene.
 * Dark/light exports adapt theme-owned black/white strokes. Transparent
 * exports deliberately retain the canvas' current shape colors.
 */
export function createExportSVG(bgMode, currentTheme, canvasBackground) {
  const source = window.svg
  if (!source) return null

  const clone = source.cloneNode(true)
  clone.querySelectorAll(CLEANUP_SELECTOR).forEach((element) => element.remove())

  // The live SVG has a CSS background. It otherwise paints over the chosen
  // export background and prevents a genuinely transparent export.
  clone.style.background = 'none'
  clone.style.backgroundColor = 'transparent'

  // Grid is viewport UI, not scene content. "None" must contain shapes only.
  clone.querySelectorAll('[fill="url(#grid-large)"]').forEach((element) => element.remove())

  const targetTheme = bgMode === 'dark' || bgMode === 'light' ? bgMode : null
  adaptThemeDefaults(clone, currentTheme, targetTheme)

  const background = getExportBackground(bgMode, currentTheme, canvasBackground)
  if (background) {
    const viewBox = source.viewBox.baseVal
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('data-export-background', bgMode)
    rect.setAttribute('x', viewBox.x)
    rect.setAttribute('y', viewBox.y)
    rect.setAttribute('width', viewBox.width)
    rect.setAttribute('height', viewBox.height)
    rect.setAttribute('fill', background)
    clone.insertBefore(rect, clone.firstChild)
  }

  return clone
}

export function renderExportCanvas(svg, scale = 1) {
  return new Promise((resolve, reject) => {
    const viewBox = window.svg?.viewBox?.baseVal
    if (!viewBox || !svg) {
      reject(new Error('Canvas is not ready for export'))
      return
    }

    const width = Math.max(1, Math.ceil(viewBox.width * scale))
    const height = Math.max(1, Math.ceil(viewBox.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      reject(new Error('Unable to allocate the export canvas'))
      return
    }

    // PNG is encoded directly from these full-resolution pixels. No resize,
    // JPEG conversion, quality reduction, or image compression helper is used.
    // Give the SVG an explicit intrinsic size before loading it as an image.
    // Without this, browsers can rasterize the CSS-sized SVG at 300x150 and
    // enlarge that bitmap, defeating a high-resolution export.
    svg.setAttribute('width', width)
    svg.setAttribute('height', height)
    svg.style.width = `${width}px`
    svg.style.height = `${height}px`
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    const markup = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      context.drawImage(image, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to render the canvas export'))
    }
    image.src = url
  })
}

export function canvasToLosslessPNG(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to encode the lossless PNG'))
    }, 'image/png')
  })
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
