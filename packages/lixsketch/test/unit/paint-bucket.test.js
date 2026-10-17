import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const undo = vi.hoisted(() => ({ pushOptionsChangeAction: vi.fn() }))
vi.mock('../../src/core/UndoRedo.js', () => undo)

globalThis.window = {
  paintBucketSettings: { fillColor: '#a98deb', fillStyle: 'solid' },
}

const { fillShape, handlePaintBucketDown, isPaintBucketFillable } = await import('../../src/tools/paintBucketTool.js')

function shape(shapeName, options = {}) {
  return {
    shapeName,
    shapeID: `${shapeName}-1`,
    options: { stroke: '#222222', fill: 'transparent', fillStyle: 'none', ...options },
    contains: () => true,
    draw: vi.fn(),
  }
}

describe('paint bucket', () => {
  beforeEach(() => {
    undo.pushOptionsChangeAction.mockClear()
    window.isPaintBucketToolActive = true
    window.paintBucketSettings = { fillColor: '#a98deb', fillStyle: 'hachure' }
    window.dispatchEvent = vi.fn()
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail }
    }
    globalThis.svg = {
      viewBox: { baseVal: { x: 0, y: 0, width: 100, height: 100 } },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }
    globalThis.shapes = []
  })

  afterEach(() => {
    delete globalThis.CustomEvent
    delete globalThis.svg
    delete globalThis.shapes
  })

  it.each(['rectangle', 'circle'])('fills a %s with the selected color and style', (shapeName) => {
    const target = shape(shapeName)

    expect(fillShape(target)).toBe(true)

    expect(target.options).toMatchObject({ fill: '#a98deb', fillStyle: 'hachure' })
    expect(target.draw).toHaveBeenCalledOnce()
    expect(undo.pushOptionsChangeAction).toHaveBeenCalledOnce()
  })

  it('fills an explicitly closed freehand shape while preserving its outline', () => {
    const target = shape('freehandStroke', { closedFill: true, stroke: '#302842' })
    target.points = [[0, 0], [40, 0], [20, 40], [0, 0]]

    expect(fillShape(target)).toBe(true)
    expect(target.options).toMatchObject({
      closedFill: true,
      outlineStroke: '#302842',
      fill: '#a98deb',
      fillStyle: 'hachure',
    })
  })

  it('recognizes a geometrically closed freehand stroke but rejects an open stroke', () => {
    const closed = shape('freehandStroke')
    closed.points = [[0, 0], [50, 0], [50, 50], [0, 50], [2, 1]]
    const open = shape('freehandStroke')
    open.points = [[0, 0], [50, 0], [50, 50]]

    expect(isPaintBucketFillable(closed)).toBe(true)
    expect(isPaintBucketFillable(open)).toBe(false)
  })

  it('fills a frame and records both frame fill fields for undo', () => {
    const target = shape('frame')
    target.fillColor = '#111111'
    target.fillStyle = 'transparent'

    expect(fillShape(target)).toBe(true)

    expect(target).toMatchObject({ fillColor: '#a98deb', fillStyle: 'hachure' })
    expect(undo.pushOptionsChangeAction).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ fillColor: '#111111', fillStyle: 'transparent' }),
      expect.objectContaining({ fillColor: '#a98deb', fillStyle: 'hachure' }),
    )
  })

  it('does not fill through a topmost line into a closed shape underneath', () => {
    const rectangle = shape('rectangle')
    const line = shape('line')
    globalThis.shapes.push(rectangle, line)

    handlePaintBucketDown({ button: 0, clientX: 25, clientY: 25 })

    expect(rectangle.draw).not.toHaveBeenCalled()
    expect(undo.pushOptionsChangeAction).not.toHaveBeenCalled()
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'lixsketch:bucket-not-fillable',
      detail: { shapeID: 'line-1', shapeType: 'line' },
    }))
  })

  it('does not create an undo action when the requested fill already matches', () => {
    const target = shape('circle', { fill: '#a98deb', fillStyle: 'hachure' })

    expect(fillShape(target)).toBe(false)
    expect(undo.pushOptionsChangeAction).not.toHaveBeenCalled()
  })
})
