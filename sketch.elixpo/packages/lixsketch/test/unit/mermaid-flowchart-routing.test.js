import { describe, expect, it } from 'vitest'

import { getCanvasFlowchartEdgePoints } from '../../src/core/MermaidFlowchartRenderer.js'

function node(x, y, width = 140, height = 60, type = 'rectangle') {
  return {
    x, y, width, height, type,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

describe('Mermaid flowchart canvas routing', () => {
  it('routes a downward edge from south centre to north centre', () => {
    const { start, end } = getCanvasFlowchartEdgePoints(node(100, 40), node(100, 220))

    expect(start).toEqual({ x: 170, y: 100 })
    expect(end).toEqual({ x: 170, y: 220 })
  })

  it('routes a horizontal edge between the facing sides', () => {
    const { start, end } = getCanvasFlowchartEdgePoints(node(20, 80), node(280, 80))

    expect(start).toEqual({ x: 160, y: 110 })
    expect(end).toEqual({ x: 280, y: 110 })
  })
})
