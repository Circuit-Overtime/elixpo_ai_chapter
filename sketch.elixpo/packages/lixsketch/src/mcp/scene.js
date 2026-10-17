const FORMAT = 'lixsketch';
const VERSION = 1;
const MAX_SHAPES = 5000;
const MAX_OPERATIONS = 500;
const SCENE_TYPES = new Set(['rectangle', 'circle', 'line', 'arrow', 'freehandStroke', 'frame', 'text', 'code', 'image', 'icon']);
const WRITABLE_TYPES = new Set(['rectangle', 'circle', 'line', 'arrow', 'freehandStroke', 'frame', 'text']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 1) => Math.max(1, finite(value, fallback));

export function createEmptyScene(name = 'MCP Canvas') {
  return {
    format: FORMAT,
    version: VERSION,
    sessionID: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'MCP Canvas').trim().slice(0, 72),
    createdAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    zoom: 1,
    mcpRevision: 0,
    shapes: [],
  };
}

export function validateScene(scene) {
  const errors = [];
  if (!scene || typeof scene !== 'object') return { valid: false, errors: ['Scene must be an object'] };
  if (scene.format !== FORMAT) errors.push(`Scene format must be "${FORMAT}"`);
  if (scene.version !== VERSION) errors.push(`Scene version must be ${VERSION}`);
  if (!Array.isArray(scene.shapes)) errors.push('Scene shapes must be an array');
  if (Array.isArray(scene.shapes) && scene.shapes.length > MAX_SHAPES) errors.push(`Scene exceeds ${MAX_SHAPES} shapes`);
  const ids = new Set();
  for (const [index, shape] of (scene.shapes || []).entries()) {
    if (!shape || typeof shape !== 'object') { errors.push(`Shape ${index} must be an object`); continue; }
    if (!SCENE_TYPES.has(shape.type)) errors.push(`Shape ${index} has unsupported type "${shape.type}"`);
    if (!shape.shapeID || typeof shape.shapeID !== 'string') errors.push(`Shape ${index} is missing shapeID`);
    else if (ids.has(shape.shapeID)) errors.push(`Duplicate shapeID "${shape.shapeID}"`);
    else ids.add(shape.shapeID);
    validateShapeGeometry(shape, index, errors);
  }
  return { valid: errors.length === 0, errors };
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function normalizeOptions(value = {}) {
  return {
    roughness: Math.max(0, Math.min(3, finite(value.roughness, 1.2))),
    stroke: typeof value.stroke === 'string' ? value.stroke : '#8b76d6',
    strokeWidth: Math.max(0.5, Math.min(20, finite(value.strokeWidth, 2))),
    fill: typeof value.fill === 'string' ? value.fill : 'transparent',
    fillStyle: typeof value.fillStyle === 'string' ? value.fillStyle : 'solid',
    opacity: Math.max(0, Math.min(1, finite(value.opacity, 1))),
  };
}

function createTextShape(input, shapeID) {
  const x = finite(input.x), y = finite(input.y), rotation = finite(input.rotation);
  const text = String(input.text || '').slice(0, 10000);
  const fontSize = Math.max(8, Math.min(160, finite(input.fontSize, 20)));
  const color = typeof input.color === 'string' ? input.color : '#e8e3f3';
  const family = typeof input.fontFamily === 'string' ? input.fontFamily.slice(0, 80) : 'lixFont';
  const transform = `translate(${x}, ${y})${rotation ? ` rotate(${rotation}, 0, 0)` : ''}`;
  const lines = text.split('\n').map((line, index) => `<tspan x="0" dy="${index === 0 ? 0 : '1.2em'}">${escapeXml(line || ' ')}</tspan>`).join('');
  return {
    shapeID, type: 'text', x, y, rotation,
    mcpText: text, mcpFontSize: fontSize, mcpColor: color, mcpFontFamily: family,
    groupHTML: `<g id="${escapeXml(shapeID)}" data-type="text-group" data-x="${x}" data-y="${y}" transform="${transform}"><text id="${escapeXml(shapeID)}-text" x="0" y="0" fill="${escapeXml(color)}" font-size="${fontSize}" font-family="${escapeXml(family)}" dominant-baseline="hanging" white-space="pre" pointer-events="painted" data-type="text" data-initial-size="${fontSize}" data-initial-font="${escapeXml(family)}" data-initial-color="${escapeXml(color)}">${lines}</text></g>`,
  };
}

export function normalizeShape(input, existingIds = new Set()) {
  if (!input || typeof input !== 'object') throw new Error('Shape must be an object');
  if (!WRITABLE_TYPES.has(input.type)) throw new Error(`Shape type "${input.type}" is read-only through MCP`);
  let shapeID = String(input.shapeID || `${input.type}-${crypto.randomUUID()}`).slice(0, 120);
  while (existingIds.has(shapeID)) shapeID = `${input.type}-${crypto.randomUUID()}`;
  const base = { shapeID, type: input.type, rotation: finite(input.rotation), options: normalizeOptions(input.options), groupId: input.groupId || null, parentFrame: input.parentFrame || null, docBlockIds: [] };
  switch (input.type) {
    case 'rectangle': return { ...base, x: finite(input.x), y: finite(input.y), width: positive(input.width, 160), height: positive(input.height, 90) };
    case 'circle': return { ...base, x: finite(input.x), y: finite(input.y), rx: positive(input.rx, 60), ry: positive(input.ry, 60) };
    case 'line': return { ...base, startPoint: point(input.startPoint), endPoint: point(input.endPoint, 120), isCurved: Boolean(input.isCurved), controlPoint: input.controlPoint ? point(input.controlPoint) : null };
    case 'arrow': return { ...base, startPoint: point(input.startPoint), endPoint: point(input.endPoint, 120), arrowHeadStyle: input.arrowHeadStyle || 'triangle', arrowOutlineStyle: input.arrowOutlineStyle || 'solid', arrowCurved: Boolean(input.arrowCurved), arrowCurveAmount: finite(input.arrowCurveAmount, 0.2) };
    case 'freehandStroke': {
      const points = (Array.isArray(input.points) ? input.points : []).slice(0, 4096).map((entry) => [finite(entry?.[0]), finite(entry?.[1]), finite(entry?.[2], 0.5)]);
      if (points.length < 2) throw new Error('freehandStroke requires at least two points');
      return { ...base, points };
    }
    case 'frame': return { ...base, x: finite(input.x), y: finite(input.y), width: positive(input.width, 640), height: positive(input.height, 360), frameName: String(input.frameName || 'Frame').slice(0, 80), fillStyle: input.fillStyle || 'transparent', fillColor: input.fillColor || '#1e1e28', gridSize: positive(input.gridSize, 20), containedShapeIDs: [] };
    case 'text': return { ...base, ...createTextShape(input, shapeID) };
    default: throw new Error(`Unsupported shape type "${input.type}"`);
  }
}

function point(value, fallbackX = 0) {
  return { x: finite(value?.x, fallbackX), y: finite(value?.y) };
}

function translateShape(shape, dx, dy) {
  const moved = clone(shape);
  if (moved.startPoint) { moved.startPoint.x += dx; moved.startPoint.y += dy; }
  if (moved.endPoint) { moved.endPoint.x += dx; moved.endPoint.y += dy; }
  if (moved.controlPoint) { moved.controlPoint.x += dx; moved.controlPoint.y += dy; }
  if (moved.controlPoint1) { moved.controlPoint1.x += dx; moved.controlPoint1.y += dy; }
  if (moved.controlPoint2) { moved.controlPoint2.x += dx; moved.controlPoint2.y += dy; }
  if (Array.isArray(moved.points)) moved.points = moved.points.map((p) => [p[0] + dx, p[1] + dy, ...p.slice(2)]);
  if (Number.isFinite(moved.x)) moved.x += dx;
  if (Number.isFinite(moved.y)) moved.y += dy;
  if (moved.type === 'text' && moved.groupHTML) {
    moved.groupHTML = moved.groupHTML
      .replace(/data-x="[^"]*"/, `data-x="${moved.x}"`)
      .replace(/data-y="[^"]*"/, `data-y="${moved.y}"`)
      .replace(/transform="translate\([^)]*\)/, `transform="translate(${moved.x}, ${moved.y})`);
  }
  if (moved.type === 'code' && moved.groupHTML) {
    moved.groupHTML = moved.groupHTML
      .replace(/data-x="[^"]*"/, `data-x="${moved.x}"`)
      .replace(/data-y="[^"]*"/, `data-y="${moved.y}"`)
      .replace(/transform="translate\([^)]*\)/, `transform="translate(${moved.x}, ${moved.y})`);
  }
  if (moved.type === 'icon' && moved.elementHTML) {
    moved.elementHTML = moved.elementHTML
      .replace(/\bx="[^"]*"/, `x="${moved.x}"`)
      .replace(/\by="[^"]*"/, `y="${moved.y}"`);
  }
  return moved;
}

export function applyScenePatch(sceneInput, operations, { expectedRevision, dryRun = false } = {}) {
  const scene = clone(sceneInput);
  const check = validateScene(scene);
  if (!check.valid) throw new Error(`Invalid scene: ${check.errors.join('; ')}`);
  if (!Array.isArray(operations) || operations.length === 0) throw new Error('At least one operation is required');
  if (operations.length > MAX_OPERATIONS) throw new Error(`Patch exceeds ${MAX_OPERATIONS} operations`);
  const revision = Number(scene.mcpRevision || 0);
  if (expectedRevision !== undefined && Number(expectedRevision) !== revision) throw new Error(`Revision conflict: expected ${expectedRevision}, current ${revision}`);
  const changedIds = new Set();
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') throw new Error('Each operation must be an object');
    if (operation.op === 'add') {
      if (scene.shapes.length >= MAX_SHAPES) throw new Error(`Scene exceeds ${MAX_SHAPES} shapes`);
      const ids = new Set(scene.shapes.map((shape) => shape.shapeID));
      const shape = normalizeShape(operation.shape, ids);
      scene.shapes.push(shape); changedIds.add(shape.shapeID);
    } else if (operation.op === 'update') {
      const index = scene.shapes.findIndex((shape) => shape.shapeID === operation.shapeID);
      if (index < 0) throw new Error(`Shape "${operation.shapeID}" was not found`);
      const immutable = scene.shapes[index];
      scene.shapes[index] = applyShapeChanges(immutable, operation.changes || {}); changedIds.add(immutable.shapeID);
    } else if (operation.op === 'delete') {
      const ids = new Set(Array.isArray(operation.shapeIDs) ? operation.shapeIDs : [operation.shapeID]);
      const before = scene.shapes.length;
      scene.shapes = scene.shapes.filter((shape) => !ids.has(shape.shapeID));
      if (scene.shapes.length === before) throw new Error('No requested shapes were found');
      scene.shapes.forEach((shape) => {
        if (ids.has(shape.parentFrame)) shape.parentFrame = null;
        if (Array.isArray(shape.containedShapeIDs)) shape.containedShapeIDs = shape.containedShapeIDs.filter((id) => !ids.has(id));
      });
      ids.forEach((id) => changedIds.add(id));
    } else if (operation.op === 'translate') {
      const ids = new Set(operation.shapeIDs || []), dx = finite(operation.dx), dy = finite(operation.dy);
      if (!ids.size) throw new Error('translate requires shapeIDs');
      scene.shapes = scene.shapes.map((shape) => ids.has(shape.shapeID) ? translateShape(shape, dx, dy) : shape);
      ids.forEach((id) => changedIds.add(id));
    } else if (operation.op === 'rename_canvas') {
      scene.name = String(operation.name || '').trim().slice(0, 72) || scene.name;
    } else throw new Error(`Unsupported operation "${operation.op}"`);
  }
  reconcileFrameContainment(scene);
  scene.mcpRevision = revision + 1;
  scene.updatedAt = new Date().toISOString();
  const result = validateScene(scene);
  if (!result.valid) throw new Error(`Patch produced an invalid scene: ${result.errors.join('; ')}`);
  return { scene, revision: scene.mcpRevision, dryRun: Boolean(dryRun), changedShapeIDs: [...changedIds] };
}

function reconcileFrameContainment(scene) {
  const frames = new Map(scene.shapes.filter((shape) => shape.type === 'frame').map((shape) => [shape.shapeID, shape]));
  for (const frame of frames.values()) frame.containedShapeIDs = [];
  for (const shape of scene.shapes) {
    if (!shape.parentFrame) continue;
    const frame = frames.get(shape.parentFrame);
    if (!frame) throw new Error(`Shape "${shape.shapeID}" references missing frame "${shape.parentFrame}"`);
    frame.containedShapeIDs.push(shape.shapeID);
  }
}

function applyShapeChanges(shape, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Shape changes must be an object');
  const allowed = {
    rectangle: ['x', 'y', 'width', 'height', 'rotation', 'options', 'groupId', 'parentFrame'],
    circle: ['x', 'y', 'rx', 'ry', 'rotation', 'options', 'groupId', 'parentFrame'],
    line: ['startPoint', 'endPoint', 'controlPoint', 'isCurved', 'options', 'groupId', 'parentFrame'],
    arrow: ['startPoint', 'endPoint', 'controlPoint1', 'controlPoint2', 'arrowHeadStyle', 'arrowOutlineStyle', 'arrowCurved', 'arrowCurveAmount', 'options', 'groupId', 'parentFrame'],
    freehandStroke: ['points', 'rotation', 'options', 'groupId', 'parentFrame'],
    frame: ['x', 'y', 'width', 'height', 'rotation', 'frameName', 'fillStyle', 'fillColor', 'gridSize', 'options', 'groupId', 'parentFrame'],
    text: ['x', 'y', 'rotation', 'text', 'fontSize', 'color', 'fontFamily', 'groupId', 'parentFrame'],
  }[shape.type] || [];
  const rejected = Object.keys(changes).filter((key) => !allowed.includes(key));
  if (rejected.length) throw new Error(`Cannot update ${shape.type} fields: ${rejected.join(', ')}`);
  if (shape.type === 'text') {
    const text = changes.text ?? shape.mcpText ?? extractText(shape.groupHTML);
    return { ...shape, ...createTextShape({ x: changes.x ?? shape.x, y: changes.y ?? shape.y, rotation: changes.rotation ?? shape.rotation, text, fontSize: changes.fontSize ?? shape.mcpFontSize, color: changes.color ?? shape.mcpColor, fontFamily: changes.fontFamily ?? shape.mcpFontFamily }, shape.shapeID), groupId: changes.groupId ?? shape.groupId, parentFrame: changes.parentFrame ?? shape.parentFrame };
  }
  const copy = { ...clone(shape), ...clone(changes), shapeID: shape.shapeID, type: shape.type };
  if (changes.options) copy.options = { ...(shape.options || {}), ...normalizeOptions({ ...(shape.options || {}), ...changes.options }) };
  return copy;
}

function extractText(groupHTML = '') {
  return String(groupHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateShapeGeometry(shape, index, errors) {
  const numbers = [];
  if (['rectangle', 'frame', 'text', 'code', 'image', 'icon'].includes(shape.type)) numbers.push(['x', shape.x], ['y', shape.y]);
  if (['rectangle', 'frame', 'image', 'icon'].includes(shape.type)) numbers.push(['width', shape.width], ['height', shape.height]);
  if (shape.type === 'circle') numbers.push(['x', shape.x], ['y', shape.y], ['rx', shape.rx], ['ry', shape.ry]);
  if (shape.startPoint) numbers.push(['startPoint.x', shape.startPoint.x], ['startPoint.y', shape.startPoint.y]);
  if (shape.endPoint) numbers.push(['endPoint.x', shape.endPoint.x], ['endPoint.y', shape.endPoint.y]);
  for (const [field, value] of numbers) if (!Number.isFinite(Number(value))) errors.push(`Shape ${index} has invalid ${field}`);
  if (['rectangle', 'frame', 'image', 'icon'].includes(shape.type) && (Number(shape.width) <= 0 || Number(shape.height) <= 0)) errors.push(`Shape ${index} must have positive dimensions`);
  if (shape.type === 'circle' && (Number(shape.rx) <= 0 || Number(shape.ry) <= 0)) errors.push(`Shape ${index} must have positive radii`);
  if (shape.type === 'freehandStroke' && (!Array.isArray(shape.points) || shape.points.length < 2 || shape.points.length > 4096)) errors.push(`Shape ${index} has invalid freehand points`);
  if (shape.type === 'text' && typeof shape.groupHTML !== 'string') errors.push(`Shape ${index} is missing text markup`);
  if (shape.type === 'code' && typeof shape.groupHTML !== 'string') errors.push(`Shape ${index} is missing code markup`);
  if (shape.type === 'image' && typeof shape.href !== 'string') errors.push(`Shape ${index} is missing image href`);
  if (shape.type === 'icon' && typeof shape.elementHTML !== 'string') errors.push(`Shape ${index} is missing icon markup`);
}

export function getSceneSummary(scene) {
  const counts = {};
  for (const shape of scene.shapes || []) counts[shape.type] = (counts[shape.type] || 0) + 1;
  return { name: scene.name, format: scene.format, version: scene.version, revision: Number(scene.mcpRevision || 0), shapeCount: scene.shapes?.length || 0, counts, bounds: getSceneBounds(scene) };
}

export function getSceneBounds(scene) {
  const boxes = (scene.shapes || []).map(shapeBounds).filter(Boolean);
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x)), minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width)), maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function shapeBounds(shape) {
  if (shape.type === 'circle') return { x: shape.x - shape.rx, y: shape.y - shape.ry, width: shape.rx * 2, height: shape.ry * 2 };
  if (shape.startPoint && shape.endPoint) {
    const x = Math.min(shape.startPoint.x, shape.endPoint.x), y = Math.min(shape.startPoint.y, shape.endPoint.y);
    return { x, y, width: Math.abs(shape.endPoint.x - shape.startPoint.x), height: Math.abs(shape.endPoint.y - shape.startPoint.y) };
  }
  if (Array.isArray(shape.points) && shape.points.length) {
    const xs = shape.points.map((p) => p[0]), ys = shape.points.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  if (shape.type === 'text') return { x: finite(shape.x), y: finite(shape.y), width: 160, height: 32 };
  return { x: finite(shape.x), y: finite(shape.y), width: positive(shape.width), height: positive(shape.height) };
}

export function mergeTemplateScene(sceneInput, templateInput, { x, y } = {}) {
  const scene = clone(sceneInput), template = clone(templateInput);
  const validation = validateScene(template);
  if (!validation.valid) throw new Error(`Template scene is invalid: ${validation.errors.join('; ')}`);
  if (scene.shapes.length + template.shapes.length > MAX_SHAPES) throw new Error(`Imported template would exceed ${MAX_SHAPES} shapes`);
  const bounds = getSceneBounds(template) || { x: 0, y: 0 };
  const targetX = finite(x, scene.viewport?.x || 0), targetY = finite(y, scene.viewport?.y || 0);
  const dx = targetX - bounds.x, dy = targetY - bounds.y;
  const idMap = new Map(template.shapes.map((shape) => [shape.shapeID, `${shape.type}-${crypto.randomUUID()}`]));
  const imported = template.shapes.map((shape) => {
    const moved = translateShape(shape, dx, dy);
    moved.shapeID = idMap.get(shape.shapeID);
    if (moved.parentFrame) moved.parentFrame = idMap.get(moved.parentFrame) || null;
    if (Array.isArray(moved.containedShapeIDs)) moved.containedShapeIDs = moved.containedShapeIDs.map((id) => idMap.get(id)).filter(Boolean);
    if (moved.startAttachmentID) moved.startAttachmentID = idMap.get(moved.startAttachmentID) || null;
    if (moved.endAttachmentID) moved.endAttachmentID = idMap.get(moved.endAttachmentID) || null;
    if (moved.groupHTML) moved.groupHTML = moved.groupHTML.split(shape.shapeID).join(moved.shapeID);
    if (moved.elementHTML) moved.elementHTML = moved.elementHTML.split(shape.shapeID).join(moved.shapeID);
    return moved;
  });
  scene.shapes.push(...imported);
  scene.mcpRevision = Number(scene.mcpRevision || 0) + 1;
  scene.updatedAt = new Date().toISOString();
  return { scene, revision: scene.mcpRevision, importedShapeIDs: imported.map((shape) => shape.shapeID) };
}

export const MCP_LIMITS = Object.freeze({ maxShapes: MAX_SHAPES, maxOperations: MAX_OPERATIONS });
