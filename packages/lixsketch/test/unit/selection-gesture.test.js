import { describe, expect, it } from 'vitest'
import { createSelectionGestureOwner } from '../../src/core/SelectionGesture.js'

describe('selection gesture ownership', () => {
  it('keeps a drag bound to the exact shape that received pointer-down', () => {
    const owner = createSelectionGestureOwner()
    const first = { shapeName: 'rectangle', shapeID: 'first' }
    const second = { shapeName: 'rectangle', shapeID: 'second' }

    owner.captureShape(first, 7)

    expect(owner.get(7)).toMatchObject({ kind: 'shape', shape: first, shapeName: 'rectangle' })
    expect(owner.get(7).shape).not.toBe(second)
    expect(owner.get(8)).toBeNull()
  })

  it('tracks multi-selection separately and releases only its pointer', () => {
    const owner = createSelectionGestureOwner()
    owner.captureMulti(4)

    expect(owner.get(4)).toMatchObject({ kind: 'multi', pointerId: 4 })
    expect(owner.clear(5)).toBe(false)
    expect(owner.get(4)).not.toBeNull()
    expect(owner.clear(4)).toBe(true)
    expect(owner.get(4)).toBeNull()
  })

  it('supports pointer events without an identifier', () => {
    const owner = createSelectionGestureOwner()
    const shape = { shapeName: 'circle' }
    owner.captureShape(shape)

    expect(owner.get()).toMatchObject({ shape })
    expect(owner.clear()).toBe(true)
  })
})
