import { beforeEach, describe, expect, it, vi } from 'vitest'

function node(name) {
  return {
    name,
    children: [],
    parentNode: null,
    appendChild(child) {
      child.parentNode?.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child)
      child.parentNode = null
      return child
    },
    remove() { this.parentNode?.removeChild(this) },
  }
}

const defs = node('defs')
const svgNode = node('svg')
svgNode.querySelector = selector => selector === 'defs' ? defs : null
svgNode.insertBefore = child => svgNode.appendChild(child)
svgNode.appendChild(defs)

globalThis.document = {
  addEventListener: vi.fn(),
  getElementById: () => null,
  createElementNS: (_namespace, name) => node(name),
}
globalThis.window = {}
globalThis.svg = svgNode
globalThis.shapes = []
globalThis.currentShape = null

const {
  clearUndoHistory,
  beginUndoBatch,
  captureFrameChildStates,
  endUndoBatch,
  pushCreateAction,
  pushDeleteAction,
  pushFrameAttachmentAction,
  pushTransformAction,
  rebindUndoHistory,
  redo,
  setTextReferences,
  undo,
} = await import('../../src/core/UndoRedo.js')
setTextReferences(null, null, svgNode)

function rectangle(id, x, y) {
  const group = node(`${id}-group`)
  svgNode.appendChild(group)
  return {
    shapeID: id,
    shapeName: 'rectangle',
    x,
    y,
    width: 40,
    height: 30,
    rotation: 0,
    group,
    parentFrame: null,
    draw: vi.fn(),
    removeSelection: vi.fn(),
  }
}

function frame(id) {
  const group = node(`${id}-group`)
  const clipGroup = node(`${id}-clip-group`)
  const clipPath = node(`${id}-clip-path`)
  svgNode.appendChild(group)
  svgNode.appendChild(clipGroup)
  defs.appendChild(clipPath)
  return {
    shapeID: id,
    shapeName: 'frame',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    rotation: 0,
    group,
    clipGroup,
    clipPath,
    containedShapes: [],
    draw: vi.fn(),
    updateClipPath: vi.fn(),
    removeSelection: vi.fn(),
    addShapeToFrame(shape) {
      if (!this.containedShapes.includes(shape)) this.containedShapes.push(shape)
      shape.parentFrame = this
      this.clipGroup.appendChild(shape.group)
    },
    removeShapeFromFrame(shape) {
      this.containedShapes = this.containedShapes.filter(candidate => candidate !== shape)
      shape.parentFrame = null
      svgNode.appendChild(shape.group)
    },
  }
}

function sceneState() {
  return shapes.map(shape => ({
    id: shape.shapeID,
    x: shape.x,
    y: shape.y,
    parent: shape.parentFrame?.shapeID || null,
  }))
}

describe('UndoRedo regressions for recent tools', () => {
  beforeEach(() => {
    clearUndoHistory()
    shapes.length = 0
    currentShape = null
    window.multiSelection = null
    for (const child of [...svgNode.children]) if (child !== defs) svgNode.removeChild(child)
    for (const child of [...defs.children]) defs.removeChild(child)
  })

  it('restores frame creation and its initial attachments as one action', () => {
    const child = rectangle('child', 20, 30)
    const targetFrame = frame('frame')
    shapes.push(child, targetFrame)
    targetFrame.addShapeToFrame(child)
    const created = sceneState()
    pushCreateAction(targetFrame, { frameCreation: true, containedShapes: [child] })

    undo()
    expect(sceneState()).toEqual([{ id: 'child', x: 20, y: 30, parent: null }])

    redo()
    expect(sceneState()).toEqual(created)
    expect(targetFrame.containedShapes).toEqual([child])
    expect(child.group.parentNode).toBe(targetFrame.clipGroup)
  })

  it('undoes and redoes both new and fallback frame attachments', () => {
    const child = rectangle('child', 20, 30)
    const oldFrame = frame('old-frame')
    const newFrame = frame('new-frame')
    shapes.push(child, oldFrame, newFrame)
    oldFrame.addShapeToFrame(child)
    oldFrame.removeShapeFromFrame(child)
    newFrame.addShapeToFrame(child)
    pushFrameAttachmentAction(newFrame, child, 'attach', oldFrame)

    undo()
    expect(child.parentFrame).toBe(oldFrame)
    expect(oldFrame.containedShapes).toEqual([child])
    expect(newFrame.containedShapes).toEqual([])

    redo()
    expect(child.parentFrame).toBe(newFrame)
    expect(newFrame.containedShapes).toEqual([child])
    expect(oldFrame.containedShapes).toEqual([])
  })

  it('undoes and redoes an initial attachment from the canvas', () => {
    const child = rectangle('child', 20, 30)
    const targetFrame = frame('frame')
    shapes.push(child, targetFrame)
    targetFrame.addShapeToFrame(child)
    pushFrameAttachmentAction(targetFrame, child, 'attach')

    undo()
    expect(child.parentFrame).toBeNull()
    expect(child.group.parentNode).toBe(svgNode)

    redo()
    expect(child.parentFrame).toBe(targetFrame)
    expect(child.group.parentNode).toBe(targetFrame.clipGroup)
  })

  it('returns lasso-moved shapes to the exact before and after states', () => {
    const first = rectangle('first', 10, 15)
    const second = rectangle('second', 80, 45)
    shapes.push(first, second)
    const before = sceneState()
    const moves = [
      [first, { x: 10, y: 15, width: 40, height: 30, rotation: 0 }, { x: 35, y: 55, width: 40, height: 30, rotation: 0 }],
      [second, { x: 80, y: 45, width: 40, height: 30, rotation: 0 }, { x: 105, y: 85, width: 40, height: 30, rotation: 0 }],
    ]
    const batch = beginUndoBatch()
    for (const [shape, oldState, newState] of moves) {
      Object.assign(shape, newState)
      pushTransformAction(shape, oldState, newState)
    }
    endUndoBatch(batch, 'lasso-move')
    const after = sceneState()

    undo()
    expect(sceneState()).toEqual(before)

    redo()
    expect(sceneState()).toEqual(after)
  })

  it('keeps local undo attached after a collaboration scene reload', () => {
    const original = rectangle('shared-shape', 10, 15)
    shapes.push(original)
    original.x = 80
    pushTransformAction(
      original,
      { x: 10, y: 15, width: 40, height: 30, rotation: 0 },
      { x: 80, y: 15, width: 40, height: 30, rotation: 0 },
    )

    const reloaded = rectangle('shared-shape', 80, 15)
    shapes.splice(0, 1, reloaded)
    rebindUndoHistory(shapes)
    undo()

    expect(reloaded.x).toBe(10)
    expect(original.x).toBe(80)
  })

  it('restores lasso-deleted shapes in their exact z-order and redoes deletion', () => {
    const first = rectangle('first', 10, 15)
    const second = rectangle('second', 80, 45)
    shapes.push(first, second)
    const before = sceneState()
    const batch = beginUndoBatch()
    for (const target of [second, first]) {
      const index = shapes.indexOf(target)
      shapes.splice(index, 1)
      target.group.remove()
      pushDeleteAction(target, { shapeIndex: index })
    }
    endUndoBatch(batch, 'lasso-delete')
    expect(shapes).toEqual([])

    undo()
    expect(sceneState()).toEqual(before)

    redo()
    expect(shapes).toEqual([])
  })

  it('restores frame membership and geometry for one batched lasso move', () => {
    const child = rectangle('child', 20, 30)
    const sibling = rectangle('sibling', 140, 60)
    const targetFrame = frame('target-frame')
    shapes.push(child, sibling, targetFrame)
    const oldState = { x: 20, y: 30, width: 40, height: 30, rotation: 0, parentFrame: null }
    const newState = { x: 90, y: 110, width: 40, height: 30, rotation: 0, parentFrame: targetFrame }
    const siblingOldState = { x: 140, y: 60, width: 40, height: 30, rotation: 0, parentFrame: null }
    const siblingNewState = { x: 170, y: 100, width: 40, height: 30, rotation: 0, parentFrame: null }

    const batch = beginUndoBatch()
    Object.assign(child, newState)
    targetFrame.addShapeToFrame(child)
    pushTransformAction(child, oldState, newState)
    Object.assign(sibling, siblingNewState)
    pushTransformAction(sibling, siblingOldState, siblingNewState)
    const groupedAction = endUndoBatch(batch, 'lasso-move')
    expect(groupedAction.actions.map(action => action.type)).toEqual(['transform', 'transform'])
    expect(groupedAction.actions[0].oldPos).toMatchObject({ x: 20, y: 30 })

    undo()
    expect(child.x).toBe(20)
    expect(child.y).toBe(30)
    expect(child.parentFrame).toBeNull()
    expect(child.group.parentNode).toBe(svgNode)
    expect(sibling.x).toBe(140)
    expect(sibling.y).toBe(60)

    redo()
    expect(child.x).toBe(90)
    expect(child.y).toBe(110)
    expect(child.parentFrame).toBe(targetFrame)
    expect(child.group.parentNode).toBe(targetFrame.clipGroup)
    expect(sibling.x).toBe(170)
    expect(sibling.y).toBe(100)
  })

  it('restores a batched deleted child to its frame index', () => {
    const first = rectangle('first', 10, 15)
    const second = rectangle('second', 80, 45)
    const targetFrame = frame('target-frame')
    shapes.push(first, second, targetFrame)
    targetFrame.addShapeToFrame(first)
    targetFrame.addShapeToFrame(second)

    const batch = beginUndoBatch()
    for (const target of [second, first]) {
      const shapeIndex = shapes.indexOf(target)
      const frameIndex = targetFrame.containedShapes.indexOf(target)
      targetFrame.removeShapeFromFrame(target)
      shapes.splice(shapeIndex, 1)
      target.group.remove()
      pushDeleteAction(target, { shapeIndex, parentFrame: targetFrame, frameIndex })
    }
    endUndoBatch(batch, 'lasso-delete')

    undo()
    expect(targetFrame.containedShapes).toEqual([first, second])
    expect(first.parentFrame).toBe(targetFrame)
    expect(second.parentFrame).toBe(targetFrame)

    redo()
    expect(targetFrame.containedShapes).toEqual([])
    expect(shapes).toEqual([targetFrame])
  })

  it('restores exact child geometry when a Mermaid frame is transformed', () => {
    const child = rectangle('child', 20, 30)
    const connector = {
      shapeID: 'connector',
      shapeName: 'arrow',
      startPoint: { x: 40, y: 60 },
      endPoint: { x: 180, y: 140 },
      controlPoint1: { x: 80, y: 70 },
      controlPoint2: { x: 140, y: 130 },
      rotation: 0,
      group: node('connector-group'),
      draw: vi.fn(),
    }
    svgNode.appendChild(connector.group)
    const targetFrame = frame('mermaid-frame')
    targetFrame.addShapeToFrame(child)
    targetFrame.addShapeToFrame(connector)
    shapes.push(targetFrame, child, connector)

    const oldFrame = {
      x: targetFrame.x,
      y: targetFrame.y,
      width: targetFrame.width,
      height: targetFrame.height,
      rotation: targetFrame.rotation,
      containedShapes: captureFrameChildStates(targetFrame),
    }

    Object.assign(targetFrame, { x: 50, y: 40, width: 500, height: 360, rotation: 18 })
    Object.assign(child, { x: 85, y: 95, width: 75, height: 54, rotation: 18 })
    connector.startPoint = { x: 110, y: 150 }
    connector.endPoint = { x: 360, y: 280 }
    connector.controlPoint1 = { x: 180, y: 170 }
    connector.controlPoint2 = { x: 300, y: 250 }
    const newFrame = { x: 50, y: 40, width: 500, height: 360, rotation: 18 }
    pushTransformAction(targetFrame, oldFrame, newFrame)

    undo()
    expect(child).toMatchObject({ x: 20, y: 30, width: 40, height: 30, rotation: 0 })
    expect(connector.startPoint).toEqual({ x: 40, y: 60 })
    expect(connector.endPoint).toEqual({ x: 180, y: 140 })
    expect(connector.controlPoint1).toEqual({ x: 80, y: 70 })
    expect(connector.controlPoint2).toEqual({ x: 140, y: 130 })

    redo()
    expect(child).toMatchObject({ x: 85, y: 95, width: 75, height: 54, rotation: 18 })
    expect(connector.startPoint).toEqual({ x: 110, y: 150 })
    expect(connector.endPoint).toEqual({ x: 360, y: 280 })
  })

  it('undoes and redoes a Mermaid placement as one frame-owned batch', () => {
    const targetFrame = frame('mermaid-frame')
    const first = rectangle('first', 20, 30)
    const second = rectangle('second', 120, 130)
    shapes.push(targetFrame)
    const batch = beginUndoBatch()
    pushCreateAction(targetFrame, { frameCreation: true, containedShapes: [] })
    for (const child of [first, second]) {
      shapes.push(child)
      targetFrame.addShapeToFrame(child)
      pushCreateAction(child)
    }
    endUndoBatch(batch, 'mermaid-flowchart-create')

    undo()
    expect(shapes).toEqual([])

    redo()
    expect(shapes).toEqual([targetFrame, first, second])
    expect(targetFrame.containedShapes).toEqual([first, second])
    expect(first.group.parentNode).toBe(targetFrame.clipGroup)
    expect(second.group.parentNode).toBe(targetFrame.clipGroup)
  })
})
