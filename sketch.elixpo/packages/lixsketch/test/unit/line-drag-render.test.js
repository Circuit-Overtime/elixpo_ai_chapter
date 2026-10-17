import { describe, expect, it, vi } from 'vitest'

function node(name) {
  return {
    name,
    children: [],
    parentNode: null,
    attributes: new Map(),
    style: {},
    dataset: {},
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
const renderLine = vi.fn(() => node('rough-line'))
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
globalThis.rough = { svg: () => ({ line: renderLine }) }
globalThis.requestAnimationFrame = callback => {
  const id = nextFrame++
  animationFrames.set(id, callback)
  return id
}
globalThis.cancelAnimationFrame = id => animationFrames.delete(id)

const { Line } = await import('../../src/shapes/Line.js')

describe('line drag rendering', () => {
  it('uses a stable rough seed and coalesces moves into one frame', () => {
    const line = new Line({ x: 10, y: 20 }, { x: 100, y: 80 }, { roughness: 2 })
    const update = vi.spyOn(line, 'updateLineElement')

    line.move(5, 4)
    line.move(3, 2)

    expect(line.options.seed).toBeGreaterThan(0)
    expect(animationFrames.size).toBe(1)
    expect(update).not.toHaveBeenCalled()

    const callback = [...animationFrames.values()][0]
    animationFrames.clear()
    callback()

    expect(update).toHaveBeenCalledTimes(1)
    expect(line.startPoint).toEqual({ x: 18, y: 26 })
    expect(line.endPoint).toEqual({ x: 108, y: 86 })
  })
})
