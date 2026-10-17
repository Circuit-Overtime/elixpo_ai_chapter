import { parseLixScript, resolveShapeRefs } from '../core/LixScriptParser.js';

const MAX_SOURCE_LENGTH = 100_000;

function options(def) {
  return {
    stroke: def.props.stroke || def.props.color || '#8b76d6',
    strokeWidth: Number(def.props.strokeWidth) || 2,
    fill: def.props.fill || 'transparent',
    fillStyle: def.props.fillStyle || 'solid',
    roughness: def.props.roughness === undefined ? 1.2 : Number(def.props.roughness),
    opacity: def.props.opacity === undefined ? 1 : Number(def.props.opacity),
  };
}

function bounds(def) {
  const width = Number(def.width) || (def.type === 'frame' ? 600 : def.type === 'rect' ? 160 : 80);
  const height = Number(def.height) || (def.type === 'frame' ? 400 : def.type === 'rect' ? 60 : 80);
  return { x: Number(def.x) || 0, y: Number(def.y) || 0, width, height };
}

function endpoint(point, definitions) {
  if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) return { x: point.x, y: point.y };
  const target = definitions.get(point?.ref);
  if (!target) throw new Error(`Cannot resolve LixScript connection target "${point?.ref || ''}"`);
  const box = bounds(target);
  const offset = Number(point.offset) || 0;
  const side = point.side || 'center';
  if (side === 'top') return { x: box.x + box.width / 2 + offset, y: box.y };
  if (side === 'bottom') return { x: box.x + box.width / 2 + offset, y: box.y + box.height };
  if (side === 'left') return { x: box.x, y: box.y + box.height / 2 + offset };
  if (side === 'right') return { x: box.x + box.width, y: box.y + box.height / 2 + offset };
  return { x: box.x + box.width / 2 + offset, y: box.y + box.height / 2 };
}

function labelShape(def, shapeID, parentFrame) {
  if (!def.props.label) return null;
  const box = bounds(def);
  return {
    type: 'text', shapeID: `${shapeID}-label`, x: box.x + box.width / 2, y: box.y + box.height / 2,
    text: String(def.props.label), fontSize: Number(def.props.labelFontSize) || 14,
    color: def.props.labelColor || '#e8e3f3', parentFrame,
  };
}

export function compileLixScript(source, { x = 0, y = 0 } = {}) {
  const input = String(source || '');
  if (!input.trim()) throw new Error('LixScript source is required');
  if (input.length > MAX_SOURCE_LENGTH) throw new Error('LixScript source exceeds 100 KB');
  const parsed = parseLixScript(input);
  if (parsed.errors.length) throw new Error(`LixScript parse failed: ${parsed.errors.map((entry) => `line ${entry.line}: ${entry.message}`).join('; ')}`);
  resolveShapeRefs(parsed.shapes);
  const prefix = `lix-${crypto.randomUUID().slice(0, 8)}`;
  const shapeId = (id) => `${prefix}-${id}`;
  const definitions = new Map(parsed.shapes.map((shape) => [shape.id, shape]));
  const frame = parsed.shapes.find((shape) => shape.type === 'frame');
  const frameId = frame ? shapeId(frame.id) : `${prefix}-frame`;
  const frameMembers = frame?.props.contains ? new Set(String(frame.props.contains).split(',').map((value) => value.trim()).filter(Boolean)) : null;
  const shapes = [];
  for (const def of parsed.shapes) {
    const box = bounds(def);
    const parentFrame = def === frame || (frameMembers && !frameMembers.has(def.id)) ? null : frameId;
    let shape;
    const id = shapeId(def.id);
    if (def.type === 'rect') shape = { type: 'rectangle', shapeID: id, x: box.x + x, y: box.y + y, width: box.width, height: box.height, rotation: Number(def.props.rotation) || 0, options: options(def), parentFrame };
    else if (def.type === 'circle' || def.type === 'ellipse') shape = { type: 'circle', shapeID: id, x: box.x + box.width / 2 + x, y: box.y + box.height / 2 + y, rx: box.width / 2, ry: box.height / 2, rotation: Number(def.props.rotation) || 0, options: options(def), parentFrame };
    else if (def.type === 'text') shape = { type: 'text', shapeID: id, x: box.x + x, y: box.y + y, text: String(def.props.content || def.props.text || 'Text'), fontSize: Number(def.props.fontSize) || 16, color: def.props.color || def.props.fill || '#e8e3f3', fontFamily: def.props.fontFamily || 'lixFont', parentFrame };
    else if (def.type === 'frame') shape = { type: 'frame', shapeID: id, x: box.x + x, y: box.y + y, width: box.width, height: box.height, frameName: String(def.props.frameName || def.props.name || def.id), fillStyle: def.props.fillStyle || 'transparent', fillColor: def.props.fillColor || def.props.fill || '#1e1e28', options: options(def) };
    else if (def.type === 'freehand') {
      const points = String(def.props.points || '').split(';').map((value) => value.split(',').map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([px, py, pressure = 0.5]) => [px + x, py + y, pressure]);
      shape = { type: 'freehandStroke', shapeID: id, points, options: options(def), parentFrame };
    } else if (def.type === 'line' || def.type === 'arrow') {
      const startPoint = endpoint(def.from, definitions), endPoint = endpoint(def.to, definitions);
      startPoint.x += x; startPoint.y += y; endPoint.x += x; endPoint.y += y;
      shape = def.type === 'line'
        ? { type: 'line', shapeID: id, startPoint, endPoint, isCurved: def.props.curve === true || def.props.curve === 'true', options: options(def), parentFrame }
        : { type: 'arrow', shapeID: id, startPoint, endPoint, arrowHeadStyle: def.props.head || 'triangle', arrowOutlineStyle: def.props.style || 'solid', arrowCurved: def.props.curve && def.props.curve !== 'straight', arrowCurveAmount: Number(def.props.curveAmount) || 0.2, options: options(def), parentFrame };
    } else throw new Error(`LixScript ${def.type} is not writable through MCP`);
    shapes.push(shape);
    const label = labelShape(def, id, parentFrame);
    if (label) { label.x += x; label.y += y; shapes.push(label); }
  }
  if (!frame && shapes.length) {
    const boxes = parsed.shapes.filter((def) => !['arrow', 'line'].includes(def.type)).map(bounds);
    const pointShapes = shapes.filter((shape) => shape.startPoint && shape.endPoint);
    const minX = boxes.length ? Math.min(...boxes.map((box) => box.x)) + x : Math.min(...pointShapes.flatMap((shape) => [shape.startPoint.x, shape.endPoint.x]));
    const minY = boxes.length ? Math.min(...boxes.map((box) => box.y)) + y : Math.min(...pointShapes.flatMap((shape) => [shape.startPoint.y, shape.endPoint.y]));
    const maxX = boxes.length ? Math.max(...boxes.map((box) => box.x + box.width)) + x : Math.max(...pointShapes.flatMap((shape) => [shape.startPoint.x, shape.endPoint.x]));
    const maxY = boxes.length ? Math.max(...boxes.map((box) => box.y + box.height)) + y : Math.max(...pointShapes.flatMap((shape) => [shape.startPoint.y, shape.endPoint.y]));
    shapes.unshift({ type: 'frame', shapeID: frameId, x: minX - 40, y: minY - 40, width: Math.max(80, maxX - minX + 80), height: Math.max(80, maxY - minY + 80), frameName: 'LixScript', fillStyle: 'transparent', fillColor: '#1e1e28' });
  }
  return { shapes, operations: shapes.map((shape) => ({ op: 'add', shape })), sourceShapeCount: parsed.shapes.length };
}
