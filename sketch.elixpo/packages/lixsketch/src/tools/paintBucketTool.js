/* eslint-disable */
import { pushOptionsChangeAction } from '../core/UndoRedo.js';

const OPTION_FILL_SHAPES = new Set(['rectangle', 'circle']);

window.paintBucketSettings = window.paintBucketSettings || {
    fillColor: '#A98DEB',
    fillStyle: 'solid',
};

function getSVGPoint(event) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    return {
        x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
        y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height,
    };
}

function isClosedFreehand(shape) {
    if (shape?.shapeName !== 'freehandStroke' || !Array.isArray(shape.points) || shape.points.length < 3) return false;
    if (shape.options?.closedFill) return true;
    const first = shape.points[0];
    const last = shape.points[shape.points.length - 1];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of shape.points) {
        const x = Number(point[0]) || 0;
        const y = Number(point[1]) || 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const diagonal = Math.hypot(maxX - minX, maxY - minY);
    const closeDistance = Math.hypot(last[0] - first[0], last[1] - first[1]);
    const tolerance = Math.max((shape.options?.strokeWidth || 2) * 2, Math.min(16, diagonal * 0.08));
    return diagonal > 0 && closeDistance <= tolerance;
}

export function isPaintBucketFillable(shape) {
    return OPTION_FILL_SHAPES.has(shape?.shapeName)
        || shape?.shapeName === 'frame'
        || isClosedFreehand(shape);
}

function findShapeAt(x, y) {
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
        const shape = shapes[index];
        if (typeof shape?.contains !== 'function') continue;
        if (shape.contains(x, y)) return shape;
    }
    return null;
}

export function fillShape(shape, settings = window.paintBucketSettings) {
    if (!isPaintBucketFillable(shape)) return false;
    const transparent = settings.fillStyle === 'none' || settings.fillStyle === 'transparent';
    const nextFill = transparent ? 'transparent' : settings.fillColor;
    const nextStyle = transparent ? 'none' : settings.fillStyle;

    if (shape.shapeName === 'frame') {
        if (shape.fillColor === nextFill && shape.fillStyle === nextStyle) return false;
        const oldOptions = { ...shape.options, fillColor: shape.fillColor, fillStyle: shape.fillStyle };
        const newOptions = { ...shape.options, fillColor: nextFill, fillStyle: nextStyle };
        pushOptionsChangeAction(shape, oldOptions, newOptions);
        shape.fillColor = nextFill;
        shape.fillStyle = nextStyle;
        shape.options = { ...shape.options, fillColor: nextFill, fillStyle: nextStyle };
        shape.draw();
        return true;
    }

    const freehandOptions = shape.shapeName === 'freehandStroke'
        ? {
            closedFill: true,
            outlineStroke: shape.options.outlineStroke || shape.options.stroke,
        }
        : {};
    if (shape.options.fill === nextFill
        && shape.options.fillStyle === nextStyle
        && Object.entries(freehandOptions).every(([key, value]) => shape.options[key] === value)) return false;

    const oldOptions = { ...shape.options };
    const newOptions = { ...shape.options, ...freehandOptions, fill: nextFill, fillStyle: nextStyle };
    pushOptionsChangeAction(shape, oldOptions, newOptions);
    shape.options = newOptions;
    shape.draw();
    return true;
}

export function handlePaintBucketDown(event) {
    if (!window.isPaintBucketToolActive || event.button !== 0) return;
    const { x, y } = getSVGPoint(event);
    const shape = findShapeAt(x, y);
    if (!shape) {
        window.dispatchEvent(new CustomEvent('lixsketch:bucket-miss'));
        return;
    }
    if (!isPaintBucketFillable(shape)) {
        window.dispatchEvent(new CustomEvent('lixsketch:bucket-not-fillable', {
            detail: { shapeID: shape.shapeID, shapeType: shape.shapeName },
        }));
        return;
    }
    if (!fillShape(shape)) return;
    window.dispatchEvent(new CustomEvent('lixsketch:bucket-filled', { detail: { shapeID: shape.shapeID } }));
}
