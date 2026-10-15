import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
  measureShapeLabel,
} from '../../src/core/ShapeLabelLayout.js'

describe('shape label layout', () => {
  it('uses a readable default font size', () => {
    expect(DEFAULT_SHAPE_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(18)
  })

  it('grows vertically for intentional newlines', () => {
    const single = measureShapeLabel('first line', 18)
    const multiline = measureShapeLabel('first line\nsecond line\nthird line', 18)

    expect(multiline.lines).toHaveLength(3)
    expect(multiline.requiredHeight).toBeGreaterThan(single.requiredHeight)
  })

  it('grows horizontally for overflowing text', () => {
    const short = measureShapeLabel('short', 18)
    const long = measureShapeLabel('a substantially longer rectangle label', 18)

    expect(long.requiredWidth).toBeGreaterThan(short.requiredWidth)
  })
})
