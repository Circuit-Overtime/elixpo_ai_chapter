import { afterEach, describe, expect, it } from 'vitest'
import { getThemeForeground, resolveThemeLabelColor } from '../../src/utils/themeColors.js'

afterEach(() => {
  delete globalThis.document
})

describe('theme-owned shape label colors', () => {
  it('uses black labels in the light canvas', () => {
    globalThis.document = { body: { classList: { contains: () => false } } }
    expect(getThemeForeground()).toBe('#000000')
    expect(resolveThemeLabelColor('#e0e0e0')).toBe('#000000')
  })

  it('uses white labels in the dark canvas', () => {
    globalThis.document = { body: { classList: { contains: (name) => name === 'theme-dark' } } }
    expect(getThemeForeground()).toBe('#ffffff')
    expect(resolveThemeLabelColor('#e8e3f3')).toBe('#ffffff')
  })

  it('preserves an explicitly selected label color', () => {
    globalThis.document = { body: { classList: { contains: () => false } } }
    expect(resolveThemeLabelColor('#FF8383')).toBe('#FF8383')
  })
})
