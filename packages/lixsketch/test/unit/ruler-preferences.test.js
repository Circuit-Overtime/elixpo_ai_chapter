import { beforeEach, describe, expect, it } from 'vitest'

import {
  convertRulerValue,
  formatRulerValue,
  normalizeRulerUnit,
} from '../../src/react/components/canvas/rulerUnits.js'

const values = new Map()
globalThis.window = {}
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
}

const { default: useSketchStore } = await import('../../src/react/store/useSketchStore.js')

describe('ruler units and preferences', () => {
  beforeEach(() => {
    values.clear()
    useSketchStore.setState({ rulersEnabled: false, rulerUnit: 'px' })
  })

  it('converts canvas pixels to physical CSS units', () => {
    expect(convertRulerValue(96, 'in')).toBe(1)
    expect(convertRulerValue(96, 'cm')).toBeCloseTo(2.54)
    expect(formatRulerValue(96, 'in', true)).toBe('1 in')
    expect(formatRulerValue(96, 'cm', true)).toBe('2.54 cm')
  })

  it('keeps pixel labels compact and rejects unsupported units', () => {
    expect(formatRulerValue(12_000, 'px')).toBe('12k')
    expect(normalizeRulerUnit('meters')).toBe('px')
  })

  it('persists the ruler toggle and unit', () => {
    useSketchStore.getState().toggleRulers()
    useSketchStore.getState().setRulerUnit('cm')

    expect(localStorage.getItem('lixsketch-rulers-enabled')).toBe('true')
    expect(localStorage.getItem('lixsketch-ruler-unit')).toBe('cm')
  })

  it('hydrates the saved ruler state after a reload', () => {
    localStorage.setItem('lixsketch-rulers-enabled', 'true')
    localStorage.setItem('lixsketch-ruler-unit', 'in')

    useSketchStore.getState().hydrateRulers()

    expect(useSketchStore.getState()).toMatchObject({ rulersEnabled: true, rulerUnit: 'in' })
  })
})
