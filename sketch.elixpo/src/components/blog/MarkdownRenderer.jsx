'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all duration-200 cursor-pointer ${
        copied
          ? 'bg-green-500/20 text-green-400'
          : 'bg-white/5 text-[#6969aa] hover:text-white hover:bg-white/10'
      }`}
    >
      <i className={`bx ${copied ? 'bx-check' : 'bx-copy'} text-xs`} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── RoughJS heading underline (drawn on a canvas element) ─────────────────────
function RoughHeadingLine({ width = 200, color = '#7667a8', roughness = 2 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = 6 * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = '6px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      rc.line(0, 3, width, 3, {
        stroke: color,
        strokeWidth: 1.2,
        roughness,
        bowing: 1,
      })
    }

    draw()
    return () => { mounted = false }
  }, [width, color, roughness])

  return <canvas ref={canvasRef} className="block mt-1.5 mb-3" />
}

function RoughBlockquote({ children }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const h = container.offsetHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = 8 * dpr
      canvas.height = h * dpr
      canvas.style.width = '8px'
      canvas.style.height = h + 'px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      rc.line(4, 2, 4, h - 2, {
        stroke: '#7667a8',
        strokeWidth: 2,
        roughness: 1.8,
        bowing: 0.5,
      })
    }

    const timer = setTimeout(draw, 30)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  return (
    <div ref={containerRef} className="relative flex items-start my-5">
      <canvas ref={canvasRef} className="flex-shrink-0 mr-4" />
      <div className="text-[#a0a0b0] text-sm leading-relaxed italic font-[lixFont]">
        {children}
      </div>
    </div>
  )
}

// ── RoughJS list bullet ───────────────────────────────────────────────────────
function RoughBullet() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = 10 * dpr
      canvas.height = 10 * dpr
      canvas.style.width = '10px'
      canvas.style.height = '10px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      rc.circle(5, 5, 6, {
        stroke: '#7667a8',
        strokeWidth: 1,
        roughness: 2,
        fill: '#7667a8',
        fillStyle: 'solid',
      })
    }

    draw()
    return () => { mounted = false }
  }, [])

  return <canvas ref={canvasRef} className="flex-shrink-0 mt-1.5" />
}

// ── RoughJS LixScript preview (matches actual canvas rendering) ───────────────
function RoughLixScriptCanvas({ parsed }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !parsed) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const { shapes: defs } = parsed

      // Build shape map for resolving arrow refs
      const shapeMap = new Map()
      for (const def of defs) {
        if (def.type !== 'arrow' && def.type !== 'line') shapeMap.set(def.id, def)
      }

      function resolvePoint(pointDef) {
        if (!pointDef) return { x: 0, y: 0 }
        if (pointDef.x !== undefined && pointDef.y !== undefined) return pointDef
        if (pointDef.ref) {
          const target = shapeMap.get(pointDef.ref)
          if (!target) return { x: 0, y: 0 }
          const side = pointDef.side || 'center'
          const offset = pointDef.offset || 0
          const tx = target.x || 0, ty = target.y || 0
          const tw = target.width || 160, th = target.height || 60
          const cx = tx + tw / 2, cy = ty + th / 2
          switch (side) {
            case 'top': return { x: cx + offset, y: ty }
            case 'bottom': return { x: cx + offset, y: ty + th }
            case 'left': return { x: tx, y: cy + offset }
            case 'right': return { x: tx + tw, y: cy + offset }
            default: return { x: cx + offset, y: cy }
          }
        }
        return { x: 0, y: 0 }
      }

      // Check for explicit canvas size via $canvasWidth / $canvasHeight variables
      // Usage in LixScript: $canvasWidth = 800  $canvasHeight = 600
      let explicitW = 0, explicitH = 0
      if (parsed.variables) {
        explicitW = parseFloat(parsed.variables.canvasWidth) || 0
        explicitH = parseFloat(parsed.variables.canvasHeight) || 0
      }

      // Calculate bounds from shapes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const def of defs) {
        if (def.type === 'arrow' || def.type === 'line') {
          const from = resolvePoint(def.from), to = resolvePoint(def.to)
          minX = Math.min(minX, from.x, to.x); minY = Math.min(minY, from.y, to.y)
          maxX = Math.max(maxX, from.x, to.x); maxY = Math.max(maxY, from.y, to.y)
        } else if (def.type !== 'frame') {
          const x = def.x || 0, y = def.y || 0, w = def.width || 160, h = def.height || 60
          minX = Math.min(minX, x); minY = Math.min(minY, y)
          maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h)
        }
      }
      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300 }

      const pad = 60

      // Use explicit dimensions if provided via $canvasWidth / $canvasHeight variables
      const sceneW = explicitW > 0 ? explicitW : (maxX - minX + pad * 2)
      const sceneH = explicitH > 0 ? explicitH : (maxY - minY + pad * 2)

      // Size canvas to fit container width, let height grow as needed
      const containerW = container.offsetWidth
      const scale = Math.min(containerW / sceneW, 1.5)
      const canvasW = Math.max(sceneW * scale, containerW)
      const canvasH = sceneH * scale

      const dpr = window.devicePixelRatio || 1
      canvas.width = canvasW * dpr
      canvas.height = canvasH * dpr
      canvas.style.width = canvasW + 'px'
      canvas.style.height = canvasH + 'px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr * scale, dpr * scale)
      ctx.translate(-minX + pad, -minY + pad)

      const rc = rough.canvas(canvas)

      // Background color for label cutout effect
      const BG = '#0a0a12'
      const LABEL_PAD_X = 6
      const LABEL_PAD_Y = 3

      /**
       * Draw text with background padding. Supports multiline word-wrap
       * when maxWidth is provided (used for labels inside shapes).
       */
      function drawLabel(text, x, y, font, color, align, baseline, maxWidth) {
        ctx.save()
        ctx.font = font
        ctx.textAlign = align || 'center'
        ctx.textBaseline = baseline || 'middle'
        const fontSize = parseInt(font) || 14
        const lineHeight = fontSize * 1.3

        // Word-wrap into lines if maxWidth is set
        let lines
        if (maxWidth && maxWidth > 0) {
          lines = []
          const words = text.split(' ')
          let currentLine = ''
          for (const word of words) {
            const test = currentLine ? currentLine + ' ' + word : word
            if (ctx.measureText(test).width > maxWidth - LABEL_PAD_X * 2 && currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              currentLine = test
            }
          }
          if (currentLine) lines.push(currentLine)
        } else {
          lines = [text]
        }

        const totalTextH = lines.length * lineHeight
        // Find widest line
        let maxLineW = 0
        for (const line of lines) {
          const w = ctx.measureText(line).width
          if (w > maxLineW) maxLineW = w
        }

        // Background rect position
        let bgX = x - maxLineW / 2 - LABEL_PAD_X
        if (align === 'left' || align === 'start') bgX = x - LABEL_PAD_X
        else if (align === 'right' || align === 'end') bgX = x - maxLineW - LABEL_PAD_X

        let bgY = y - totalTextH / 2 - LABEL_PAD_Y
        if (baseline === 'top' || baseline === 'hanging') bgY = y - LABEL_PAD_Y
        else if (baseline === 'bottom') bgY = y - totalTextH - LABEL_PAD_Y

        // Draw background
        ctx.fillStyle = BG
        ctx.fillRect(bgX, bgY, maxLineW + LABEL_PAD_X * 2, totalTextH + LABEL_PAD_Y * 2)

        // Draw each line
        ctx.fillStyle = color
        let startY
        if (baseline === 'top' || baseline === 'hanging') {
          startY = y + lineHeight / 2
        } else if (baseline === 'bottom') {
          startY = y - totalTextH + lineHeight / 2
        } else {
          // middle
          startY = y - totalTextH / 2 + lineHeight / 2
        }
        ctx.textBaseline = 'middle'
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], x, startY + li * lineHeight)
        }
        ctx.restore()
      }

      // Collect images to load async after drawing shapes
      const pendingImages = []

      // Sort shapes by layer for correct z-order:
      // Default layer: frames=-10, lines/arrows=0, rects/circles=10, images=15, text/icons=20
      // Explicit zIndex prop overrides the default
      const defaultLayer = { frame: -10, line: 0, arrow: 0, rect: 10, circle: 10, ellipse: 10, image: 15, text: 20, icon: 20 }
      const sorted = [...defs].sort((a, b) => {
        const zA = (a.props?.zIndex !== undefined ? parseFloat(a.props.zIndex) : defaultLayer[a.type]) || 0
        const zB = (b.props?.zIndex !== undefined ? parseFloat(b.props.zIndex) : defaultLayer[b.type]) || 0
        return zA - zB
      })

      // Draw each shape with RoughJS
      for (const def of sorted) {
        const props = def.props || {}
        const stroke = props.stroke || '#fff'
        const sw = props.strokeWidth || 2
        const fill = props.fill || 'transparent'
        const roughness = 1.5

        switch (def.type) {
          case 'rect': {
            const x = def.x || 0, y = def.y || 0, w = def.width || 160, h = def.height || 60
            rc.rectangle(x, y, w, h, {
              stroke, strokeWidth: sw, roughness, bowing: 0.8,
              fill: fill !== 'transparent' ? fill : undefined,
              fillStyle: fill !== 'transparent' ? 'solid' : undefined,
            })
            if (props.label) {
              drawLabel(props.label, x + w / 2, y + h / 2,
                `${props.labelFontSize || 14}px lixFont, sans-serif`,
                props.labelColor || '#e0e0e0', 'center', 'middle', w)
            }
            break
          }

          case 'circle':
          case 'ellipse': {
            const w = def.width || 80, h = def.height || 80
            const cx = (def.x || 0) + w / 2, cy = (def.y || 0) + h / 2
            rc.ellipse(cx, cy, w, h, {
              stroke, strokeWidth: sw, roughness, bowing: 0.8,
              fill: fill !== 'transparent' ? fill : undefined,
              fillStyle: fill !== 'transparent' ? 'solid' : undefined,
            })
            if (props.label) {
              drawLabel(props.label, cx, cy,
                `${props.labelFontSize || 14}px lixFont, sans-serif`,
                props.labelColor || '#e0e0e0', 'center', 'middle', w * 0.85)
            }
            break
          }

          case 'text': {
            const content = props.content || props.text || 'Text'
            drawLabel(content, def.x || 0, def.y || 0,
              `${props.fontSize || 16}px lixFont, sans-serif`,
              props.color || props.fill || '#fff', 'left', 'top')
            break
          }

          case 'arrow': {
            const from = resolvePoint(def.from)
            const toOrig = resolvePoint(def.to)
            const headLen = 10
            const isCurved = props.curve === 'curved' || props.curve === 'elbow'
            const curveAmount = parseFloat(props.curveAmount) || 50

            if (isCurved) {
              // Compute control point perpendicular to the midpoint
              const midX = (from.x + toOrig.x) / 2
              const midY = (from.y + toOrig.y) / 2
              const adx = toOrig.x - from.x, ady = toOrig.y - from.y
              const len = Math.sqrt(adx * adx + ady * ady) || 1
              // Perpendicular direction (rotate 90°)
              const nx = -ady / len, ny = adx / len
              const cpX = midX + nx * curveAmount
              const cpY = midY + ny * curveAmount

              // Draw curved line
              ctx.save()
              ctx.beginPath()
              ctx.moveTo(from.x, from.y)
              ctx.quadraticCurveTo(cpX, cpY, toOrig.x, toOrig.y)
              ctx.strokeStyle = stroke
              ctx.lineWidth = sw
              if (props.style === 'dashed') ctx.setLineDash([8, 4])
              else if (props.style === 'dotted') ctx.setLineDash([2, 4])
              ctx.stroke()
              ctx.setLineDash([])
              ctx.restore()

              // Arrowhead — tangent at endpoint of quadratic bezier
              // Tangent at t=1: 2*(P2 - CP)
              const tangentX = toOrig.x - cpX
              const tangentY = toOrig.y - cpY
              const tAngle = Math.atan2(tangentY, tangentX)
              const a1x = toOrig.x - headLen * Math.cos(tAngle - Math.PI / 7)
              const a1y = toOrig.y - headLen * Math.sin(tAngle - Math.PI / 7)
              const a2x = toOrig.x - headLen * Math.cos(tAngle + Math.PI / 7)
              const a2y = toOrig.y - headLen * Math.sin(tAngle + Math.PI / 7)

              ctx.save()
              ctx.beginPath()
              ctx.moveTo(toOrig.x, toOrig.y)
              ctx.lineTo(a1x, a1y)
              ctx.lineTo(a2x, a2y)
              ctx.closePath()
              ctx.fillStyle = stroke
              ctx.fill()
              ctx.restore()

              // Label at the curve apex (control point area)
              if (props.label) {
                // Point on quadratic bezier at t=0.5
                const lx = 0.25 * from.x + 0.5 * cpX + 0.25 * toOrig.x
                const ly = 0.25 * from.y + 0.5 * cpY + 0.25 * toOrig.y
                drawLabel(props.label, lx, ly,
                  '11px lixFont, sans-serif',
                  props.labelColor || '#a0a0b0', 'center', 'middle')
              }
            } else {
              // Straight arrow
              const dx = toOrig.x - from.x, dy = toOrig.y - from.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1

              const to = dist < headLen * 2 ? toOrig : {
                x: toOrig.x - (dx / dist) * headLen,
                y: toOrig.y - (dy / dist) * headLen,
              }

              rc.line(from.x, from.y, to.x, to.y, {
                stroke, strokeWidth: sw, roughness: 1.2, bowing: 0.5,
              })

              const angle = Math.atan2(toOrig.y - from.y, toOrig.x - from.x)
              const a1x = toOrig.x - headLen * Math.cos(angle - Math.PI / 7)
              const a1y = toOrig.y - headLen * Math.sin(angle - Math.PI / 7)
              const a2x = toOrig.x - headLen * Math.cos(angle + Math.PI / 7)
              const a2y = toOrig.y - headLen * Math.sin(angle + Math.PI / 7)

              ctx.save()
              ctx.beginPath()
              ctx.moveTo(toOrig.x, toOrig.y)
              ctx.lineTo(a1x, a1y)
              ctx.lineTo(a2x, a2y)
              ctx.closePath()
              ctx.fillStyle = stroke
              ctx.fill()
              ctx.restore()

              if (props.label) {
                const lx = (from.x + toOrig.x) / 2
                const ly = (from.y + toOrig.y) / 2
                drawLabel(props.label, lx, ly,
                  '11px lixFont, sans-serif',
                  props.labelColor || '#a0a0b0', 'center', 'middle')
              }
            }
            break
          }

          case 'line': {
            const from = resolvePoint(def.from)
            const to = resolvePoint(def.to)
            rc.line(from.x, from.y, to.x, to.y, {
              stroke, strokeWidth: sw, roughness: 1.2, bowing: 0.5,
            })
            break
          }

          case 'frame': {
            const x = def.x || 0, y = def.y || 0, w = def.width || 600, h = def.height || 400
            // Draw frame background image if present
            if (props.imageURL) {
              pendingImages.push({ src: props.imageURL, x, y, w, h, fit: props.imageFit || 'cover' })
            }
            // Draw filled background if specified
            if (props.fillStyle === 'solid' && props.fillColor) {
              ctx.save()
              ctx.fillStyle = props.fillColor
              ctx.fillRect(x, y, w, h)
              ctx.restore()
            }
            rc.rectangle(x, y, w, h, {
              stroke: props.stroke || '#555',
              strokeWidth: 1,
              roughness: 1.5,
              bowing: 0.5,
              strokeLineDash: [8, 4],
            })
            if (props.name || def.id) {
              drawLabel(props.name || def.id, x + 10, y - 4,
                '12px lixFont, sans-serif',
                '#888', 'left', 'bottom')
            }
            break
          }

          case 'image': {
            const x = def.x || 0, y = def.y || 0, w = def.width || 200, h = def.height || 200
            const src = props.src || props.href || props.url || ''
            if (src) {
              pendingImages.push({ src, x, y, w, h, fit: props.fit || 'contain' })
            }
            // Draw placeholder border
            rc.rectangle(x, y, w, h, {
              stroke: '#555',
              strokeWidth: 0.8,
              roughness: 1,
              bowing: 0.5,
              strokeLineDash: [4, 4],
            })
            break
          }

          case 'icon': {
            const x = def.x || 0, y = def.y || 0
            const size = def.width || 32
            const color = props.color || props.fill || '#ffffff'
            const svgContent = props.svg || ''
            if (svgContent) {
              // Parse inline SVG and draw paths
              const vbW = parseFloat(props.viewBoxWidth) || 24
              const vbH = parseFloat(props.viewBoxHeight) || 24
              const iconScale = size / Math.max(vbW, vbH)
              ctx.save()
              ctx.translate(x, y)
              ctx.scale(iconScale, iconScale)
              // Render SVG paths via Path2D
              const tempDiv = document.createElement('div')
              tempDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`
              const paths = tempDiv.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')
              for (const el of paths) {
                const d = el.getAttribute('d')
                if (d) {
                  const path = new Path2D(d)
                  const elFill = el.getAttribute('fill')
                  const elStroke = el.getAttribute('stroke')
                  if (elFill && elFill !== 'none') {
                    ctx.fillStyle = (elFill === 'currentColor' || elFill === '#000' || elFill === '#000000') ? color : elFill
                    ctx.fill(path)
                  }
                  if (elStroke && elStroke !== 'none') {
                    ctx.strokeStyle = (elStroke === 'currentColor' || elStroke === '#000' || elStroke === '#000000') ? color : elStroke
                    ctx.lineWidth = parseFloat(el.getAttribute('stroke-width')) || 1.5
                    ctx.stroke(path)
                  }
                  if (!elFill && !elStroke) {
                    ctx.fillStyle = color
                    ctx.fill(path)
                  }
                }
                // Handle <circle>
                if (el.tagName === 'circle') {
                  const cx = parseFloat(el.getAttribute('cx')) || 0
                  const cy = parseFloat(el.getAttribute('cy')) || 0
                  const r = parseFloat(el.getAttribute('r')) || 5
                  ctx.beginPath()
                  ctx.arc(cx, cy, r, 0, Math.PI * 2)
                  const cFill = el.getAttribute('fill')
                  if (cFill !== 'none') {
                    ctx.fillStyle = (!cFill || cFill === 'currentColor') ? color : cFill
                    ctx.fill()
                  }
                  const cStroke = el.getAttribute('stroke')
                  if (cStroke && cStroke !== 'none') {
                    ctx.strokeStyle = (cStroke === 'currentColor') ? color : cStroke
                    ctx.lineWidth = parseFloat(el.getAttribute('stroke-width')) || 1.5
                    ctx.stroke()
                  }
                }
              }
              ctx.restore()
            } else {
              // Fallback: draw a small circle placeholder
              rc.circle(x + (size / 2), y + (size / 2), size * 0.8, {
                stroke: props.color || '#888',
                strokeWidth: 1,
                roughness: 1.5,
              })
            }
            break
          }
        }
      }

      // Load and draw images after all shapes are rendered
      if (pendingImages.length > 0) {
        for (const imgDef of pendingImages) {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            if (!mounted) return
            ctx.save()
            // Clip to the target rect
            ctx.beginPath()
            ctx.rect(imgDef.x, imgDef.y, imgDef.w, imgDef.h)
            ctx.clip()

            if (imgDef.fit === 'cover') {
              // Scale to cover the rect, crop overflow
              const imgAspect = img.width / img.height
              const boxAspect = imgDef.w / imgDef.h
              let drawW, drawH, drawX, drawY
              if (imgAspect > boxAspect) {
                drawH = imgDef.h
                drawW = drawH * imgAspect
                drawX = imgDef.x - (drawW - imgDef.w) / 2
                drawY = imgDef.y
              } else {
                drawW = imgDef.w
                drawH = drawW / imgAspect
                drawX = imgDef.x
                drawY = imgDef.y - (drawH - imgDef.h) / 2
              }
              ctx.drawImage(img, drawX, drawY, drawW, drawH)
            } else if (imgDef.fit === 'fill') {
              ctx.drawImage(img, imgDef.x, imgDef.y, imgDef.w, imgDef.h)
            } else {
              // contain — fit within bounds
              const imgAspect = img.width / img.height
              const boxAspect = imgDef.w / imgDef.h
              let drawW, drawH, drawX, drawY
              if (imgAspect > boxAspect) {
                drawW = imgDef.w
                drawH = drawW / imgAspect
                drawX = imgDef.x
                drawY = imgDef.y + (imgDef.h - drawH) / 2
              } else {
                drawH = imgDef.h
                drawW = drawH * imgAspect
                drawX = imgDef.x + (imgDef.w - drawW) / 2
                drawY = imgDef.y
              }
              ctx.drawImage(img, drawX, drawY, drawW, drawH)
            }
            ctx.restore()
          }
          img.src = imgDef.src
        }
      }
    }

    const timer = setTimeout(draw, 50)
    return () => { mounted = false; clearTimeout(timer) }
  }, [parsed])

  return (
    <div ref={containerRef} className="bg-[#0a0a12] p-6 flex items-center justify-center overflow-auto lixscript-preview">
      <canvas ref={canvasRef} />
    </div>
  )
}

function LixScriptBlock({ code }) {
  const [tab, setTab] = useState('preview')
  const [parsedData, setParsedData] = useState(null)
  const [parseError, setParseError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const { parseLixScript, resolveShapeRefs } = await import('@elixpo/lixsketch/src/core/LixScriptParser')
        const parsed = parseLixScript(code)
        if (cancelled) return

        if (parsed.errors && parsed.errors.length > 0) {
          setParseError(true)
          return
        }

        // Resolve refs so shapes have absolute coordinates
        resolveShapeRefs(parsed.shapes)
        if (!cancelled) setParsedData(parsed)
      } catch {
        if (!cancelled) setParseError(true)
      }
    }

    render()
    return () => { cancelled = true }
  }, [code])

  const showPreview = tab === 'preview' && parsedData && !parseError

  return (
    <div className="my-6 rounded-xl border border-[#8B88E8]/25 overflow-hidden bg-[#0d1117]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#8B88E8]/5 border-b border-[#8B88E8]/15">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer font-[lixFont] ${
              tab === 'preview'
                ? 'bg-[#8B88E8]/45 text-[#8B88E8]'
                : 'text-[#6969aa] hover:text-[#a0a0b0]'
            }`}
          >
            <i className="bx bx-show text-sm" />
            Preview
          </button>
          <button
            onClick={() => setTab('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer font-[lixFont] ${
              tab === 'code'
                ? 'bg-[#8B88E8]/15 text-[#8B88E8]'
                : 'text-[#6969aa] hover:text-[#a0a0b0]'
            }`}
          >
            <i className="bx bx-code-alt text-sm" />
            Code
          </button>
        </div>
        <CopyButton text={code} />
      </div>

      {showPreview && <RoughLixScriptCanvas parsed={parsedData} />}

      {tab === 'preview' && !parsedData && !parseError && (
        <div className="bg-[#0a0a12] p-8 flex items-center justify-center min-h-48">
          <div className="flex items-center gap-2 text-[#6969aa] text-xs font-[lixFont]">
            <div className="w-4 h-4 border border-[#8B88E8]/40 border-t-transparent rounded-full animate-spin" />
            Rendering diagram...
          </div>
        </div>
      )}

      {tab === 'preview' && parseError && (
        <div className="bg-[#0a0a12] p-8 flex items-center justify-center min-h-48">
          <div className="text-center text-[#6969aa] text-xs font-[lixFont]">
            <i className="bx bx-shape-square text-2xl text-[#8B88E8]/30 mb-2" />
            <p>Preview unavailable — switch to Code tab to view the LixScript source.</p>
          </div>
        </div>
      )}

      {tab === 'code' && (
        <pre className="p-4 overflow-x-auto bg-[#171120] max-h-96 overflow-y-auto docs-scroll select-text">
          <code className="text-[#c9d1d9] text-sm font-[lixCode] leading-relaxed">{code}</code>
        </pre>
      )}
    </div>
  )
}

// ── Canvas-style code block (matches #161b22 bg, #30363d border like real canvas) ─
function CodeFenceBlock({ code, language }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const dpr = window.devicePixelRatio || 1
      const w = container.offsetWidth
      const h = container.offsetHeight

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)

      // Hand-drawn border around the code block (like canvas code element)
      rc.rectangle(1, 1, w - 2, h - 2, {
        stroke: '#30363d',
        strokeWidth: 1,
        roughness: 1.2,
        bowing: 0.5,
        fill: '#161b22',
        fillStyle: 'solid',
      })
    }

    const timer = setTimeout(draw, 30)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  return (
    <div ref={containerRef} className="relative my-5 rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#30363d]/50">
          <span className="text-[#6969aa] text-[10px] font-[lixCode] uppercase">{language || 'code'}</span>
          <CopyButton text={code} />
        </div>
        <pre className="p-4 overflow-x-auto max-h-96 overflow-y-auto docs-scroll select-text">
          <code className="text-[#c9d1d9] text-sm font-[lixCode] leading-relaxed">{code}</code>
        </pre>
      </div>
    </div>
  )
}

/**
 * Canvas-styled markdown renderer.
 * Text uses lixFont, backgrounds match the canvas dark theme,
 * headings get RoughJS underlines, code blocks look like canvas code elements.
 */
export default function MarkdownRenderer({ content, canvasStyle }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements = []
  let i = 0
  let skippedTitle = false

  // Use canvas colors when canvasStyle is set
  const textColor = canvasStyle ? 'text-[#c9d1d9]' : 'text-text-muted'
  const headingColor = canvasStyle ? 'text-white' : 'text-text-primary'
  const font = canvasStyle ? 'font-[lixFont]' : ''

  while (i < lines.length) {
    const line = lines[i]

    // Code fence
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```

      const code = codeLines.join('\n')

      if (lang === 'lixscript') {
        elements.push(<LixScriptBlock key={elements.length} code={code} />)
      } else {
        elements.push(<CodeFenceBlock key={elements.length} code={code} language={lang} />)
      }
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      elements.push(
        canvasStyle
          ? <div key={elements.length} className="my-8"><RoughHeadingLine width={600} color="#30363d" roughness={1.5} /></div>
          : <hr key={elements.length} className="border-white/[0.06] my-8" />
      )
      i++
      continue
    }

    // Skip the first H1
    if (line.startsWith('# ') && !skippedTitle) {
      skippedTitle = true
      i++
      continue
    }

    // Headings — with RoughJS underlines in canvas mode
    if (line.startsWith('# ')) {
      elements.push(
        <div key={elements.length} className="mt-10">
          <h1 className={`text-2xl font-semibold ${headingColor} ${font}`}>
            {renderInline(line.slice(2), canvasStyle)}
          </h1>
          {canvasStyle && <RoughHeadingLine width={240} color="#8B88E8" />}
          {!canvasStyle && <div className="mb-4" />}
        </div>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <div key={elements.length} className="mt-8">
          <h2 className={`text-xl font-semibold ${headingColor} ${font}`}>
            {renderInline(line.slice(3), canvasStyle)}
          </h2>
          {canvasStyle && <RoughHeadingLine width={180} color="#D99BF0" roughness={2.5} />}
          {!canvasStyle && <div className="mb-3" />}
        </div>
      )
      i++
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <div key={elements.length} className="mt-6">
          <h3 className={`text-base font-medium ${headingColor} ${font}`}>
            {renderInline(line.slice(4), canvasStyle)}
          </h3>
          {canvasStyle && <RoughHeadingLine width={120} color="#6B6BA0" roughness={3} />}
          {!canvasStyle && <div className="mb-2" />}
        </div>
      )
      i++
      continue
    }

    // Blockquote — with RoughJS left border
    if (line.startsWith('> ')) {
      const quoteLines = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      if (canvasStyle) {
        elements.push(
          <RoughBlockquote key={elements.length}>
            {quoteLines.map((ql, qi) => <p key={qi}>{renderInline(ql, canvasStyle)}</p>)}
          </RoughBlockquote>
        )
      } else {
        elements.push(
          <blockquote key={elements.length} className="border-l-2 border-accent-blue/40 pl-4 my-5 text-text-muted text-sm leading-relaxed italic">
            {quoteLines.map((ql, qi) => <p key={qi}>{renderInline(ql, canvasStyle)}</p>)}
          </blockquote>
        )
      }
      continue
    }

    // Unordered list — with RoughJS bullets
    if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={elements.length} className="list-none space-y-2 my-4">
          {items.map((item, ii) => (
            <li key={ii} className={`flex items-start gap-2.5 ${textColor} text-sm leading-relaxed ${font}`}>
              {canvasStyle ? <RoughBullet /> : <span className="text-accent-blue mt-1.5 text-[6px]">&#x25CF;</span>}
              <span>{renderInline(item, canvasStyle)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className="list-none space-y-2 my-4">
          {items.map((item, ii) => (
            <li key={ii} className={`flex items-start gap-2.5 ${textColor} text-sm leading-relaxed ${font}`}>
              <span className="text-[#8B88E8] text-xs font-medium min-w-4 mt-0.5 font-[lixFont]">{ii + 1}.</span>
              <span>{renderInline(item, canvasStyle)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Table — starts with | ... |
    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      const tableRows = []
      while (i < lines.length && lines[i].trimStart().startsWith('|') && lines[i].trimEnd().endsWith('|')) {
        tableRows.push(lines[i])
        i++
      }

      if (tableRows.length >= 2) {
        const parseRow = (row) =>
          row.split('|').slice(1, -1).map(cell => cell.trim())

        const headers = parseRow(tableRows[0])

        // Check for separator row (|---|---|)
        const hasSeparator = /^\|[\s:-]+\|/.test(tableRows[1])
        const bodyStartIndex = hasSeparator ? 2 : 1

        // Parse alignment from separator
        const alignments = hasSeparator
          ? parseRow(tableRows[1]).map(sep => {
              const trimmed = sep.replace(/\s/g, '')
              if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
              if (trimmed.endsWith(':')) return 'right'
              return 'left'
            })
          : headers.map(() => 'left')

        const bodyRows = tableRows.slice(bodyStartIndex).map(parseRow)

        elements.push(
          <div key={elements.length} className="my-5 overflow-x-auto">
            <table className={`w-full text-sm ${font}`}>
              <thead>
                <tr className="border-b border-[#8B88E8]/20">
                  {headers.map((h, hi) => (
                    <th
                      key={hi}
                      style={{ textAlign: alignments[hi] || 'left' }}
                      className={`py-2 px-3 ${headingColor} font-medium text-left text-xs`}
                    >
                      {renderInline(h, canvasStyle)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-white/[0.04]">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{ textAlign: alignments[ci] || 'left' }}
                        className={`py-2 px-3 ${textColor} text-xs`}
                      >
                        {renderInline(cell, canvasStyle)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Image — ![alt](src)
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      elements.push(
        <div key={elements.length} className="my-6 flex justify-center">
          <img
            src={imgMatch[2]}
            alt={imgMatch[1]}
            className="max-w-full rounded-xl border border-white/[0.06] shadow-lg"
            loading="lazy"
          />
        </div>
      )
      i++
      continue
    }

    // Paragraph — canvas text style
    elements.push(
      <p key={elements.length} className={`${textColor} text-sm leading-relaxed my-3 ${font}`}>
        {renderInline(line, canvasStyle)}
      </p>
    )
    i++
  }

  return <div className="blog-content">{elements}</div>
}

/**
 * Render inline markdown: **bold**, *italic*, `code`, [links](url)
 */
function renderInline(text, canvasStyle) {
  if (!text) return text

  const parts = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold
    let match = remaining.match(/\*\*(.+?)\*\*/)
    if (match && match.index !== undefined) {
      if (match.index > 0) parts.push(remaining.slice(0, match.index))
      parts.push(
        <strong key={key++} className={canvasStyle ? 'text-white font-medium font-[lixFont]' : 'text-text-primary font-medium'}>
          {match[1]}
        </strong>
      )
      remaining = remaining.slice(match.index + match[0].length)
      continue
    }

    // Italic
    match = remaining.match(/\*(.+?)\*/)
    if (match && match.index !== undefined) {
      if (match.index > 0) parts.push(remaining.slice(0, match.index))
      parts.push(
        <em key={key++} className={canvasStyle ? 'text-[#c9d1d9] italic font-[lixFont]' : 'text-text-secondary italic'}>
          {match[1]}
        </em>
      )
      remaining = remaining.slice(match.index + match[0].length)
      continue
    }

    // Inline code — canvas code block mini style
    match = remaining.match(/`(.+?)`/)
    if (match && match.index !== undefined) {
      if (match.index > 0) parts.push(remaining.slice(0, match.index))
      parts.push(
        <code key={key++} className={
          canvasStyle
            ? 'font-[lixCode] text-[#8B88E8] text-xs bg-[#161b22] border border-[#30363d] px-1.5 py-0.5 rounded'
            : 'font-[lixCode] text-accent-blue text-xs bg-accent-blue/10 px-1.5 py-0.5 rounded'
        }>
          {match[1]}
        </code>
      )
      remaining = remaining.slice(match.index + match[0].length)
      continue
    }

    // Link
    match = remaining.match(/\[(.+?)\]\((.+?)\)/)
    if (match && match.index !== undefined) {
      if (match.index > 0) parts.push(remaining.slice(0, match.index))
      parts.push(
        <a key={key++} href={match[2]}
          className={canvasStyle ? 'text-[#8B88E8] hover:underline font-[lixFont]' : 'text-accent-blue hover:underline'}
          target={match[2].startsWith('http') ? '_blank' : undefined}
          rel={match[2].startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {match[1]}
        </a>
      )
      remaining = remaining.slice(match.index + match[0].length)
      continue
    }

    // No more matches
    parts.push(remaining)
    break
  }

  return parts
}
