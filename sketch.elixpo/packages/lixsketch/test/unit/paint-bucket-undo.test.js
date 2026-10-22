import { beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.document = { addEventListener: vi.fn(), getElementById: () => null }
globalThis.window = {}

const {
  clearUndoHistory,
  pushOptionsChangeAction,
  redo,
  undo,
} = await import('../../src/core/UndoRedo.js')

describe('paint bucket undo and redo', () => {
  beforeEach(() => clearUndoHistory())

  it.each([
    ['rectangle', {}],
    ['circle', {}],
    ['freehandStroke', { closedFill: true, outlineStroke: '#222222' }],
  ])('restores fill options for %s', (shapeName, extraOptions) => {
    const oldOptions = { stroke: '#222222', fill: 'transparent', fillStyle: 'none', ...extraOptions }
    const newOptions = { ...oldOptions, fill: '#a98deb', fillStyle: 'dots' }
    const target = { shapeName, options: newOptions, draw: vi.fn() }
    pushOptionsChangeAction(target, oldOptions, newOptions)

    undo()
    expect(target.options).toEqual(oldOptions)

    redo()
    expect(target.options).toEqual(newOptions)
    expect(target.draw).toHaveBeenCalledTimes(2)
  })

  it('restores the frame fields used by its renderer', () => {
    const oldOptions = { stroke: '#555555', fillColor: '#111111', fillStyle: 'transparent' }
    const newOptions = { stroke: '#555555', fillColor: '#a98deb', fillStyle: 'cross-hatch' }
    const frame = {
      shapeName: 'frame',
      options: newOptions,
      fillColor: newOptions.fillColor,
      fillStyle: newOptions.fillStyle,
      draw: vi.fn(),
    }
    pushOptionsChangeAction(frame, oldOptions, newOptions)

    undo()
    expect(frame).toMatchObject({ fillColor: '#111111', fillStyle: 'transparent' })

    redo()
    expect(frame).toMatchObject({ fillColor: '#a98deb', fillStyle: 'cross-hatch' })
  })
})
