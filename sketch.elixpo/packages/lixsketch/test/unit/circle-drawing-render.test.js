import { describe, expect, it, vi } from 'vitest'

function node(name) {
  return {
    name,
    tagName: name,
    children: [],
    parentNode: null,
    attributes: new Map(),
    style: {},
    get firstChild() { return this.children[0] || null },
    setAttribute(key, value) { this.attributes.set(key, String(value)) },
    getAttribute(key) { return this.attributes.get(key) ?? null },
    appendChild(child) {
      child.parentNode?.removeChild?.(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    insertBefore(child, before) {
      child.parentNode?.removeChild?.(child)
      const index = this.children.indexOf(before)
      this.children.splice(index < 0 ? 0 : index, 0, child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child)
      child.parentNode = null
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: () => null,
  }
}

const svgNode = node('svg')
const renderEllipse = vi.fn(() => node('rough-ellipse'))
const animationFrames = new Map()
let nextFrame = 1

globalThis.document = {
  addEventListener: vi.fn(),
  getElementById: () => null,
  querySelectorAll: () => [],
  createElementNS: (_namespace, name) => node(name),
  body: { classList: { contains: () => true } },
}
globalThis.window = { currentZoom: 1 }
globalThis.svg = svgNode
globalThis.shapes = []
globalThis.currentShape = null
globalThis.currentZoom = 1
globalThis.rough = { svg: () => ({ ellipse: renderEllipse }) }
globalThis.requestAnimationFrame = callback => {
  const id = nextFrame++
  animationFrames.set(id, callback)
  return id
}
globalThis.cancelAnimationFrame = id => animationFrames.delete(id)

const { Circle } = await import('../../src/shapes/Circle.js')

describe('circle drawing render', () => {
  it('coalesces pointer updates and rough-renders only the finished circle', () => {
    const circle = new Circle(50, 50, 0, 0, { stroke: '#fff' })
    circle.isBeingDrawn = true

    circle.rx = 20
    circle.ry = 15
    circle.scheduleDrawingRender()
    circle.rx = 40
    circle.ry = 30
    circle.scheduleDrawingRender()

    expect(circle.options.seed).toBeGreaterThan(0)
    expect(animationFrames.size).toBe(1)
    expect(renderEllipse).toHaveBeenCalledTimes(1)

    const callback = [...animationFrames.values()][0]
    animationFrames.clear()
    callback()

    expect(renderEllipse).toHaveBeenCalledTimes(1)
    expect(circle.element.tagName).toBe('ellipse')
    expect(circle.element.getAttribute('rx')).toBe('40')
    expect(circle.element.getAttribute('ry')).toBe('30')

    circle.finalizeDrawing()

    expect(renderEllipse).toHaveBeenCalledTimes(2)
    expect(circle.isBeingDrawn).toBe(false)
    expect(circle._isLivePreviewElement).toBe(false)
  })

  it('cancels a pending preview without rendering a discarded circle', () => {
    const circle = new Circle(50, 50, 0, 0)
    circle.isBeingDrawn = true
    circle.rx = 10
    circle.ry = 10
    circle.scheduleDrawingRender()

    expect(animationFrames.size).toBe(1)
    circle.cancelDrawingRender()

    expect(animationFrames.size).toBe(0)
    expect(circle.isBeingDrawn).toBe(false)
  })
})
