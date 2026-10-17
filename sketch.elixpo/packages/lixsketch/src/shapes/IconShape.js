/* eslint-disable */
// IconShape class - extracted from icons.js
// Depends on globals: svg, shapes
import { updateAttachedArrows as updateArrowsForShape, cleanupAttachments } from '../tools/arrowTool.js';

// Module-level state shared with iconTool via window bridge
let isDragging = false;
let hoveredFrameIcon = null;

// Expose setters so iconTool.js can sync these values
window.__iconShapeState = {
    set isDragging(v) { isDragging = v; },
    get isDragging() { return isDragging; },
    set hoveredFrameIcon(v) { hoveredFrameIcon = v; },
    get hoveredFrameIcon() { return hoveredFrameIcon; },
};

function getSVGElement() {
    return document.getElementById('freehand-canvas');
}

// Delegate to iconTool's selectIcon via window bridge
function selectIcon(event) {
    if (window.__iconToolSelectIcon) {
        window.__iconToolSelectIcon(event);
    }
}

class IconShape {
    constructor(element) {
        this.element = element;
        this.shapeName = 'icon';
        this.shapeID = `icon-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.type = 'icon';

        this.parentFrame = null;
        this.isDraggedOutTemporarily = false;

        this.element.setAttribute('type', 'icon');
        this.element.shapeID = this.shapeID;

        this.group = this.element;
        this.group.setAttribute('id', this.shapeID);
    }

    get x() {
        return parseFloat(this.element.getAttribute('x')) || 0;
    }

    set x(value) {
        this.element.setAttribute('x', value);
        this.element.setAttribute('data-shape-x', value);
    }

    get y() {
        return parseFloat(this.element.getAttribute('y')) || 0;
    }

    set y(value) {
        this.element.setAttribute('y', value);
        this.element.setAttribute('data-shape-y', value);
    }

    get width() {
        return parseFloat(this.element.getAttribute('width')) || 100;
    }

    set width(value) {
        this.element.setAttribute('width', value);
        this.element.setAttribute('data-shape-width', value);
    }

    get height() {
        return parseFloat(this.element.getAttribute('height')) || 100;
    }

    set height(value) {
        this.element.setAttribute('height', value);
        this.element.setAttribute('data-shape-height', value);
    }

    _transformMetrics() {
        const vbWidth = parseFloat(this.element.getAttribute('data-viewbox-width')) || 24;
        const vbHeight = parseFloat(this.element.getAttribute('data-viewbox-height')) || 24;
        const scale = Math.min(this.width / vbWidth, this.height / vbHeight);
        return {
            scale,
            localCenterX: this.width / 2 / scale,
            localCenterY: this.height / 2 / scale,
        };
    }

    _applyTransform() {
        const { scale, localCenterX, localCenterY } = this._transformMetrics();
        this.element.setAttribute(
            'transform',
            `translate(${this.x}, ${this.y}) scale(${scale}) rotate(${this.rotation}, ${localCenterX}, ${localCenterY})`
        );
    }

    get rotation() {
        const dataRotation = this.element.getAttribute('data-shape-rotation');
        if (dataRotation) {
            return parseFloat(dataRotation);
        }

        const transform = this.element.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,\s]+)/);
            if (rotateMatch) {
                return parseFloat(rotateMatch[1]);
            }
        }
        return 0;
    }

    set rotation(value) {
        this.element.setAttribute('data-shape-rotation', value);
        this._applyTransform();
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;

        this._applyTransform();

        this.element.setAttribute('x', this.x);
        this.element.setAttribute('y', this.y);

        this.element.setAttribute('data-shape-x', this.x);
        this.element.setAttribute('data-shape-y', this.y);

        updateArrowsForShape(this);

        if (isDragging && !this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }
    }
    updateFrameContainment() {
        if (this.isBeingMovedByFrame) return;

        let targetFrame = null;

        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(shape => {
                if (shape.shapeName === 'frame' && shape.isShapeInFrame(this)) {
                    targetFrame = shape;
                }
            });
        }

        if (this.parentFrame && isDragging) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }

        if (hoveredFrameIcon && hoveredFrameIcon !== targetFrame) {
            hoveredFrameIcon.removeHighlight();
        }

        if (targetFrame && targetFrame !== hoveredFrameIcon) {
            targetFrame.highlightFrame();
        }

        hoveredFrameIcon = targetFrame;
    }

    contains(x, y) {
        const iconX = this.x;
        const iconY = this.y;
        const iconWidth = this.width;
        const iconHeight = this.height;

        return x >= iconX && x <= iconX + iconWidth && y >= iconY && y <= iconY + iconHeight;
    }

    updateAttachedArrows() {
        updateArrowsForShape(this);
    }

    draw() {
        this._applyTransform();

        this.element.setAttribute('data-shape-x', this.x);
        this.element.setAttribute('data-shape-y', this.y);
        this.element.setAttribute('data-shape-width', this.width);
        this.element.setAttribute('data-shape-height', this.height);
        this.element.setAttribute('data-shape-rotation', this.rotation);

        updateArrowsForShape(this);
    }

    removeSelection(params) {
        if (window.__iconToolRemoveSelection) {
            window.__iconToolRemoveSelection();
        }
        this.isSelected = false;
    }

    // Called by handleMultiSelectionMouseDown — same as selectShape
    addAnchors() {
        selectIcon({ target: this.element, stopPropagation: () => { } });
    }

    selectShape() {
        selectIcon({ target: this.element, stopPropagation: () => { } });
    }

    remove() {
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            const idx = shapes.indexOf(this);
            if (idx !== -1) shapes.splice(idx, 1);
        }

        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(this.element);
        }

        if (this.parentFrame) {
            this.parentFrame.removeShapeFromFrame(this);
        }

        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }
    }
    restore(pos) {
        const svg = getSVGElement();

        if (!this.group.parentNode && svg) {
            svg.appendChild(this.group);
        }

        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            if (shapes.indexOf(this) === -1) {
                shapes.push(this);
            }
        }

        this.x = pos.x;
        this.y = pos.y;
        this.width = pos.width;
        this.height = pos.height;
        this.rotation = pos.rotation;

        if (pos.parentFrame) {
            this.parentFrame = pos.parentFrame;
            pos.parentFrame.addShapeToFrame(this);
        }

        this._applyTransform();

        this.element.setAttribute('data-shape-x', pos.x);
        this.element.setAttribute('data-shape-y', pos.y);
        this.element.setAttribute('data-shape-width', pos.width);
        this.element.setAttribute('data-shape-height', pos.height);
        this.element.setAttribute('data-shape-rotation', pos.rotation);

        updateArrowsForShape(this);
    }
}

export { IconShape };
