import { describe, expect, it } from 'vitest'
import { canvasToLocal, localToCanvas } from '../../src/core/CanvasSpace.js'
import {
  getSelectionChromeMetrics,
  SELECTION_CHROME,
  syncSelectionChromeToZoom,
} from '../../src/core/ScreenSpaceControls.js'

describe('canvas-space controls', () => {
  it('maps translated and rotated anchor points without viewport CTM data', () => {
    const transform = { x: 100, y: 50, rotation: 90, centerX: 20, centerY: 10 }
    expect(localToCanvas({ x: 40, y: 10 }, transform).x).toBeCloseTo(120, 10)
    expect(localToCanvas({ x: 40, y: 10 }, transform).y).toBeCloseTo(80, 10)
  })

  it('round-trips pointer coordinates through a rotated shape', () => {
    const transform = { x: -240, y: 180, rotation: 37, centerX: 75, centerY: 45 }
    const local = { x: 151, y: -8 }
    const restored = canvasToLocal(localToCanvas(local, transform), transform)
    expect(restored.x).toBeCloseTo(local.x, 10)
    expect(restored.y).toBeCloseTo(local.y, 10)
  })

  it('does not apply viewport pan or zoom a second time', () => {
    const transform = { x: 30, y: 40, rotation: 0, centerX: 50, centerY: 25 }
    const anchor = localToCanvas({ x: 100, y: 50 }, transform)
    expect(anchor).toEqual({ x: 130, y: 90 })
    expect(canvasToLocal(anchor, transform)).toEqual({ x: 100, y: 50 })
  })
})

describe('selection chrome', () => {
  it.each([0.25, 0.5, 1, 2, 4])('keeps controls screen-sized at %sx zoom', (zoom) => {
    const metrics = getSelectionChromeMetrics(zoom)

    expect(metrics.handleSize * zoom).toBeCloseTo(SELECTION_CHROME.handleSize)
    expect(metrics.rotationRadius * zoom).toBeCloseTo(SELECTION_CHROME.rotationRadius)
    expect(metrics.rotationGap * zoom).toBeCloseTo(SELECTION_CHROME.rotationGap)
    expect(metrics.outlineWidth).toBe(SELECTION_CHROME.outlineWidth)
    expect(metrics.outlineDash).toBe(SELECTION_CHROME.outlineDash)
  })

  it('guards against invalid zoom values', () => {
    expect(getSelectionChromeMetrics(0).handleSize).toBe(SELECTION_CHROME.handleSize)
    expect(getSelectionChromeMetrics(Number.NaN).rotationRadius).toBe(SELECTION_CHROME.rotationRadius)
  })

  it('resizes an existing handle around its fixed canvas position', () => {
    const attributes = new Map([
      ['x', '95'],
      ['y', '45'],
      ['width', '10'],
      ['height', '10'],
    ])
    const handle = {
      tagName: 'rect',
      getAttribute: (name) => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
      matches: () => false,
    }
    const root = {
      querySelectorAll: (selector) => selector.includes('resize-handle') ? [handle] : [],
    }
    const previousWindow = globalThis.window
    globalThis.window = { currentZoom: 2 }

    try {
      syncSelectionChromeToZoom(root)
    } finally {
      globalThis.window = previousWindow
    }

    expect(Number(attributes.get('x'))).toBeCloseTo(97.5)
    expect(Number(attributes.get('y'))).toBeCloseTo(47.5)
    expect(Number(attributes.get('width'))).toBeCloseTo(5)
    expect(Number(attributes.get('height'))).toBeCloseTo(5)
    expect(Number(attributes.get('stroke-width'))).toBe(SELECTION_CHROME.handleStrokeWidth)
    expect(attributes.get('vector-effect')).toBe('non-scaling-stroke')
  })
})
