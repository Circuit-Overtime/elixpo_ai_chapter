/* eslint-disable */
import { pushCreateAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import {
    MAX_GESTURE_POINTS,
    distance,
    predictDrawnShape,
} from './shapeRecognition.js';

export {
    MAX_GESTURE_POINTS,
    capGestureSample,
    predictDrawnShape,
} from './shapeRecognition.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SCREEN_SAMPLE_PX = 4;

let drawing = false;
let points = [];
let previewPath = null;
let previewFrame = 0;
let latestPrediction = null;

function getThemeStroke() {
    return document.body?.classList.contains('theme-dark') ? '#f7f4ff' : '#000000';
}

function getSVGPoint(event) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    return {
        x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
        y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height,
        pressure: event.pressure || 0.5,
    };
}

function rotatedPoint(center, x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}

function pathForPrediction(prediction) {
    if (!prediction) return '';
    if (prediction.type === 'rectangle') {
        const halfW = prediction.width / 2;
        const halfH = prediction.height / 2;
        const corners = [
            rotatedPoint(prediction.center, -halfW, -halfH, prediction.angle),
            rotatedPoint(prediction.center, halfW, -halfH, prediction.angle),
            rotatedPoint(prediction.center, halfW, halfH, prediction.angle),
            rotatedPoint(prediction.center, -halfW, halfH, prediction.angle),
        ];
        return `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`;
    }
    if (prediction.type === 'circle') {
        const rx = prediction.width / 2;
        const ry = prediction.height / 2;
        const start = rotatedPoint(prediction.center, rx, 0, prediction.angle);
        const opposite = rotatedPoint(prediction.center, -rx, 0, prediction.angle);
        const rotation = prediction.angle * 180 / Math.PI;
        return `M ${start.x} ${start.y} A ${rx} ${ry} ${rotation} 1 0 ${opposite.x} ${opposite.y} A ${rx} ${ry} ${rotation} 1 0 ${start.x} ${start.y}`;
    }
    if (prediction.type === 'triangle' || prediction.type === 'diamond') {
        return prediction.vertices.reduce(
            (path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point.x} ${point.y}`,
            '',
        ) + ' Z';
    }
    if (prediction.type === 'freehand') {
        if (!prediction.points.length) return '';
        return prediction.points.reduce((path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point.x} ${point.y}`, '');
    }
    const { start, end } = prediction;
    let path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    if (prediction.type === 'arrow') {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const head = Math.min(24 / (window.currentZoom || 1), distance(start, end) * 0.25);
        const left = rotatedPoint(end, -head, head * 0.55, angle);
        const right = rotatedPoint(end, -head, -head * 0.55, angle);
        path += ` M ${left.x} ${left.y} L ${end.x} ${end.y} L ${right.x} ${right.y}`;
    }
    return path;
}

function ensurePreview() {
    if (previewPath?.isConnected) return;
    previewPath = document.createElementNS(SVG_NS, 'path');
    previewPath.dataset.recognitionPreview = 'true';
    previewPath.setAttribute('fill', 'rgba(148, 148, 158, 0.06)');
    previewPath.setAttribute('stroke', '#9696a0');
    previewPath.setAttribute('stroke-width', '2');
    previewPath.setAttribute('stroke-dasharray', '5 7');
    previewPath.setAttribute('stroke-linecap', 'round');
    previewPath.setAttribute('stroke-linejoin', 'round');
    previewPath.setAttribute('vector-effect', 'non-scaling-stroke');
    previewPath.setAttribute('pointer-events', 'none');
    svg.appendChild(previewPath);
}

function renderPreview() {
    previewFrame = 0;
    if (!drawing) return;
    latestPrediction = predictDrawnShape(points);
    ensurePreview();
    previewPath.setAttribute('d', pathForPrediction(latestPrediction));
    previewPath.setAttribute('fill', ['rectangle', 'circle', 'triangle', 'diamond'].includes(latestPrediction?.type)
        ? 'rgba(148, 148, 158, 0.06)'
        : 'none');
}

function schedulePreview() {
    if (!previewFrame) previewFrame = requestAnimationFrame(renderPreview);
}

function cleanupPreview() {
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    previewPath?.remove();
    previewPath = null;
}

function currentStyle() {
    const settings = window.freehandToolSettings || {};
    const outline = settings.strokeStyle || 'solid';
    return {
        stroke: settings.strokeColor || getThemeStroke(),
        fill: 'transparent',
        fillStyle: 'none',
        strokeWidth: settings.strokeWidth || 2,
        strokeDasharray: outline === 'dashed' ? '10,10' : (outline === 'dotted' ? '2,8' : ''),
        outline,
    };
}

function attachToContainingFrame(shape) {
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
        const frame = shapes[index];
        if (frame.shapeName !== 'frame' || typeof frame.isShapeInFrame !== 'function') continue;
        if (!frame.isShapeInFrame(shape)) continue;
        frame.addShapeToFrame(shape);
        pushFrameAttachmentAction(frame, shape, 'attach', null);
        break;
    }
}

function createPredictedShape(prediction) {
    if (!prediction) return null;
    const style = currentStyle();
    let shape = null;
    if (prediction.type === 'rectangle') {
        shape = new window.Rectangle(
            prediction.center.x - prediction.width / 2,
            prediction.center.y - prediction.height / 2,
            prediction.width,
            prediction.height,
            style,
        );
        shape.rotation = prediction.angle * 180 / Math.PI;
        shape.draw();
    } else if (prediction.type === 'circle') {
        shape = new window.Circle(
            prediction.center.x,
            prediction.center.y,
            prediction.width / 2,
            prediction.height / 2,
            style,
        );
        shape.rotation = prediction.angle * 180 / Math.PI;
        shape.draw();
    } else if (prediction.type === 'triangle' || prediction.type === 'diamond') {
        const polygonPoints = [...prediction.vertices, prediction.vertices[0]];
        shape = new window.FreehandStroke(
            polygonPoints.map((point) => [point.x, point.y, 0.5]),
            {
                stroke: 'transparent',
                fill: 'transparent',
                fillStyle: 'none',
                outlineStroke: style.stroke,
                outlineWidth: style.strokeWidth,
                closedFill: true,
                strokeWidth: style.strokeWidth,
                strokeStyle: style.outline,
                roughness: 0,
            },
        );
        shape.recognizedShapeType = prediction.type;
    } else if (prediction.type === 'freehand') {
        const brush = window.freehandToolSettings || {};
        shape = new window.FreehandStroke(
            prediction.points.map((point) => [point.x, point.y, point.pressure || 0.5]),
            {
                stroke: style.stroke,
                strokeWidth: style.strokeWidth,
                strokeStyle: style.outline,
                thinning: brush.thinning ?? 0.5,
                roughness: brush.roughness || 'smooth',
                strokeOpacity: brush.opacity ?? 1,
            },
        );
    } else if (prediction.type === 'arrow') {
        shape = new window.Arrow(prediction.start, prediction.end, {
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            arrowOutlineStyle: style.outline,
            arrowCurved: 'straight',
        });
    } else {
        shape = new window.Line(prediction.start, prediction.end, {
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
            roughness: 1.5,
            bowing: 1,
        });
    }
    shapes.push(shape);
    pushCreateAction(shape);
    attachToContainingFrame(shape);
    return shape;
}

export function handleShapeRecognitionDown(event) {
    if (!window.isShapeRecognitionToolActive || event.button !== 0) return;
    drawing = true;
    points = [getSVGPoint(event)];
    latestPrediction = null;
    ensurePreview();
    schedulePreview();
}

export function handleShapeRecognitionMove(event) {
    if (!drawing || !window.isShapeRecognitionToolActive) return;
    const point = getSVGPoint(event);
    const last = points[points.length - 1];
    const threshold = MIN_SCREEN_SAMPLE_PX / (window.currentZoom || 1);
    if (distance(last, point) < threshold) return;
    if (points.length < MAX_GESTURE_POINTS) {
        points.push(point);
    } else {
        // Preserve the first point and evenly discard older detail. Memory and
        // recognition time stay constant even during very long gestures.
        points = [points[0], ...points.slice(2).filter((_, index) => index % 2 === 0), point];
    }
    schedulePreview();
}

export function handleShapeRecognitionUp(event) {
    if (!drawing) return;
    drawing = false;
    const rect = svg.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        const point = getSVGPoint(event);
        if (distance(points[points.length - 1], point) > 0) points.push(point);
    }
    latestPrediction = predictDrawnShape(points);
    cleanupPreview();

    const prediction = latestPrediction;
    points = [];
    latestPrediction = null;
    if (!prediction || prediction.pathLength < MIN_SHAPE_SIZE) return;

    const shape = createPredictedShape(prediction);
    if (!shape) return;
    if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
    currentShape = shape;
    if (shape.shapeName === 'freehandStroke' && typeof shape.selectStroke === 'function') {
        shape.selectStroke();
    } else {
        shape.isSelected = true;
        if (typeof shape.addAnchors === 'function') shape.addAnchors();
    }
}

export function cancelShapeRecognition() {
    drawing = false;
    points = [];
    latestPrediction = null;
    cleanupPreview();
}

window.__cancelShapeRecognition = cancelShapeRecognition;
