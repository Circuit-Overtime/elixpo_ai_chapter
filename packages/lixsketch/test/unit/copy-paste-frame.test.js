import { describe, expect, it, vi } from 'vitest'

globalThis.document = {
    addEventListener: vi.fn(),
    getElementById: () => null,
    querySelectorAll: () => [],
    body: { classList: { contains: () => true } },
}
globalThis.window = {}
globalThis.svg = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  querySelector: () => null,
  style: {},
}
globalThis.rough = { svg: () => ({}) }

const copyPaste = await import('../../src/core/CopyPaste.js')
const { getCopyRoots, serializeShape } = copyPaste

function rectangle(id, x, y) {
  return {
    shapeID: id,
    shapeName: 'rectangle',
    x,
    y,
    width: 80,
    height: 40,
    rotation: 0,
    options: { stroke: '#fff' },
    parentFrame: null,
  }
}

function frame(id, children = []) {
  const result = {
    shapeID: id,
    shapeName: 'frame',
    x: 10,
    y: 20,
    width: 320,
    height: 220,
    rotation: 0,
    frameName: 'Mermaid diagram',
    options: { stroke: '#888' },
    containedShapes: children,
    parentFrame: null,
    _diagramType: 'mermaid-flowchart',
  }
  children.forEach(child => { child.parentFrame = result })
  return result
}

describe('frame clipboard trees', () => {
  it('serializes every contained shape with its frame', () => {
    const first = rectangle('first', 40, 60)
    const second = rectangle('second', 180, 140)
    const source = frame('frame', [first, second])

    const data = serializeShape(source)

    expect(data.type).toBe('frame')
    expect(data.diagramType).toBe('mermaid-flowchart')
    expect(data.children.map(child => child.type)).toEqual(['rectangle', 'rectangle'])
    expect(data.children.map(child => child.x)).toEqual([40, 180])
  })

  it('does not duplicate children selected together with their frame', () => {
    const child = rectangle('child', 40, 60)
    const source = frame('frame', [child])

    expect(getCopyRoots([source, child])).toEqual([source])
    expect(getCopyRoots([child])).toEqual([child])
  })
})
