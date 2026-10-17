/* eslint-disable */
/**
 * LixScript — Programmatic diagram DSL for LixSketch
 *
 * Parses a text-based language into canvas shapes with full control over
 * properties, positions, connections, and grouping.
 *
 * Usage:
 *   const result = parseLixScript(source)
 *   if (result.errors.length) { ... }
 *   renderLixScript(result)
 */

const NS = 'http://www.w3.org/2000/svg'

// ============================================================
// TOKENIZER
// ============================================================

/**
 * Tokenize a LixScript source string into a flat list of tokens.
 * Each token: { type, value, line }
 */
function tokenize(source) {
  const tokens = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNum = i + 1

    // Strip comments
    const commentIdx = raw.indexOf('//')
    const line = commentIdx !== -1 ? raw.slice(0, commentIdx) : raw
    const trimmed = line.trim()
    if (!trimmed) continue

    tokens.push({ type: 'LINE', value: trimmed, line: lineNum })
  }

  return tokens
}

// ============================================================
// PARSER
// ============================================================

/**
 * Parse LixScript source into an AST.
 * Returns { variables, shapes, errors }
 */
export function parseLixScript(source) {
  const variables = {}
  const shapes = []
  const errors = []

  if (typeof source !== 'string') {
    errors.push({ line: 0, message: 'LixScript source must be a string' })
    return { variables, shapes, errors }
  }

  const tokens = tokenize(source)

  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    const line = token.value
    const lineNum = token.line

    try {
      // Variable assignment: $name = value
      if (line.startsWith('$')) {
        const match = line.match(/^\$(\w+)\s*=\s*(.+)$/)
        if (match) {
          variables[match[1]] = match[2].trim()
        } else {
          errors.push({ line: lineNum, message: `Invalid variable syntax: ${line}` })
        }
        i++
        continue
      }

      // Shape declarations
      const shapeMatch = line.match(/^(rect|circle|ellipse|arrow|line|text|frame|freehand|image|icon)\s+(\w+)\s+(.+)$/)
      if (shapeMatch) {
        const [, type, id, rest] = shapeMatch
        const shape = parseShapeDeclaration(type, id, rest, lineNum, errors, variables)

        // Check for property block { ... }
        if (rest.includes('{') && !rest.includes('}')) {
          // Multi-line property block — consume lines until closing }
          i++
          const props = []
          while (i < tokens.length && !tokens[i].value.startsWith('}')) {
            props.push(tokens[i].value)
            i++
          }
          if (i < tokens.length) i++ // skip closing }
          parseProperties(shape, props, variables, errors)
        } else if (rest.includes('{') && rest.includes('}')) {
          // Inline property block
          const blockMatch = rest.match(/\{([^}]*)\}/)
          if (blockMatch) {
            const props = blockMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean)
            parseProperties(shape, props, variables, errors)
          }
          i++ // advance past this single line
        } else {
          // No property block
          i++
        }

        shapes.push(shape)
        continue
      }

      errors.push({ line: lineNum, message: `Unrecognized syntax: ${line}` })
      i++
    } catch (err) {
      errors.push({ line: lineNum, message: err.message })
      i++
    }
  }

  return { variables, shapes, errors }
}

/**
 * Parse the declaration part (after type and id) of a shape.
 */
function parseShapeDeclaration(type, id, rest, lineNum, errors, variables) {
  const shape = { type, id, line: lineNum, props: {} }

  // Extract position: at X, Y  or  from ... to ...
  if (type === 'arrow' || type === 'line') {
    // from source[.side] to target[.side]
    // from X, Y to X, Y
    const connMatch = rest.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s*\{|$)/)
    if (connMatch) {
      shape.from = parsePointOrRef(connMatch[1].trim(), variables)
      shape.to = parsePointOrRef(connMatch[2].trim(), variables)
    } else {
      errors.push({ line: lineNum, message: `${type} requires 'from ... to ...' syntax` })
    }
  } else {
    // at X, Y
    const atMatch = rest.match(/at\s+([\w$.+\-*\s]+?),\s*([\w$.+\-*\s]+?)(?:\s+size|\s*\{|$)/)
    if (atMatch) {
      shape.x = parseExpr(atMatch[1].trim(), variables)
      shape.y = parseExpr(atMatch[2].trim(), variables)
    } else if (type !== 'frame') {
      errors.push({ line: lineNum, message: `${type} requires 'at X, Y' syntax` })
    }

    // size WxH
    const sizeMatch = rest.match(/size\s+([\w$.+\-*]+)\s*x\s*([\w$.+\-*]+)/)
    if (sizeMatch) {
      shape.width = parseExpr(sizeMatch[1].trim(), variables)
      shape.height = parseExpr(sizeMatch[2].trim(), variables)
    }
  }

  return shape
}

/**
 * Parse a point reference — either a coordinate pair "X, Y" or
 * a shape reference "shapeId.side" or "shapeId.side + offset"
 */
function parsePointOrRef(str, variables) {
  // shapeId.side [+/- offset]
  const refMatch = str.match(/^(\w+)\.(\w+)(?:\s*([+-])\s*([\d.]+))?$/)
  if (refMatch) {
    return {
      ref: refMatch[1],
      side: refMatch[2],
      offset: refMatch[3] ? parseFloat((refMatch[3] === '-' ? '-' : '') + refMatch[4]) : 0,
    }
  }

  // X, Y coordinate pair
  const coordMatch = str.match(/^([\d.]+)\s*,?\s*([\d.]+)$/)
  if (coordMatch) {
    return { x: parseFloat(coordMatch[1]), y: parseFloat(coordMatch[2]) }
  }

  // Just a shape reference (center)
  if (/^\w+$/.test(str)) {
    return { ref: str, side: 'center', offset: 0 }
  }

  return { x: 0, y: 0 }
}

/**
 * Parse a numeric expression, resolving variables.
 * Supports: numbers, $var, shapeId.prop, simple +/- arithmetic
 */
function parseExpr(str, variables) {
  // Replace $variables
  let resolved = str.replace(/\$(\w+)/g, (_, name) => {
    return variables[name] !== undefined ? variables[name] : '0'
  })

  // If it's a simple number, return it
  const num = parseFloat(resolved)
  if (!isNaN(num) && String(num) === resolved.trim()) {
    return num
  }

  // If it contains a shape reference like shapeId.prop, return as deferred
  if (/\w+\.\w+/.test(resolved)) {
    return { expr: resolved }
  }

  // Try simple arithmetic (A + B, A - B)
  const arithMatch = resolved.match(/^([\d.]+)\s*([+-])\s*([\d.]+)$/)
  if (arithMatch) {
    const a = parseFloat(arithMatch[1])
    const b = parseFloat(arithMatch[3])
    return arithMatch[2] === '+' ? a + b : a - b
  }

  return isNaN(num) ? 0 : num
}

/**
 * Parse property lines into shape.props
 */
function parseProperties(shape, lines, variables, errors) {
  for (const line of lines) {
    const propMatch = line.match(/^(\w+)\s*:\s*(.+)$/)
    if (!propMatch) continue

    let [, key, value] = propMatch
    value = value.trim()

    // Strip quotes from string values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // Resolve variables
    value = value.replace(/\$(\w+)/g, (_, name) => {
      return variables[name] !== undefined ? variables[name] : value
    })

    // Parse numeric values
    const num = parseFloat(value)
    if (!isNaN(num) && String(num) === value) {
      shape.props[key] = num
    } else if (value === 'true') {
      shape.props[key] = true
    } else if (value === 'false') {
      shape.props[key] = false
    } else {
      shape.props[key] = value
    }
  }
}

// ============================================================
// RESOLVER — resolve deferred expressions & shape references
// ============================================================

export function resolveShapeRefs(shapes) {
  const shapeMap = new Map()

  // Iteratively resolve deferred expressions until no more progress
  // This handles chained references like: A(absolute) → B(refs A) → C(refs B) → D(refs C)
  const MAX_PASSES = 10
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let progress = false

    // Collect all shapes with known (numeric) positions
    for (const s of shapes) {
      if (typeof s.x === 'number' && typeof s.y === 'number' && !shapeMap.has(s.id)) {
        shapeMap.set(s.id, s)
        progress = true
      }
    }

    // Try to resolve any remaining deferred expressions
    let anyUnresolved = false
    for (const s of shapes) {
      if (s.x && typeof s.x === 'object' && s.x.expr) {
        const resolved = resolveExpr(s.x.expr, shapeMap)
        if (typeof resolved === 'number' && !isNaN(resolved)) {
          s.x = resolved
          progress = true
        } else {
          anyUnresolved = true
        }
      }
      if (s.y && typeof s.y === 'object' && s.y.expr) {
        const resolved = resolveExpr(s.y.expr, shapeMap)
        if (typeof resolved === 'number' && !isNaN(resolved)) {
          s.y = resolved
          progress = true
        } else {
          anyUnresolved = true
        }
      }
    }

    if (!anyUnresolved || !progress) break
  }

  // Final fallback: force-resolve any remaining deferred expressions to 0
  for (const s of shapes) {
    if (s.x && typeof s.x === 'object' && s.x.expr) s.x = 0
    if (s.y && typeof s.y === 'object' && s.y.expr) s.y = 0
  }
}

function resolveExpr(expr, shapeMap) {
  // Match: shapeId.prop [+/- offset]
  const m = expr.match(/^(\w+)\.(\w+)(?:\s*([+-])\s*([\d.]+))?$/)
  if (!m) return NaN

  const [, ref, prop, op, offsetStr] = m
  const shape = shapeMap.get(ref)
  if (!shape) return NaN

  let val = 0
  switch (prop) {
    case 'x': val = shape.x || 0; break
    case 'y': val = shape.y || 0; break
    case 'right': val = (shape.x || 0) + (shape.width || 0); break
    case 'left': val = shape.x || 0; break
    case 'top': val = shape.y || 0; break
    case 'bottom': val = (shape.y || 0) + (shape.height || 0); break
    case 'centerX': val = (shape.x || 0) + (shape.width || 0) / 2; break
    case 'centerY': val = (shape.y || 0) + (shape.height || 0) / 2; break
    case 'width': val = shape.width || 0; break
    case 'height': val = shape.height || 0; break
    default: val = 0
  }

  const offset = offsetStr ? parseFloat(offsetStr) : 0
  return op === '-' ? val - offset : val + offset
}

// ============================================================
// RENDERER — create actual canvas shapes from parsed AST
// ============================================================

/**
 * Render a parsed LixScript AST onto the canvas.
 * Returns { success, shapesCreated, errors }
 */
export function renderLixScript(parsed) {
  const { shapes: shapeDefs, errors } = parsed
  if (errors.length > 0) {
    return { success: false, shapesCreated: 0, errors }
  }

  // Resolve relative references
  resolveShapeRefs(shapeDefs)

  const svg = window.svg
  if (!svg) {
    return { success: false, shapesCreated: 0, errors: [{ line: 0, message: 'Canvas not initialized' }] }
  }

  const createdShapes = new Map() // id -> { instance, def }
  const renderErrors = []

  // Check if user defined a frame — if not, we auto-create one
  const userFrameDef = shapeDefs.find(s => s.type === 'frame')
  let frame = null
  let frameDef = userFrameDef

  if (userFrameDef) {
    // User-defined frame
    frame = createFrame(userFrameDef, renderErrors)
    if (frame) {
      createdShapes.set(userFrameDef.id, { instance: frame, def: userFrameDef })
    }
  }

  // Create non-connection shapes first (rect, circle, text)
  for (const def of shapeDefs) {
    if (def.type === 'frame') continue // already created
    if (def.type === 'arrow' || def.type === 'line') continue // deferred

    const instance = createShape(def, renderErrors)
    if (instance) {
      createdShapes.set(def.id, { instance, def })
    }
  }

  // Create connections (arrows, lines) — now that source/target shapes exist
  for (const def of shapeDefs) {
    if (def.type !== 'arrow' && def.type !== 'line') continue

    const instance = createConnection(def, createdShapes, renderErrors)
    if (instance) {
      createdShapes.set(def.id, { instance, def })
    }
  }

  // Auto-create wrapping frame if user didn't define one
  if (!frame && createdShapes.size > 0) {
    // Calculate bounds from all created shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const [, { instance, def }] of createdShapes) {
      if (def.type === 'arrow' || def.type === 'line') {
        // Use the actual instance start/end coordinates
        const from = resolveConnectionPoint(def.from, createdShapes)
        const to = resolveConnectionPoint(def.to, createdShapes)
        if (from) { minX = Math.min(minX, from.x); minY = Math.min(minY, from.y); maxX = Math.max(maxX, from.x); maxY = Math.max(maxY, from.y) }
        if (to) { minX = Math.min(minX, to.x); minY = Math.min(minY, to.y); maxX = Math.max(maxX, to.x); maxY = Math.max(maxY, to.y) }
      } else if (def.type !== 'frame') {
        const x = def.x || 0
        const y = def.y || 0
        const w = def.width || 160
        const h = def.height || 60
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + w)
        maxY = Math.max(maxY, y + h)
      }
    }

    if (isFinite(minX)) {
      const pad = 40
      const autoFrameDef = {
        type: 'frame',
        id: '_lixscript_auto_frame',
        line: 0,
        x: minX - pad,
        y: minY - pad,
        width: (maxX - minX) + pad * 2,
        height: (maxY - minY) + pad * 2,
        props: { name: 'LixScript' }
      }
      frameDef = autoFrameDef
      frame = createFrame(autoFrameDef, renderErrors)
      if (frame) {
        createdShapes.set(autoFrameDef.id, { instance: frame, def: autoFrameDef })
      }
    }
  }

  // Add all shapes to frame
  if (frame) {
    for (const [id, { instance, def }] of createdShapes) {
      if (def.type === 'frame') continue // don't add frame to itself
      if (shouldAddToFrame(def, frameDef)) {
        frame.addShapeToFrame(instance)
      }
    }
  }

  return {
    success: renderErrors.length === 0,
    shapesCreated: createdShapes.size,
    errors: renderErrors,
  }
}

/**
 * Check if a shape should be added to the frame based on 'contains' prop.
 */
function shouldAddToFrame(shapeDef, frameDef) {
  if (!frameDef || !frameDef.props.contains) return true // add all by default
  const ids = frameDef.props.contains.split(',').map(s => s.trim())
  return ids.includes(shapeDef.id)
}

/**
 * Create a Frame instance.
 */
function createFrame(def, errors) {
  const Frame = window.Frame
  if (!Frame) {
    errors.push({ line: def.line, message: 'Frame class not available' })
    return null
  }

  try {
    const x = def.x || 0
    const y = def.y || 0
    const w = def.width || 600
    const h = def.height || 400

    const frame = new Frame(x, y, w, h, {
      frameName: def.props.frameName || def.props.name || def.id,
      stroke: def.props.stroke || '#555',
      strokeWidth: def.props.strokeWidth || 1,
      fill: def.props.fill || 'transparent',
      fillStyle: def.props.fillStyle || 'transparent',
      fillColor: def.props.fillColor || '#1e1e28',
      opacity: def.props.opacity || 1,
      rotation: def.props.rotation || 0,
    })

    window.shapes.push(frame)
    if (window.pushCreateAction) window.pushCreateAction(frame)

    // Tag as scripted
    frame._frameType = 'lixscript'
    frame._lixscriptSource = true

    // Set image from URL if provided
    if (def.props.imageURL && typeof frame.setImageFromURL === 'function') {
      frame.setImageFromURL(def.props.imageURL, def.props.imageFit || 'cover')
    }

    return frame
  } catch (err) {
    errors.push({ line: def.line, message: `Frame creation failed: ${err.message}` })
    return null
  }
}

/**
 * Create a shape instance from a definition.
 */
function createShape(def, errors) {
  try {
    switch (def.type) {
      case 'rect': return createRect(def, errors)
      case 'circle':
      case 'ellipse': return createCircle(def, errors)
      case 'text': return createText(def, errors)
      case 'freehand': return createFreehand(def, errors)
      case 'image': return createImage(def, errors)
      case 'icon': return createIcon(def, errors)
      default:
        errors.push({ line: def.line, message: `Unknown shape type: ${def.type}` })
        return null
    }
  } catch (err) {
    errors.push({ line: def.line, message: `Shape '${def.id}' failed: ${err.message}` })
    return null
  }
}

/**
 * Create an image shape from a LixScript definition.
 * Usage: image myImg at 100, 200 size 300x200 { src: "https://..." }
 */
function createImage(def, errors) {
  const ImageShape = window.ImageShape
  if (!ImageShape) {
    errors.push({ line: def.line, message: 'ImageShape class not available' })
    return null
  }

  const src = def.props.src || def.props.href || def.props.url || ''
  if (!src) {
    errors.push({ line: def.line, message: `Image '${def.id}' requires a src property` })
    return null
  }

  const svgEl = document.getElementById('freehand-canvas')
  if (!svgEl) return null

  const x = def.x || 0
  const y = def.y || 0
  const w = def.width || 200
  const h = def.height || 200

  const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image')
  imgEl.setAttribute('href', src)
  imgEl.setAttribute('x', x)
  imgEl.setAttribute('y', y)
  imgEl.setAttribute('width', w)
  imgEl.setAttribute('height', h)
  imgEl.setAttribute('data-shape-x', x)
  imgEl.setAttribute('data-shape-y', y)
  imgEl.setAttribute('data-shape-width', w)
  imgEl.setAttribute('data-shape-height', h)
  imgEl.setAttribute('type', 'image')
  imgEl.setAttribute('preserveAspectRatio', def.props.fit === 'contain' ? 'xMidYMid meet' : def.props.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet')

  svgEl.appendChild(imgEl)
  const shape = new ImageShape(imgEl)
  if (def.props.rotation) shape.rotation = parseFloat(def.props.rotation)
  shape.shapeID = def.id || shape.shapeID

  window.shapes.push(shape)
  if (window.pushCreateAction) window.pushCreateAction(shape)

  return shape
}

/**
 * Create an icon shape from a LixScript definition.
 * Usage: icon myIcon at 100, 200 size 48x48 { name: "AWS_Lambda_64" }
 *   or:  icon myIcon at 100, 200 size 48x48 { svg: "<path d='...' />" }
 */
function createIcon(def, errors) {
  const IconShape = window.IconShape
  if (!IconShape) {
    errors.push({ line: def.line, message: 'IconShape class not available' })
    return null
  }

  const svgEl = document.getElementById('freehand-canvas')
  if (!svgEl) return null

  const x = def.x || 0
  const y = def.y || 0
  const size = def.width || 48
  const color = def.props.color || def.props.fill || '#ffffff'

  // Build the inner SVG content
  let innerSVG = ''
  if (def.props.svg) {
    // Inline SVG path(s)
    innerSVG = def.props.svg
  } else if (def.props.name) {
    // Named icon — use a simple placeholder circle+text until loaded
    // The AI should provide inline SVG paths for reliability
    innerSVG = `<circle cx="12" cy="12" r="10" fill="none" stroke="${color}" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" fill="${color}" font-size="10" font-family="sans-serif">${(def.props.name || '?').charAt(0)}</text>`
  } else {
    errors.push({ line: def.line, message: `Icon '${def.id}' requires a name or svg property` })
    return null
  }

  const vbWidth = parseFloat(def.props.viewBoxWidth) || 24
  const vbHeight = parseFloat(def.props.viewBoxHeight) || 24
  const scale = size / Math.max(vbWidth, vbHeight)
  const localCenterX = size / 2 / scale
  const localCenterY = size / 2 / scale
  const rotation = def.props.rotation || 0

  const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  iconGroup.setAttribute('transform', `translate(${x}, ${y}) scale(${scale}) rotate(${rotation}, ${localCenterX}, ${localCenterY})`)
  iconGroup.setAttribute('data-viewbox-width', vbWidth)
  iconGroup.setAttribute('data-viewbox-height', vbHeight)
  iconGroup.setAttribute('x', x)
  iconGroup.setAttribute('y', y)
  iconGroup.setAttribute('width', size)
  iconGroup.setAttribute('height', size)
  iconGroup.setAttribute('type', 'icon')
  iconGroup.setAttribute('data-shape-x', x)
  iconGroup.setAttribute('data-shape-y', y)
  iconGroup.setAttribute('data-shape-width', size)
  iconGroup.setAttribute('data-shape-height', size)
  iconGroup.setAttribute('data-shape-rotation', rotation)
  iconGroup.setAttribute('style', 'cursor: pointer; pointer-events: all;')

  // Transparent hit area
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bgRect.setAttribute('x', 0)
  bgRect.setAttribute('y', 0)
  bgRect.setAttribute('width', vbWidth)
  bgRect.setAttribute('height', vbHeight)
  bgRect.setAttribute('fill', 'transparent')
  bgRect.setAttribute('stroke', 'none')
  bgRect.setAttribute('style', 'pointer-events: all;')
  iconGroup.appendChild(bgRect)

  // Parse and insert SVG content
  const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  tempSvg.innerHTML = innerSVG
  while (tempSvg.firstChild) {
    const child = tempSvg.firstChild
    // Apply color to paths/circles/etc
    if (child.nodeType === 1) {
      const fill = child.getAttribute('fill')
      const stroke = child.getAttribute('stroke')
      if (!fill || fill === 'currentColor' || fill === '#000' || fill === '#000000' || fill === 'black') {
        child.setAttribute('fill', color)
      }
      if (stroke === 'currentColor' || stroke === '#000' || stroke === '#000000' || stroke === 'black') {
        child.setAttribute('stroke', color)
      }
    }
    iconGroup.appendChild(child)
  }

  svgEl.appendChild(iconGroup)
  const shape = new IconShape(iconGroup)
  shape.shapeID = def.id || shape.shapeID

  window.shapes.push(shape)
  if (window.pushCreateAction) window.pushCreateAction(shape)

  return shape
}

function createRect(def, errors) {
  const Rectangle = window.Rectangle
  if (!Rectangle) {
    errors.push({ line: def.line, message: 'Rectangle class not available' })
    return null
  }

  const x = def.x || 0
  const y = def.y || 0
  const w = def.width || 160
  const h = def.height || 60

  const rect = new Rectangle(x, y, w, h, {
    stroke: def.props.stroke || '#fff',
    strokeWidth: def.props.strokeWidth || 2,
    fill: def.props.fill || 'transparent',
    fillStyle: def.props.fillStyle || 'none',
    roughness: def.props.roughness !== undefined ? def.props.roughness : 1.5,
    strokeDasharray: resolveStrokeStyle(def.props.style),
    shadeColor: def.props.shadeColor || null,
    shadeOpacity: def.props.shadeOpacity !== undefined ? parseFloat(def.props.shadeOpacity) : 0.15,
    shadeDirection: def.props.shadeDirection || 'bottom',
  })

  if (def.props.rotation) rect.rotation = def.props.rotation
  if (def.props.label) {
    rect.setLabel(
      def.props.label,
      def.props.labelColor || '#e0e0e0',
      def.props.labelFontSize || 14
    )
  }

  window.shapes.push(rect)
  if (window.pushCreateAction) window.pushCreateAction(rect)
  return rect
}

function createCircle(def, errors) {
  const Circle = window.Circle
  if (!Circle) {
    errors.push({ line: def.line, message: 'Circle class not available' })
    return null
  }

  const x = def.x || 0
  const y = def.y || 0
  const w = def.width || 80
  const h = def.height || 80

  // Circle constructor uses (x, y, rx, ry) — center and radii
  const rx = w / 2
  const ry = h / 2

  const circle = new Circle(x + rx, y + ry, rx, ry, {
    stroke: def.props.stroke || '#fff',
    strokeWidth: def.props.strokeWidth || 2,
    fill: def.props.fill || 'transparent',
    fillStyle: def.props.fillStyle || 'none',
    roughness: def.props.roughness !== undefined ? def.props.roughness : 1.5,
    strokeDasharray: resolveStrokeStyle(def.props.style),
    shadeColor: def.props.shadeColor || null,
    shadeOpacity: def.props.shadeOpacity !== undefined ? parseFloat(def.props.shadeOpacity) : 0.15,
    shadeDirection: def.props.shadeDirection || 'bottom',
  })

  if (def.props.rotation) circle.rotation = def.props.rotation
  if (def.props.label) {
    circle.setLabel(
      def.props.label,
      def.props.labelColor || '#e0e0e0',
      def.props.labelFontSize || 14
    )
  }

  window.shapes.push(circle)
  if (window.pushCreateAction) window.pushCreateAction(circle)
  return circle
}

function createText(def, errors) {
  const TextShape = window.TextShape
  const svgEl = window.svg
  if (!TextShape || !svgEl) {
    errors.push({ line: def.line, message: 'TextShape class not available' })
    return null
  }

  const x = def.x || 0
  const y = def.y || 0
  const content = def.props.content || def.props.text || 'Text'
  const color = def.props.color || def.props.fill || '#fff'
  const fontSize = def.props.fontSize || 16

  const g = document.createElementNS(NS, 'g')
  g.setAttribute('data-type', 'text-group')
  g.setAttribute('transform', `translate(${x}, ${y})`)
  g.setAttribute('data-x', x)
  g.setAttribute('data-y', y)

  const t = document.createElementNS(NS, 'text')
  t.setAttribute('x', 0)
  t.setAttribute('y', 0)
  t.setAttribute('text-anchor', def.props.anchor || 'middle')
  t.setAttribute('dominant-baseline', 'central')
  t.setAttribute('fill', color)
  t.setAttribute('font-size', fontSize)
  t.setAttribute('font-family', def.props.fontFamily || 'lixFont, sans-serif')
  t.setAttribute('data-initial-font', def.props.fontFamily || 'lixFont')
  t.setAttribute('data-initial-color', color)
  t.setAttribute('data-initial-size', fontSize + 'px')
  t.textContent = content

  g.appendChild(t)
  svgEl.appendChild(g)

  const shape = new TextShape(g)
  window.shapes.push(shape)
  if (window.pushCreateAction) window.pushCreateAction(shape)
  return shape
}

function createFreehand(def, errors) {
  const FreehandStroke = window.FreehandStroke
  if (!FreehandStroke) {
    errors.push({ line: def.line, message: 'FreehandStroke class not available' })
    return null
  }

  // Points should be provided as a property: points: "x1,y1;x2,y2;..."
  const pointsStr = def.props.points || ''
  const points = pointsStr.split(';').map(p => {
    const [x, y, pressure] = p.split(',').map(Number)
    return [x || 0, y || 0, pressure || 0.5]
  }).filter(p => !isNaN(p[0]))

  if (points.length < 2) {
    errors.push({ line: def.line, message: 'Freehand requires at least 2 points' })
    return null
  }

  const stroke = new FreehandStroke(points, {
    stroke: def.props.stroke || def.props.color || '#fff',
    strokeWidth: def.props.strokeWidth || 3,
    thinning: def.props.thinning || 0.5,
    roughness: def.props.roughness || 'smooth',
    strokeStyle: def.props.style || 'solid',
  })

  window.shapes.push(stroke)
  if (window.pushCreateAction) window.pushCreateAction(stroke)
  return stroke
}

/**
 * Create a connection (arrow or line) between two points or shape references.
 */
function createConnection(def, createdShapes, errors) {
  const from = resolveConnectionPoint(def.from, createdShapes)
  const to = resolveConnectionPoint(def.to, createdShapes)

  if (!from || !to) {
    errors.push({ line: def.line, message: `Cannot resolve connection endpoints for '${def.id}'` })
    return null
  }

  if (def.type === 'arrow') {
    return createArrow(def, from, to, createdShapes, errors)
  } else {
    return createLine(def, from, to, errors)
  }
}

function createArrow(def, from, to, createdShapes, errors) {
  const Arrow = window.Arrow
  if (!Arrow) {
    errors.push({ line: def.line, message: 'Arrow class not available' })
    return null
  }

  const curveMode = def.props.curve || 'straight'

  const arrow = new Arrow(
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
    {
      stroke: def.props.stroke || '#fff',
      strokeWidth: def.props.strokeWidth || 2,
      arrowOutlineStyle: def.props.style || 'solid',
      arrowHeadStyle: def.props.head || 'default',
      arrowHeadLength: def.props.headLength || 15,
      arrowCurved: curveMode,
      arrowCurveAmount: def.props.curveAmount || 50,
    }
  )

  if (def.props.label) {
    arrow.setLabel(
      def.props.label,
      def.props.labelColor || '#e0e0e0',
      def.props.labelFontSize || 12
    )
  }

  // Auto-attach to source/target shapes
  if (def.from && def.from.ref) {
    const sourceEntry = createdShapes.get(def.from.ref)
    if (sourceEntry) {
      autoAttach(arrow, sourceEntry.instance, true, from)
    }
  }
  if (def.to && def.to.ref) {
    const targetEntry = createdShapes.get(def.to.ref)
    if (targetEntry) {
      autoAttach(arrow, targetEntry.instance, false, to)
    }
  }

  window.shapes.push(arrow)
  if (window.pushCreateAction) window.pushCreateAction(arrow)
  return arrow
}

function createLine(def, from, to, errors) {
  const Line = window.Line
  if (!Line) {
    errors.push({ line: def.line, message: 'Line class not available' })
    return null
  }

  const line = new Line(
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
    {
      stroke: def.props.stroke || '#fff',
      strokeWidth: def.props.strokeWidth || 2,
      strokeDasharray: resolveStrokeStyle(def.props.style),
    }
  )

  if (def.props.curve === 'true' || def.props.curve === true) {
    line.isCurved = true
    line.initializeCurveControlPoint?.()
    line.draw()
  }

  if (def.props.label) {
    line.setLabel(
      def.props.label,
      def.props.labelColor || '#e0e0e0',
      def.props.labelFontSize || 12
    )
  }

  window.shapes.push(line)
  if (window.pushCreateAction) window.pushCreateAction(line)
  return line
}

// ============================================================
// CONNECTION POINT RESOLUTION
// ============================================================

/**
 * Resolve a connection endpoint — either absolute coords or a shape reference.
 */
function resolveConnectionPoint(pointDef, createdShapes) {
  if (!pointDef) return null

  // Absolute coordinates
  if (pointDef.x !== undefined && pointDef.y !== undefined) {
    return { x: pointDef.x, y: pointDef.y }
  }

  // Shape reference
  if (pointDef.ref) {
    const entry = createdShapes.get(pointDef.ref)
    if (!entry) return null

    const shape = entry.instance
    const def = entry.def
    const side = pointDef.side || 'center'
    const offset = pointDef.offset || 0

    // Get shape bounds
    const sx = shape.x !== undefined ? shape.x : (def.x || 0)
    const sy = shape.y !== undefined ? shape.y : (def.y || 0)
    const sw = shape.width || def.width || 0
    const sh = shape.height || def.height || 0

    // For circles, x/y is the center
    let cx, cy
    if (shape.shapeName === 'circle') {
      cx = sx
      cy = sy
      const rx = shape.rx || sw / 2
      const ry = shape.ry || sh / 2

      switch (side) {
        case 'top': return { x: cx + offset, y: cy - ry }
        case 'bottom': return { x: cx + offset, y: cy + ry }
        case 'left': return { x: cx - rx, y: cy + offset }
        case 'right': return { x: cx + rx, y: cy + offset }
        case 'center': return { x: cx + offset, y: cy }
        default: return { x: cx, y: cy }
      }
    }

    // For rectangles and other box shapes
    cx = sx + sw / 2
    cy = sy + sh / 2

    switch (side) {
      case 'top': return { x: cx + offset, y: sy }
      case 'bottom': return { x: cx + offset, y: sy + sh }
      case 'left': return { x: sx, y: cy + offset }
      case 'right': return { x: sx + sw, y: cy + offset }
      case 'center': return { x: cx + offset, y: cy }
      default: return { x: cx, y: cy }
    }
  }

  return null
}

/**
 * Auto-attach an arrow to a shape (sets attachedToStart or attachedToEnd).
 */
function autoAttach(arrow, shape, isStart, connectionPoint) {
  if (!shape || !connectionPoint) return

  const sx = shape.x || 0
  const sy = shape.y || 0
  const sw = shape.width || 0
  const sh = shape.height || 0

  let cx, cy
  if (shape.shapeName === 'circle') {
    cx = sx
    cy = sy
  } else {
    cx = sx + sw / 2
    cy = sy + sh / 2
  }

  // Determine which side the connection point is on
  const dx = connectionPoint.x - cx
  const dy = connectionPoint.y - cy
  let side = 'bottom'

  if (Math.abs(dx) > Math.abs(dy)) {
    side = dx > 0 ? 'right' : 'left'
  } else {
    side = dy > 0 ? 'bottom' : 'top'
  }

  const attachment = { shape, side, offset: { x: 0, y: 0 } }

  if (isStart) {
    arrow.attachedToStart = attachment
  } else {
    arrow.attachedToEnd = attachment
  }
}

// ============================================================
// PREVIEW — generate SVG preview without touching the canvas
// ============================================================

/**
 * Generate a preview SVG string from parsed LixScript.
 */
export function previewLixScript(parsed) {
  const { shapes: defs, errors } = parsed
  if (errors.length > 0) return ''

  resolveShapeRefs(defs)

  // Build a shape map for resolving arrow references in preview
  const shapeMap = new Map()
  for (const def of defs) {
    if (def.type !== 'arrow' && def.type !== 'line') {
      shapeMap.set(def.id, def)
    }
  }

  // Resolve arrow/line endpoints to coordinates for preview
  function resolvePreviewPoint(pointDef) {
    if (!pointDef) return { x: 0, y: 0 }
    if (pointDef.x !== undefined && pointDef.y !== undefined) return pointDef

    if (pointDef.ref) {
      const target = shapeMap.get(pointDef.ref)
      if (!target) return { x: 0, y: 0 }

      const side = pointDef.side || 'center'
      const offset = pointDef.offset || 0
      const tx = target.x || 0
      const ty = target.y || 0
      const tw = target.width || 160
      const th = target.height || 60

      // For circle, x/y is top-left of bounding box in our DSL
      const cx = tx + tw / 2
      const cy = ty + th / 2

      switch (side) {
        case 'top': return { x: cx + offset, y: ty }
        case 'bottom': return { x: cx + offset, y: ty + th }
        case 'left': return { x: tx, y: cy + offset }
        case 'right': return { x: tx + tw, y: cy + offset }
        case 'center': return { x: cx + offset, y: cy }
        default: return { x: cx, y: cy }
      }
    }
    return { x: 0, y: 0 }
  }

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const def of defs) {
    if (def.type === 'arrow' || def.type === 'line') {
      const from = resolvePreviewPoint(def.from)
      const to = resolvePreviewPoint(def.to)
      minX = Math.min(minX, from.x, to.x)
      minY = Math.min(minY, from.y, to.y)
      maxX = Math.max(maxX, from.x, to.x)
      maxY = Math.max(maxY, from.y, to.y)
    } else if (def.type !== 'frame') {
      const x = def.x || 0
      const y = def.y || 0
      const w = def.width || 160
      const h = def.height || 60
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + w)
      maxY = Math.max(maxY, y + h)
    }
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300 }

  const pad = 40
  const vw = maxX - minX + pad * 2
  const vh = maxY - minY + pad * 2

  let svgContent = ''

  // Render each shape as simple SVG
  for (const def of defs) {
    const props = def.props || {}

    switch (def.type) {
      case 'rect':
        svgContent += `<rect x="${def.x || 0}" y="${def.y || 0}" width="${def.width || 160}" height="${def.height || 60}" stroke="${props.stroke || '#fff'}" stroke-width="${props.strokeWidth || 2}" fill="${props.fill || 'transparent'}" rx="4" />`
        if (props.label) {
          const cx = (def.x || 0) + (def.width || 160) / 2
          const cy = (def.y || 0) + (def.height || 60) / 2
          svgContent += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${props.labelColor || '#e0e0e0'}" font-size="${props.labelFontSize || 14}" font-family="sans-serif">${escapeXml(props.label)}</text>`
        }
        break

      case 'circle':
      case 'ellipse': {
        const rx = (def.width || 80) / 2
        const ry = (def.height || 80) / 2
        const cx = (def.x || 0) + rx
        const cy = (def.y || 0) + ry
        svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${props.stroke || '#fff'}" stroke-width="${props.strokeWidth || 2}" fill="${props.fill || 'transparent'}" />`
        if (props.label) {
          svgContent += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${props.labelColor || '#e0e0e0'}" font-size="${props.labelFontSize || 14}" font-family="sans-serif">${escapeXml(props.label)}</text>`
        }
        break
      }

      case 'text': {
        const content = props.content || props.text || 'Text'
        svgContent += `<text x="${def.x || 0}" y="${def.y || 0}" fill="${props.color || props.fill || '#fff'}" font-size="${props.fontSize || 16}" font-family="sans-serif">${escapeXml(content)}</text>`
        break
      }

      case 'arrow': {
        const fromOrig = resolvePreviewPoint(def.from)
        const toOrig = resolvePreviewPoint(def.to)
        const stroke = props.stroke || '#fff'
        const sw = props.strokeWidth || 2
        const dash = props.style === 'dashed' ? ' stroke-dasharray="10,10"' : props.style === 'dotted' ? ' stroke-dasharray="2,8"' : ''
        const curve = props.curve || 'straight'
        const markerId = `ah-${def.id}`
        const headLen = 10 // arrowhead marker size

        // Pull back arrow endpoint so the tip lands at the shape edge, not inside it
        const to = shortenEndpoint(fromOrig, toOrig, headLen)
        const from = fromOrig

        // Per-arrow colored arrowhead marker — refX=0 so tip is at the shortened line end
        svgContent += `<defs><marker id="${markerId}" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${stroke}" /></marker></defs>`

        if (curve === 'curved') {
          // Compute a quadratic bezier control point perpendicular to the line
          const mx = (from.x + toOrig.x) / 2
          const my = (from.y + toOrig.y) / 2
          const dx = toOrig.x - from.x
          const dy = toOrig.y - from.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const amt = props.curveAmount || Math.min(dist * 0.3, 80)
          // Perpendicular offset (always curve to the same side)
          const cpx = mx + (dy / dist) * amt
          const cpy = my - (dx / dist) * amt
          // Shorten the bezier endpoint
          const toShort = shortenEndpoint({ x: cpx, y: cpy }, toOrig, headLen)
          svgContent += `<path d="M${from.x},${from.y} Q${cpx},${cpy} ${toShort.x},${toShort.y}" stroke="${stroke}" stroke-width="${sw}" fill="none"${dash} marker-end="url(#${markerId})" />`
          if (props.label) {
            // Label at the curve midpoint (t=0.5 on quadratic bezier)
            const lx = 0.25 * from.x + 0.5 * cpx + 0.25 * toOrig.x
            const ly = 0.25 * from.y + 0.5 * cpy + 0.25 * toOrig.y - 8
            svgContent += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${props.labelColor || '#a0a0b0'}" font-size="11" font-family="sans-serif">${escapeXml(props.label)}</text>`
          }
        } else if (curve === 'elbow') {
          // Simple elbow: go vertical then horizontal (or vice versa)
          const midY = from.y + (toOrig.y - from.y) / 2
          // Shorten the last segment endpoint
          const lastFrom = { x: toOrig.x, y: midY }
          const toShort = shortenEndpoint(lastFrom, toOrig, headLen)
          svgContent += `<path d="M${from.x},${from.y} L${from.x},${midY} L${toOrig.x},${midY} L${toShort.x},${toShort.y}" stroke="${stroke}" stroke-width="${sw}" fill="none"${dash} marker-end="url(#${markerId})" />`
          if (props.label) {
            const lx = (from.x + toOrig.x) / 2
            const ly = midY - 8
            svgContent += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${props.labelColor || '#a0a0b0'}" font-size="11" font-family="sans-serif">${escapeXml(props.label)}</text>`
          }
        } else {
          svgContent += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${stroke}" stroke-width="${sw}"${dash} marker-end="url(#${markerId})" />`
          if (props.label) {
            const lx = (from.x + toOrig.x) / 2
            const ly = (from.y + toOrig.y) / 2 - 10
            svgContent += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${props.labelColor || '#a0a0b0'}" font-size="11" font-family="sans-serif">${escapeXml(props.label)}</text>`
          }
        }
        break
      }

      case 'line': {
        const from = resolvePreviewPoint(def.from)
        const to = resolvePreviewPoint(def.to)
        const dash = props.style === 'dashed' ? ' stroke-dasharray="10,10"' : props.style === 'dotted' ? ' stroke-dasharray="2,8"' : ''
        svgContent += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${props.stroke || '#fff'}" stroke-width="${props.strokeWidth || 2}"${dash} />`
        break
      }

      case 'frame': {
        const frameName = props.name || def.id
        svgContent += `<rect x="${def.x || 0}" y="${def.y || 0}" width="${def.width || 600}" height="${def.height || 400}" stroke="${props.stroke || '#555'}" stroke-width="1" fill="transparent" stroke-dasharray="8,4" rx="8" />`
        svgContent += `<text x="${(def.x || 0) + 10}" y="${(def.y || 0) - 8}" fill="#888" font-size="12" font-family="sans-serif">${escapeXml(frameName)}</text>`
        break
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${vw} ${vh}" width="100%" height="100%" style="background: transparent;">
    ${svgContent}
  </svg>`
}

/**
 * Pull back an arrow endpoint so the arrowhead tip lands at the target edge,
 * rather than the line extending into the shape.
 */
function shortenEndpoint(from, to, amount) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < amount * 2) return to // too short to shorten
  return {
    x: to.x - (dx / dist) * amount,
    y: to.y - (dy / dist) * amount,
  }
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ============================================================
// STROKE STYLE HELPERS
// ============================================================

function resolveStrokeStyle(style) {
  if (!style) return ''
  switch (style) {
    case 'dashed': return '10,10'
    case 'dotted': return '2,8'
    case 'solid':
    default: return ''
  }
}

// ============================================================
// WINDOW BRIDGE — expose to canvas engine
// ============================================================

export function initLixScriptBridge() {
  window.__lixscriptParse = parseLixScript
  window.__lixscriptRender = renderLixScript
  window.__lixscriptPreview = (source) => {
    const parsed = parseLixScript(source)
    return previewLixScript(parsed)
  }
  window.__lixscriptExecute = (source) => {
    const parsed = parseLixScript(source)
    if (parsed.errors.length > 0) {
      return { success: false, errors: parsed.errors, shapesCreated: 0 }
    }
    return renderLixScript(parsed)
  }
}
