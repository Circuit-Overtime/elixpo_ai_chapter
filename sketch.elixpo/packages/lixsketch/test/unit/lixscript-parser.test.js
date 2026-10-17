import { describe, expect, it } from 'vitest'

import {
  parseLixScript,
  resolveShapeRefs,
} from '../../src/core/LixScriptParser.js'

describe('LixScriptParser', () => {
  it('parses variables, geometry, and inline properties', () => {
    const result = parseLixScript(`
      $left = 20
      rect card at $left, 30 size 120x60 { fill: "#8b6de0"; rounded: true }
    `)

    expect(result.errors).toEqual([])
    expect(result.variables).toEqual({ left: '20' })
    expect(result.shapes[0]).toMatchObject({
      type: 'rect',
      id: 'card',
      x: 20,
      y: 30,
      width: 120,
      height: 60,
      props: { fill: '#8b6de0', rounded: true },
    })
  })

  it('parses shape-reference connections', () => {
    const result = parseLixScript(`
      rect source at 10, 20 size 100x50
      rect target at 220, 20 size 100x50
      arrow link from source.right to target.left
    `)

    expect(result.errors).toEqual([])
    expect(result.shapes[2]).toMatchObject({
      type: 'arrow',
      id: 'link',
      from: { ref: 'source', side: 'right', offset: 0 },
      to: { ref: 'target', side: 'left', offset: 0 },
    })
  })

  it('resolves deferred positions from earlier shapes', () => {
    const result = parseLixScript(`
      rect first at 10, 20 size 100x50
      rect second at first.right + 25, first.bottom + 10 size 80x40
    `)

    resolveShapeRefs(result.shapes)
    expect(result.shapes[1]).toMatchObject({ x: 135, y: 80 })
  })

  it('returns an empty program for whitespace and comments', () => {
    const result = parseLixScript('  \n // comment only\n\t')

    expect(result).toEqual({ variables: {}, shapes: [], errors: [] })
  })

  it('reports unsupported syntax without throwing', () => {
    expect(() => parseLixScript('paint the canvas')).not.toThrow()
    expect(parseLixScript('paint the canvas').errors).toEqual([
      { line: 1, message: 'Unrecognized syntax: paint the canvas' },
    ])
  })

  it.each([null, undefined, 42, {}])('reports non-string source: %s', (source) => {
    const result = parseLixScript(source)

    expect(result.shapes).toEqual([])
    expect(result.errors).toEqual([
      { line: 0, message: 'LixScript source must be a string' },
    ])
  })

  it('preserves unicode property values', () => {
    const result = parseLixScript('text greeting at 10, 20 size 180x40 { text: "こんにちは 🌿" }')

    expect(result.errors).toEqual([])
    expect(result.shapes[0].props.text).toBe('こんにちは 🌿')
  })

  it('parses a long program in one pass', () => {
    const source = Array.from(
      { length: 2_000 },
      (_, index) => `rect node${index} at ${index}, ${index + 1} size 10x10`,
    ).join('\n')

    const result = parseLixScript(source)
    expect(result.errors).toEqual([])
    expect(result.shapes).toHaveLength(2_000)
    expect(result.shapes.at(-1)).toMatchObject({ id: 'node1999', x: 1999, y: 2000 })
  })
})
