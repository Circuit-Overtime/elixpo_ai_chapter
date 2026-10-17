import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeNode(tagName = 'g') {
  const attributes = new Map()
  return {
    tagName,
    children: [],
    parentNode: null,
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute(name) { return attributes.get(name) ?? null },
    getAttributeNS(_namespace, name) { return attributes.get(name) ?? null },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child)
      child.parentNode = null
      return child
    },
    querySelectorAll() { return [] },
    cloneNode() {
      const clone = makeNode(tagName)
      for (const [name, value] of attributes) clone.setAttribute(name, value)
      clone.outerHTML = this.outerHTML
      return clone
    },
    outerHTML: `<${tagName}></${tagName}>`,
  }
}

class BasicShape {
  constructor(shapeName, fields = {}) {
    Object.assign(this, fields)
    this.shapeName = shapeName
    this.shapeID = `${shapeName}-generated`
    this.rotation = this.rotation || 0
    this.group = makeNode('g')
    this.options = fields.options || {}
    globalThis.window.svg.appendChild(this.group)
  }
}

vi.mock('../../src/shapes/Rectangle.js', () => ({
  Rectangle: class extends BasicShape {
    constructor(x, y, width, height, options) {
      super('rectangle', { x, y, width, height, options })
    }
  },
}))

vi.mock('../../src/shapes/Circle.js', () => ({
  Circle: class extends BasicShape {
    constructor(x, y, rx, ry, options) { super('circle', { x, y, rx, ry, options }) }
  },
}))

vi.mock('../../src/shapes/Line.js', () => ({
  Line: class extends BasicShape {
    constructor(startPoint, endPoint, options) {
      super('line', { startPoint: { ...startPoint }, endPoint: { ...endPoint }, options })
    }
  },
}))

vi.mock('../../src/shapes/Arrow.js', () => ({
  Arrow: class extends BasicShape {
    constructor(startPoint, endPoint, options) {
      super('arrow', { startPoint: { ...startPoint }, endPoint: { ...endPoint }, options })
    }
    setStartAttachment(shape) { this.startAttachment = shape }
    setEndAttachment(shape) { this.endAttachment = shape }
  },
}))

vi.mock('../../src/shapes/FreehandStroke.js', () => ({
  FreehandStroke: class extends BasicShape {
    constructor(points, options) { super('freehandStroke', { points, options }) }
  },
}))

vi.mock('../../src/shapes/Frame.js', () => ({
  Frame: class extends BasicShape {
    constructor(x, y, width, height, options) {
      super('frame', { x, y, width, height, options })
      this.frameName = options.frameName
      this.fillStyle = options.fillStyle || 'transparent'
      this.fillColor = options.fillColor || '#1e1e28'
      this.gridSize = options.gridSize || 20
      this.gridColor = options.gridColor || 'rgba(255,255,255,0.06)'
      this.containedShapes = []
      this.clipGroup = makeNode('g')
      window.svg.appendChild(this.clipGroup)
    }
    addShapeToFrame(shape) {
      if (!this.containedShapes.includes(shape)) this.containedShapes.push(shape)
      shape.parentFrame = this
      this.clipGroup.appendChild(shape.group || shape.element)
    }
    draw() {}
    updateClipPath() {}
  },
}))

vi.mock('../../src/shapes/TextShape.js', () => ({ TextShape: class {} }))
vi.mock('../../src/shapes/CodeShape.js', () => ({ CodeShape: class {} }))
vi.mock('../../src/shapes/IconShape.js', () => ({ IconShape: class {} }))
vi.mock('../../src/shapes/ImageShape.js', () => ({
  ImageShape: class extends BasicShape {
    constructor(element) {
      super('image')
      this.element = element
      this.group.appendChild(element)
      this.x = Number(element.getAttribute('x'))
      this.y = Number(element.getAttribute('y'))
      this.width = Number(element.getAttribute('width'))
      this.height = Number(element.getAttribute('height'))
    }
  },
}))
vi.mock('../../src/core/UndoRedo.js', () => ({
  clearUndoHistory: vi.fn(),
  pushCanvasResetAction: vi.fn(),
}))

const serializer = await import('../../src/core/SceneSerializer.js')

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))
}

function makeSvg() {
  const svg = makeNode('svg')
  svg.ownerDocument = { importNode: node => node }
  return svg
}

function makeImageElement(attributes) {
  const element = makeNode('image')
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

describe('SceneSerializer', () => {
  beforeEach(() => {
    const svg = makeSvg()
    globalThis.document = { createElementNS: (_namespace, tagName) => makeNode(tagName) }
    globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type } }
    globalThis.window = {
      svg,
      shapes: [],
      historyStack: [],
      redoStack: [],
      currentViewBox: { x: 4, y: 8, width: 900, height: 600 },
      currentZoom: 1.5,
      dispatchEvent: vi.fn(),
    }
    serializer.resetSessionID()
  })

  afterEach(() => {
    delete globalThis.document
    delete globalThis.CustomEvent
    delete globalThis.window
  })

  it('round-trips styles, z-order, AI provenance, frame attachments, and document links', () => {
    const rectangle = new BasicShape('rectangle', {
      x: 12,
      y: 20,
      width: 160,
      height: 80,
      rotation: 12,
      options: { stroke: '#7255b5', fill: '#d9ccff', strokeWidth: 3, fillStyle: 'solid' },
    })
    rectangle.shapeID = 'rectangle-1'
    rectangle.docBlockIds = ['doc-a', 'doc-b']

    const frame = new BasicShape('frame', {
      x: 0,
      y: 0,
      width: 500,
      height: 300,
      options: { stroke: '#9d85df', strokeWidth: 2 },
    })
    frame.shapeID = 'frame-1'
    frame.frameName = 'Media'
    frame.fillStyle = 'solid'
    frame.fillColor = '#21182f'
    frame.gridSize = 24
    frame.gridColor = '#41355c'
    frame.containedShapes = []

    const imageElement = makeImageElement({
      href: 'https://example.test/generated.webp',
      'data-ai-generated': 'true',
      'data-ai-model': 'flux',
      'data-file-size': '2048',
      'data-storage-provider': 'personal_cloudinary',
      'data-cloudinary-id': 'asset-1',
    })
    const image = {
      shapeName: 'image',
      shapeID: 'image-1',
      x: 40,
      y: 50,
      width: 240,
      height: 160,
      rotation: 3,
      element: imageElement,
      parentFrame: frame,
      docBlockIds: ['doc-image'],
    }
    frame.containedShapes.push(image)

    // Deliberately place the frame between two shapes: load must not move it.
    window.shapes.push(rectangle, frame, image)
    const first = serializer.saveScene('Round trip')

    expect(first.shapes.map(shape => shape.shapeID)).toEqual(['rectangle-1', 'frame-1', 'image-1'])
    expect(serializer.loadScene(first)).toBe(true)
    const second = serializer.saveScene('Round trip')

    expect(second.shapes.map(shape => shape.shapeID)).toEqual(['rectangle-1', 'frame-1', 'image-1'])
    expect(second.shapes[0]).toMatchObject({
      docBlockIds: ['doc-a', 'doc-b'],
      options: { stroke: '#7255b5', fill: '#d9ccff', strokeWidth: 3, fillStyle: 'solid' },
    })
    expect(second.shapes[1]).toMatchObject({
      frameName: 'Media',
      fillStyle: 'solid',
      fillColor: '#21182f',
      containedShapeIDs: ['image-1'],
    })
    expect(second.shapes[2]).toMatchObject({
      parentFrame: 'frame-1',
      docBlockIds: ['doc-image'],
      aiGenerated: true,
      aiModel: 'flux',
      cloudinaryId: 'asset-1',
      storageProvider: 'personal_cloudinary',
    })
  })

  it('loads a version-one fixture without newer optional fields', () => {
    const scene = fixture('legacy-v1-scene.json')

    expect(serializer.validateScene(scene)).toMatchObject({ valid: true, shapeCount: 1 })
    expect(serializer.loadScene(scene)).toBe(true)
    expect(window.shapes[0]).toMatchObject({
      shapeID: 'legacy-rectangle',
      shapeName: 'rectangle',
      x: 40,
      y: 60,
      width: 180,
      height: 90,
    })
    expect(window.currentViewBox).toEqual(scene.viewport)
    expect(window.currentZoom).toBe(1.25)
  })

  it('restores paint-bucket options on a closed freehand shape', () => {
    const freehand = new BasicShape('freehandStroke', {
      points: [[0, 0, 0.5], [80, 0, 0.5], [40, 60, 0.5], [0, 0, 0.5]],
      options: {
        stroke: '#302842',
        outlineStroke: '#302842',
        fill: '#a98deb',
        fillStyle: 'cross-hatch',
        closedFill: true,
        strokeWidth: 2,
      },
    })
    freehand.shapeID = 'closed-freehand-1'
    window.shapes.push(freehand)

    expect(serializer.loadScene(serializer.saveScene('Filled freehand'))).toBe(true)
    expect(serializer.saveScene('Filled freehand').shapes[0]).toMatchObject({
      type: 'freehandStroke',
      options: {
        outlineStroke: '#302842',
        fill: '#a98deb',
        fillStyle: 'cross-hatch',
        closedFill: true,
      },
    })
  })

  it('rejects invalid and corrupted scene data without changing the canvas', () => {
    const existing = new BasicShape('rectangle', { x: 1, y: 2, width: 3, height: 4 })
    window.shapes.push(existing)

    expect(serializer.validateScene(fixture('corrupt-scene.json')).valid).toBe(false)
    expect(serializer.loadScene(fixture('corrupt-scene.json'))).toBe(false)
    expect(serializer.loadScene({ format: 'lixsketch', version: 1, shapes: [null] })).toBe(false)
    expect(window.shapes).toEqual([existing])
  })
})
