import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bringForward,
  bringToFront,
  initLayerOrder,
  sendBackward,
  sendToBack,
} from '../../src/core/LayerOrder.js'

function makeShape(name) {
  const parentNode = {
    appendChild: vi.fn(),
    firstChild: null,
    insertBefore: vi.fn(),
  }
  return {
    name,
    group: {
      nextSibling: null,
      parentNode,
    },
  }
}

describe('LayerOrder', () => {
  let back
  let middle
  let front

  beforeEach(() => {
    back = makeShape('back')
    middle = makeShape('middle')
    front = makeShape('front')
    globalThis.window = { shapes: [back, middle, front] }
  })

  afterEach(() => {
    delete globalThis.window
  })

  it('moves a shape forward by one layer', () => {
    bringForward(back)

    expect(window.shapes).toEqual([middle, back, front])
    expect(back.group.parentNode.appendChild).toHaveBeenCalledWith(back.group)
  })

  it('moves a shape backward by one layer', () => {
    sendBackward(front)

    expect(window.shapes).toEqual([back, front, middle])
    expect(front.group.parentNode.insertBefore).toHaveBeenCalledWith(front.group, middle.group)
  })

  it('moves shapes to the front and back boundaries', () => {
    bringToFront(back)
    expect(window.shapes).toEqual([middle, front, back])

    sendToBack(back)
    expect(window.shapes).toEqual([back, middle, front])
  })

  it('exposes the layer helpers for canvas controls', () => {
    initLayerOrder()

    expect(window.__layerOrder).toEqual({
      bringForward,
      sendBackward,
      bringToFront,
      sendToBack,
    })
  })
})
