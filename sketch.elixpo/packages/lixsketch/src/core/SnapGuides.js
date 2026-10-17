/**
 * SnapGuides - Shows thin red alignment guides when moving shapes
 * to help users align shapes with each other and the viewport.
 */

const SNAP_THRESHOLD = 6; // pixels — how close before snapping
const BREAK_THRESHOLD = 12; // pixels — how far mouse must move to break free
const GUIDE_COLOR = '#ff4444';
const GUIDE_WIDTH = 1;

let guideLayer = null;

// Track active snaps so we can implement break-out
let activeSnapX = null; // { guideValue, mouseAtSnap }
let activeSnapY = null;

function ensureGuideLayer() {
    if (guideLayer && guideLayer.parentNode) return guideLayer;
    const svg = window.svg;
    if (!svg) return null;

    guideLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guideLayer.setAttribute('id', 'snap-guides');
    guideLayer.setAttribute('pointer-events', 'none');
    svg.appendChild(guideLayer);
    return guideLayer;
}

function clearGuides() {
    if (guideLayer) {
        while (guideLayer.firstChild) guideLayer.removeChild(guideLayer.firstChild);
    }
}

function drawGuide(x1, y1, x2, y2) {
    const layer = ensureGuideLayer();
    if (!layer) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', GUIDE_COLOR);
    line.setAttribute('stroke-width', GUIDE_WIDTH);
    line.setAttribute('stroke-dasharray', '4 2');
    layer.appendChild(line);
}

/**
 * Get the bounding box of a shape in canvas coordinates
 */
function getShapeBounds(shape) {
    if (!shape) return null;

    const name = shape.shapeName;
    if (name === 'rectangle' || name === 'frame') {
        return {
            left: shape.x,
            top: shape.y,
            right: shape.x + shape.width,
            bottom: shape.y + shape.height,
            cx: shape.x + shape.width / 2,
            cy: shape.y + shape.height / 2,
        };
    }
    if (name === 'circle') {
        return {
            left: shape.x - shape.rx,
            top: shape.y - shape.ry,
            right: shape.x + shape.rx,
            bottom: shape.y + shape.ry,
            cx: shape.x,
            cy: shape.y,
        };
    }
    if (name === 'text' || name === 'code' || name === 'image' || name === 'icon') {
        const el = shape.group || shape.element;
        if (!el) return null;
        const bbox = el.getBBox();
        return {
            left: bbox.x,
            top: bbox.y,
            right: bbox.x + bbox.width,
            bottom: bbox.y + bbox.height,
            cx: bbox.x + bbox.width / 2,
            cy: bbox.y + bbox.height / 2,
        };
    }
    if (name === 'line' || name === 'arrow') {
        const sx = shape.startPoint?.x ?? 0;
        const sy = shape.startPoint?.y ?? 0;
        const ex = shape.endPoint?.x ?? 0;
        const ey = shape.endPoint?.y ?? 0;
        return {
            left: Math.min(sx, ex),
            top: Math.min(sy, ey),
            right: Math.max(sx, ex),
            bottom: Math.max(sy, ey),
            cx: (sx + ex) / 2,
            cy: (sy + ey) / 2,
        };
    }
    return null;
}

/**
 * Get the canvas viewport reference points for global alignment.
 */
function getCanvasGuides() {
    const vb = window.currentViewBox;
    if (!vb) return [];

    return [
        { // Viewport center
            left: vb.x + vb.width / 2,
            top: vb.y + vb.height / 2,
            right: vb.x + vb.width / 2,
            bottom: vb.y + vb.height / 2,
            cx: vb.x + vb.width / 2,
            cy: vb.y + vb.height / 2,
        },
        { // Viewport edges
            left: vb.x,
            top: vb.y,
            right: vb.x + vb.width,
            bottom: vb.y + vb.height,
            cx: vb.x + vb.width / 2,
            cy: vb.y + vb.height / 2,
        },
    ];
}

/**
 * Calculate snap offsets and draw guides.
 * Returns { dx, dy } snap offset to apply.
 *
 * Uses a break-out system: once snapped, the shape stays on the guide
 * until the mouse moves BREAK_THRESHOLD away, then it breaks free.
 */
export function calculateSnap(movingShape, shiftKey = false, mouseX, mouseY) {
    clearGuides();

    const shapes = window.shapes;
    if (!shapes || !movingShape) return { dx: 0, dy: 0 };

    const moving = getShapeBounds(movingShape);
    if (!moving) return { dx: 0, dy: 0 };

    // Check if we should break out of an active snap
    if (activeSnapX && mouseX !== undefined) {
        if (Math.abs(mouseX - activeSnapX.mouseAtSnap) > BREAK_THRESHOLD) {
            activeSnapX = null;
        }
    }
    if (activeSnapY && mouseY !== undefined) {
        if (Math.abs(mouseY - activeSnapY.mouseAtSnap) > BREAK_THRESHOLD) {
            activeSnapY = null;
        }
    }

    let snapX = null;
    let snapY = null;
    let bestDistX = SNAP_THRESHOLD;
    let bestDistY = SNAP_THRESHOLD;

    const movingXs = [moving.left, moving.cx, moving.right];
    const movingYs = [moving.top, moving.cy, moving.bottom];

    const vb = window.currentViewBox;
    const extendY1 = vb ? vb.y : 0;
    const extendY2 = vb ? vb.y + vb.height : 10000;
    const extendX1 = vb ? vb.x : 0;
    const extendX2 = vb ? vb.x + vb.width : 10000;

    let otherShapeCount = 0;

    for (const shape of shapes) {
        if (shape === movingShape) continue;
        if (window.multiSelection && window.multiSelection.selectedShapes?.has(shape)) continue;

        const other = getShapeBounds(shape);
        if (!other) continue;
        otherShapeCount++;

        const otherXs = [other.left, other.cx, other.right];
        const otherYs = [other.top, other.cy, other.bottom];

        for (const mx of movingXs) {
            for (const ox of otherXs) {
                const dist = Math.abs(mx - ox);
                if (dist < bestDistX) {
                    bestDistX = dist;
                    snapX = { offset: ox - mx, x: ox, extendY1, extendY2 };
                }
            }
        }

        for (const my of movingYs) {
            for (const oy of otherYs) {
                const dist = Math.abs(my - oy);
                if (dist < bestDistY) {
                    bestDistY = dist;
                    snapY = { offset: oy - my, y: oy, extendX1, extendX2 };
                }
            }
        }
    }

    // Viewport guides when alone, no snap found, or shift held
    if (shiftKey || otherShapeCount === 0 || (!snapX && !snapY)) {
        const canvasGuides = getCanvasGuides();
        for (const guide of canvasGuides) {
            const guideXs = [guide.left, guide.cx, guide.right];
            const guideYs = [guide.top, guide.cy, guide.bottom];

            for (const mx of movingXs) {
                for (const gx of guideXs) {
                    const dist = Math.abs(mx - gx);
                    if (dist < bestDistX) {
                        bestDistX = dist;
                        snapX = { offset: gx - mx, x: gx, extendY1, extendY2 };
                    }
                }
            }
            for (const my of movingYs) {
                for (const gy of guideYs) {
                    const dist = Math.abs(my - gy);
                    if (dist < bestDistY) {
                        bestDistY = dist;
                        snapY = { offset: gy - my, y: gy, extendX1, extendX2 };
                    }
                }
            }
        }
    }

    let dx = 0;
    let dy = 0;

    // Apply X snap only if not broken out of a previous X snap
    if (snapX && !activeSnapX) {
        dx = snapX.offset;
        drawGuide(snapX.x, snapX.extendY1, snapX.x, snapX.extendY2);
        if (mouseX !== undefined) {
            activeSnapX = { guideValue: snapX.x, mouseAtSnap: mouseX };
        }
    } else if (activeSnapX) {
        // Still in an active snap — hold position by drawing guide but no offset
        drawGuide(activeSnapX.guideValue, extendY1, activeSnapX.guideValue, extendY2);
    }

    if (snapY && !activeSnapY) {
        dy = snapY.offset;
        drawGuide(snapY.extendX1, snapY.y, snapY.extendX2, snapY.y);
        if (mouseY !== undefined) {
            activeSnapY = { guideValue: snapY.y, mouseAtSnap: mouseY };
        }
    } else if (activeSnapY) {
        drawGuide(extendX1, activeSnapY.guideValue, extendX2, activeSnapY.guideValue);
    }

    return { dx, dy };
}

/**
 * Clear all snap guides and reset snap state. Call on mouseUp.
 */
export function clearSnapGuides() {
    clearGuides();
    activeSnapX = null;
    activeSnapY = null;
}
