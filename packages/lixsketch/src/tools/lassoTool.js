/* eslint-disable */

import { multiSelection } from '../core/Selection.js';

const MAX_POINTS = 192;
const MIN_SAMPLE_PX = 4;
let points = [];
let preview = null;
let drawing = false;

function coords(e) {
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - rect.left) / rect.width) * vb.width, y: vb.y + ((e.clientY - rect.top) / rect.height) * vb.height };
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
    }
    return inside;
}

function boundsPoints(shape) {
    if ((shape.shapeName === 'line' || shape.shapeName === 'arrow') && shape.startPoint && shape.endPoint) return [shape.startPoint, shape.endPoint];
    if (shape.shapeName === 'freehandStroke' && Array.isArray(shape.points)) {
        const step = Math.max(1, Math.ceil(shape.points.length / 16));
        return shape.points.filter((_, i) => i % step === 0).map((p) => ({ x: p[0], y: p[1] }));
    }
    let x = shape.x || 0, y = shape.y || 0, width = shape.width || 0, height = shape.height || 0;
    if (shape.shapeName === 'circle') { x = shape.x - shape.rx; y = shape.y - shape.ry; width = shape.rx * 2; height = shape.ry * 2; }
    if ((!width || !height) && shape.group?.getBBox) {
        try { const box = shape.group.getBBox(); x = box.x; y = box.y; width = box.width; height = box.height; } catch {}
    }
    const raw = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x: x + width / 2, y: y + height / 2 }];
    const rotation = Number(shape.rotation) || 0;
    if (!rotation) return raw;
    const cx = x + width / 2, cy = y + height / 2, angle = rotation * Math.PI / 180;
    return raw.map((p) => ({ x: cx + (p.x - cx) * Math.cos(angle) - (p.y - cy) * Math.sin(angle), y: cy + (p.x - cx) * Math.sin(angle) + (p.y - cy) * Math.cos(angle) }));
}

function cleanup() {
    preview?.remove(); preview = null; points = []; drawing = false;
}

export function handleLassoDown(e) {
    if (!window.isLassoToolActive) return;
    cleanup(); multiSelection.clearSelection(); drawing = true; points = [coords(e)];
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.setAttribute('fill', 'rgba(139, 118, 214, .10)'); preview.setAttribute('stroke', '#a78bfa');
    preview.setAttribute('stroke-dasharray', '5 4'); preview.setAttribute('vector-effect', 'non-scaling-stroke');
    preview.style.pointerEvents = 'none'; svg.appendChild(preview);
}

export function handleLassoMove(e) {
    if (!drawing) return;
    const p = coords(e), last = points[points.length - 1];
    const min = MIN_SAMPLE_PX / (window.currentZoom || 1);
    if (Math.hypot(p.x - last.x, p.y - last.y) < min) return;
    if (points.length < MAX_POINTS) points.push(p); else points[points.length - 1] = p;
    preview?.setAttribute('d', `M ${points.map((v) => `${v.x} ${v.y}`).join(' L ')} Z`);
}

export function handleLassoUp() {
    if (!drawing) return;
    const polygon = points.slice(); cleanup();
    // Switching tools clears selection state. Do that before applying the
    // lasso result so the newly selected shapes survive the tool transition.
    window.__sketchStoreApi?.setActiveTool('select', { afterDraw: true });
    if (polygon.length >= 3 && Array.isArray(window.shapes)) {
        const selected = window.shapes.filter((shape) => boundsPoints(shape).every((p) => pointInPolygon(p, polygon)));
        const filtered = selected.filter((shape) => !shape.parentFrame || !selected.includes(shape.parentFrame));
        // Apply the batch once; addShape() rebuilds controls per item and becomes
        // unnecessarily quadratic for a large lasso selection.
        filtered.forEach((shape) => { multiSelection.selectedShapes.add(shape); shape.isSelected = true; });
        if (filtered.length) multiSelection.updateControls();
        window.currentShape = filtered.length === 1 ? filtered[0] : null;
    }
}

export function cancelLasso() { cleanup(); }
window.__cancelLasso = cancelLasso;
