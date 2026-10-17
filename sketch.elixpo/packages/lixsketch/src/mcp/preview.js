import { getSceneBounds } from './scene.js';

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

function options(shape) {
  return {
    stroke: color(shape.options?.stroke, '#8b76d6'),
    fill: shape.options?.fill === 'transparent' ? 'none' : color(shape.options?.fill, 'none'),
    width: Math.max(0.5, Math.min(20, Number(shape.options?.strokeWidth) || 2)),
    opacity: Math.max(0, Math.min(1, Number(shape.options?.opacity) || 1)),
  };
}

function renderShape(shape) {
  const style = options(shape);
  const attrs = `stroke="${style.stroke}" stroke-width="${style.width}" fill="${style.fill}" opacity="${style.opacity}"`;
  if (shape.type === 'rectangle') return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="6" ${attrs}/>`;
  if (shape.type === 'circle') return `<ellipse cx="${shape.x}" cy="${shape.y}" rx="${shape.rx}" ry="${shape.ry}" ${attrs}/>`;
  if (shape.type === 'line') return `<line x1="${shape.startPoint.x}" y1="${shape.startPoint.y}" x2="${shape.endPoint.x}" y2="${shape.endPoint.y}" ${attrs}/>`;
  if (shape.type === 'arrow') return `<line x1="${shape.startPoint.x}" y1="${shape.startPoint.y}" x2="${shape.endPoint.x}" y2="${shape.endPoint.y}" ${attrs} marker-end="url(#arrowhead)"/>`;
  if (shape.type === 'freehandStroke') return `<polyline points="${shape.points.map((p) => `${p[0]},${p[1]}`).join(' ')}" ${attrs} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (shape.type === 'frame') return `<g><rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ${attrs} stroke-dasharray="6 5"/><text x="${shape.x + 8}" y="${shape.y - 8}" fill="#9f94b5" font-size="14">${esc(shape.frameName || 'Frame')}</text></g>`;
  if (shape.type === 'text') return `<text x="${shape.x}" y="${shape.y}" fill="${color(shape.mcpColor, '#e8e3f3')}" font-size="${Number(shape.mcpFontSize) || 20}" font-family="sans-serif">${esc(shape.mcpText || String(shape.groupHTML || '').replace(/<[^>]+>/g, ' ').trim())}</text>`;
  return '';
}

export function renderSceneSvg(scene, { background = '#15111f', padding = 40 } = {}) {
  const bounds = getSceneBounds(scene) || { x: 0, y: 0, width: 1280, height: 720 };
  const pad = Math.max(0, Math.min(200, Number(padding) || 0));
  const viewBox = { x: bounds.x - pad, y: bounds.y - pad, width: Math.max(1, bounds.width + pad * 2), height: Math.max(1, bounds.height + pad * 2) };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${Math.ceil(viewBox.width)}" height="${Math.ceil(viewBox.height)}"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#8b76d6"/></marker></defs><rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="${color(background, '#15111f')}"/>${(scene.shapes || []).map(renderShape).join('')}</svg>`;
  if (new TextEncoder().encode(svg).byteLength > MAX_PREVIEW_BYTES) {
    throw new Error('Canvas preview exceeds the 5 MB output limit');
  }
  return svg;
}
