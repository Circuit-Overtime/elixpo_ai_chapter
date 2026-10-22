import { describe, expect, it } from 'vitest'

import {
  isValidExpression,
  parseExpression,
} from '../../src/core/GraphMathParser.js'

describe('GraphMathParser', () => {
  it('parses y expressions with implicit multiplication', () => {
    const fn = parseExpression('y = 2x + 3')

    expect(fn).toBeTypeOf('function')
    expect(fn(4)).toBe(11)
  })

  it('parses named functions and right-associative powers', () => {
    const fn = parseExpression('f(x) = 2 ^ 3 ^ 2')

    expect(fn(0)).toBe(512)
  })

  it('parses functions and constants', () => {
    const fn = parseExpression('sin(x) + cos(x) + pi')

    expect(fn(0)).toBeCloseTo(1 + Math.PI)
  })

  it('returns NaN for division by zero without throwing', () => {
    const fn = parseExpression('1 / (x - 1)')

    expect(() => fn(1)).not.toThrow()
    expect(fn(1)).toBeNaN()
  })

  it.each([null, undefined, 42, '', '   ', '😀'])('rejects empty or unsupported input: %s', (input) => {
    expect(parseExpression(input)).toBeNull()
    expect(isValidExpression(input)).toBe(false)
  })

  it('ignores surrounding whitespace', () => {
    const fn = parseExpression('  \n\t y = sqrt(  x  )  ')

    expect(fn(81)).toBe(9)
  })

  it('handles a long valid expression', () => {
    const input = Array.from({ length: 1_000 }, () => 'x').join(' + ')
    const fn = parseExpression(input)

    expect(fn).toBeTypeOf('function')
    expect(fn(2)).toBe(2_000)
  })
})
