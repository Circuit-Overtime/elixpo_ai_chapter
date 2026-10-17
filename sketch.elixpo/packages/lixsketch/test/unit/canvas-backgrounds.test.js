import { describe, expect, it } from 'vitest'
import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUNDS,
  canvasBackgroundStorageKey,
  readCanvasBackground,
} from '../../src/react/utils/canvasBackgrounds.js'
import { exportBackground } from '../../../../src/utils/canvasBackgrounds.js'

describe('canvas background palettes', () => {
  it('starts the light palette with a true white canvas', () => {
    expect(CANVAS_BACKGROUNDS.light.map(({ color }) => color)).toEqual([
      '#FFFFFF', '#F6DBC0', '#F5EED2', '#F5F2ED', '#F5DABF',
    ])
  })

  it('keeps the established dark palette unchanged', () => {
    expect(CANVAS_BACKGROUNDS.dark.map(({ color }) => color)).toEqual([
      '#000000', '#161718', '#15111f', '#181605', '#1B1615',
    ])
  })

  it('restores independent valid choices for light and dark themes', () => {
    const values = new Map([
      [canvasBackgroundStorageKey('light'), '#FFFFFF'],
      [canvasBackgroundStorageKey('dark'), '#181605'],
    ])
    const storage = { getItem: (key) => values.get(key) ?? null }
    expect(readCanvasBackground('light', storage)).toBe('#FFFFFF')
    expect(readCanvasBackground('dark', storage)).toBe('#181605')
  })

  it('rejects stale palette values and uses readable defaults', () => {
    const storage = { getItem: () => '#ff00ff' }
    expect(readCanvasBackground('light', storage)).toBe(DEFAULT_CANVAS_BACKGROUNDS.light)
    expect(readCanvasBackground('dark', storage)).toBe(DEFAULT_CANVAS_BACKGROUNDS.dark)
  })

  it('migrates the former warm light default to white', () => {
    const values = new Map([[canvasBackgroundStorageKey('light'), '#F5F2ED']])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    expect(readCanvasBackground('light', storage)).toBe('#FFFFFF')
    expect(readCanvasBackground('light', storage)).toBe('#FFFFFF')
  })

  it('allows the former default to be selected after migration', () => {
    const values = new Map([
      [canvasBackgroundStorageKey('light'), '#F5F2ED'],
      ['lixsketch-canvas-light-default-v2', '1'],
    ])
    const storage = { getItem: (key) => values.get(key) ?? null }
    expect(readCanvasBackground('light', storage)).toBe('#F5F2ED')
  })

  it('uses the selected canvas color for matching-theme exports', () => {
    expect(exportBackground('light', 'light', '#FBE4DB')).toBe('#FBE4DB')
    expect(exportBackground('dark', 'dark', '#181605')).toBe('#181605')
    expect(exportBackground('none', 'light', '#FBE4DB')).toBeNull()
    expect(exportBackground('dark', 'light', '#FBE4DB')).toBe(DEFAULT_CANVAS_BACKGROUNDS.dark)
  })
})
