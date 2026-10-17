/* eslint-disable */
/**
 * LayerOrder - Controls z-ordering of shapes on the SVG canvas.
 * Shapes are ordered by their position in window.shapes[] and their DOM order in the SVG.
 */

/**
 * Move a shape one layer forward (closer to top).
 */
export function bringForward(shape) {
    const shapes = window.shapes;
    if (!shapes) return;
    const idx = shapes.indexOf(shape);
    if (idx < 0 || idx >= shapes.length - 1) return;

    // Swap in array
    [shapes[idx], shapes[idx + 1]] = [shapes[idx + 1], shapes[idx]];

    // Move in DOM — insert after the next sibling
    const el = shape.group || shape.element;
    const nextEl = shapes[idx].group || shapes[idx].element; // the shape that was swapped down
    if (el && nextEl && el.parentNode) {
        // el should come after nextEl in DOM
        if (nextEl.nextSibling) {
            el.parentNode.insertBefore(el, nextEl.nextSibling);
        } else {
            el.parentNode.appendChild(el);
        }
    }
}

/**
 * Move a shape one layer backward (closer to bottom).
 */
export function sendBackward(shape) {
    const shapes = window.shapes;
    if (!shapes) return;
    const idx = shapes.indexOf(shape);
    if (idx <= 0) return;

    // Swap in array
    [shapes[idx], shapes[idx - 1]] = [shapes[idx - 1], shapes[idx]];

    // Move in DOM — insert before the previous sibling
    const el = shape.group || shape.element;
    const prevEl = shapes[idx].group || shapes[idx].element;
    if (el && prevEl && el.parentNode) {
        el.parentNode.insertBefore(el, prevEl);
    }
}

/**
 * Bring shape to the very front.
 */
export function bringToFront(shape) {
    const shapes = window.shapes;
    if (!shapes) return;
    const idx = shapes.indexOf(shape);
    if (idx < 0) return;

    shapes.splice(idx, 1);
    shapes.push(shape);

    const el = shape.group || shape.element;
    if (el && el.parentNode) {
        el.parentNode.appendChild(el);
    }
}

/**
 * Send shape to the very back.
 */
export function sendToBack(shape) {
    const shapes = window.shapes;
    if (!shapes) return;
    const idx = shapes.indexOf(shape);
    if (idx < 0) return;

    shapes.splice(idx, 1);
    shapes.unshift(shape);

    const el = shape.group || shape.element;
    if (el && el.parentNode) {
        el.parentNode.insertBefore(el, el.parentNode.firstChild);
    }
}

// Expose globally for React sidebar access
export function initLayerOrder() {
    window.__layerOrder = { bringForward, sendBackward, bringToFront, sendToBack };
}
