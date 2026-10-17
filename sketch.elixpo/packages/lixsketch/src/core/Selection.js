/* eslint-disable */
// Multi-selection system - copied from selection.js

import { cleanupAttachments } from '../tools/arrowTool.js';
import { beginUndoBatch, captureFrameChildStates, endUndoBatch, pushCreateAction, pushTransformAction, pushFrameAttachmentAction, pushDeleteAction } from './UndoRedo.js';
import { calculateSnap, clearSnapGuides } from './SnapGuides.js';
import { registerRotationAnchor } from './ScreenSpaceControls.js';

let isMultiSelecting = false;
let multiSelectionStart = { x: 0, y: 0 };
let multiSelectionRect = null;
let isDraggingMultiSelection = false;

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

function createMultiSelectionRect(startX, startY) {
    multiSelectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    multiSelectionRect.setAttribute('x', startX);
    multiSelectionRect.setAttribute('y', startY);
    multiSelectionRect.setAttribute('width', 0);
    multiSelectionRect.setAttribute('height', 0);
    multiSelectionRect.setAttribute('fill', 'rgba(91, 87, 209, 0.1)');
    multiSelectionRect.setAttribute('stroke', '#5B57D1');
    multiSelectionRect.setAttribute('stroke-width', 1);
    multiSelectionRect.setAttribute('stroke-dasharray', '4 2');
    multiSelectionRect.setAttribute('style', 'pointer-events: none;');
    svg.appendChild(multiSelectionRect);
}

function updateMultiSelectionRect(currentX, currentY) {
    if (!multiSelectionRect) return;

    const x = Math.min(multiSelectionStart.x, currentX);
    const y = Math.min(multiSelectionStart.y, currentY);
    const width = Math.abs(currentX - multiSelectionStart.x);
    const height = Math.abs(currentY - multiSelectionStart.y);

    multiSelectionRect.setAttribute('x', x);
    multiSelectionRect.setAttribute('y', y);
    multiSelectionRect.setAttribute('width', width);
    multiSelectionRect.setAttribute('height', height);
}

function removeMultiSelectionRect() {
    if (multiSelectionRect && multiSelectionRect.parentNode) {
        multiSelectionRect.parentNode.removeChild(multiSelectionRect);
    }
    multiSelectionRect = null;
    // Clean up any drag-select highlights
    clearDragSelectHighlights();
}

function cancelActiveMultiSelectionDrag() {
    if (!isMultiSelecting) return false;

    removeMultiSelectionRect();
    isMultiSelecting = false;
    isDraggingMultiSelection = false;
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    if (typeof svg !== 'undefined') {
        svg.style.userSelect = '';
        svg.style.webkitUserSelect = '';
    }
    return true;
}

// Track elements highlighted during drag-select
let dragSelectHighlights = [];

function highlightShapesInSelectionRect(currentX, currentY) {
    // Clear previous highlights
    clearDragSelectHighlights();

    if (!multiSelectionStart) return;

    const selBounds = {
        x: Math.min(multiSelectionStart.x, currentX),
        y: Math.min(multiSelectionStart.y, currentY),
        width: Math.abs(currentX - multiSelectionStart.x),
        height: Math.abs(currentY - multiSelectionStart.y)
    };

    // Minimum size check to avoid highlighting on click
    if (selBounds.width < 5 && selBounds.height < 5) return;

    if (typeof shapes !== 'undefined') {
        shapes.forEach(shape => {
            if (isShapeInSelectionRect(shape, selBounds)) {
                // Add a semi-transparent overlay to the shape's group
                if (shape.group && typeof shape.group.getBBox === 'function') {
                    let bbox;
                    try { bbox = shape.group.getBBox(); } catch { return; }
                    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    overlay.setAttribute('x', bbox.x - 2);
                    overlay.setAttribute('y', bbox.y - 2);
                    overlay.setAttribute('width', bbox.width + 4);
                    overlay.setAttribute('height', bbox.height + 4);
                    overlay.setAttribute('fill', 'rgba(91, 87, 209, 0.12)');
                    overlay.setAttribute('stroke', '#5B57D1');
                    overlay.setAttribute('stroke-width', '1');
                    overlay.setAttribute('stroke-opacity', '0.4');
                    overlay.setAttribute('rx', '3');
                    overlay.setAttribute('style', 'pointer-events: none;');
                    overlay.setAttribute('class', 'drag-select-highlight');
                    shape.group.appendChild(overlay);
                    dragSelectHighlights.push(overlay);
                }
            }
        });
    }
}

function clearDragSelectHighlights() {
    dragSelectHighlights.forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    dragSelectHighlights = [];
}

function isShapeInSelectionRect(shape, selectionBounds) {
    let shapeBounds;

    switch (shape.shapeName) {
        case 'rectangle':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        case 'circle':
            shapeBounds = {
                x: shape.x - shape.rx,
                y: shape.y - shape.ry,
                width: shape.rx * 2,
                height: shape.ry * 2
            };
            break;
        case 'line':
            shapeBounds = {
                x: Math.min(shape.startPoint.x, shape.endPoint.x),
                y: Math.min(shape.startPoint.y, shape.endPoint.y),
                width: Math.abs(shape.endPoint.x - shape.startPoint.x),
                height: Math.abs(shape.endPoint.y - shape.startPoint.y)
            };
            break;
        case 'arrow':
            const minX = Math.min(shape.startPoint.x, shape.endPoint.x);
            const minY = Math.min(shape.startPoint.y, shape.endPoint.y);
            const maxX = Math.max(shape.startPoint.x, shape.endPoint.x);
            const maxY = Math.max(shape.startPoint.y, shape.endPoint.y);
            shapeBounds = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            };
            break;
        case 'freehandStroke':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        case 'text':
        case 'code':
            const textOrCodeEl = shape.group ? shape.group.querySelector('text') : null;
            if (textOrCodeEl && shape.group.style.display !== 'none') {
                try {
                    const bbox = textOrCodeEl.getBBox();
                    const transform = shape.group.transform.baseVal.consolidate();
                    const matrix = transform ? transform.matrix : { e: 0, f: 0 };
                    shapeBounds = {
                        x: bbox.x + matrix.e,
                        y: bbox.y + matrix.f,
                        width: bbox.width,
                        height: bbox.height
                    };
                } catch {
                    shapeBounds = { x: 0, y: 0, width: 0, height: 0 };
                }
            } else {
                shapeBounds = { x: 0, y: 0, width: 0, height: 0 };
            }
            break;
        case 'image':
            if (shape.element) {
                shapeBounds = {
                    x: parseFloat(shape.element.getAttribute('x')),
                    y: parseFloat(shape.element.getAttribute('y')),
                    width: parseFloat(shape.element.getAttribute('width')),
                    height: parseFloat(shape.element.getAttribute('height'))
                };
            } else {
                shapeBounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
            }
            break;
        case 'frame':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        case 'icon':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        default:
            shapeBounds = {
                x: shape.x || 0,
                y: shape.y || 0,
                width: shape.width || 0,
                height: shape.height || 0
            };
    }

    return !(selectionBounds.x > shapeBounds.x + shapeBounds.width ||
             selectionBounds.x + selectionBounds.width < shapeBounds.x ||
             selectionBounds.y > shapeBounds.y + shapeBounds.height ||
             selectionBounds.y + selectionBounds.height < shapeBounds.y);
}

class MultiSelection {
    constructor() {
        this.selectedShapes = new Set();
        this.group = null;
        this.anchors = [];
        this.outline = null;
        this.rotationAnchor = null;
        this.rotationLine = null;
        this.selectionPadding = 12;
        this.bounds = null;
        this.initialPositions = new Map();

        this.isDragging = false;
        this.isResizing = false;
        this.isRotating = false;
        this.resizingAnchorIndex = null;
        this.dragStart = { x: 0, y: 0 };
        this.rotationCenter = { x: 0, y: 0 };
        this.startRotationMouseAngle = 0;
        this._undoSnapshots = new Map(); // Stores initial state for undo tracking
        this.initialRotation = 0;
    }

    // Capture current state of all selected shapes for undo
    _snapshotForUndo() {
        this._undoSnapshots.clear();
        this.selectedShapes.forEach(shape => {
            this._undoSnapshots.set(shape, this._captureShapeState(shape));
        });
    }

    _captureShapeState(shape) {
        if (shape.shapeName === 'frame') {
            return {
                x: shape.x, y: shape.y,
                width: shape.width || 0, height: shape.height || 0,
                rotation: shape.rotation || 0,
                parentFrame: shape.parentFrame || null,
                containedShapes: captureFrameChildStates(shape),
            };
        }
        switch (shape.shapeName) {
            case 'line':
            case 'arrow':
                return {
                    startPoint: { ...shape.startPoint },
                    endPoint: { ...shape.endPoint },
                    x: shape.x, y: shape.y,
                    width: shape.width || 0, height: shape.height || 0,
                    rotation: shape.rotation || 0,
                    parentFrame: shape.parentFrame || null
                };
            case 'circle':
                return { x: shape.x, y: shape.y, rx: shape.rx, ry: shape.ry, rotation: shape.rotation || 0, width: shape.width, height: shape.height, parentFrame: shape.parentFrame || null };
            case 'freehandStroke':
                return { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rotation: shape.rotation || 0, points: JSON.parse(JSON.stringify(shape.points)), parentFrame: shape.parentFrame || null };
            default:
                return { x: shape.x || 0, y: shape.y || 0, width: shape.width || 0, height: shape.height || 0, rotation: shape.rotation || 0, parentFrame: shape.parentFrame || null };
        }
    }

    // Push undo actions for all shapes that changed
    _pushUndoForAll(existingBatch = null) {
        const batch = existingBatch || beginUndoBatch();
        this.selectedShapes.forEach(shape => {
            const oldState = this._undoSnapshots.get(shape);
            if (!oldState) return;
            const newState = this._captureShapeState(shape);
            // Check if anything actually changed
            const changed = Object.keys(oldState).some(key => {
                if (key === 'points' || key === 'startPoint' || key === 'endPoint') return JSON.stringify(oldState[key]) !== JSON.stringify(newState[key]);
                if (key === 'containedShapes') {
                    const compact = entries => (entries || []).map(entry => ({
                        shapeID: entry.shape?.shapeID,
                        state: entry.state,
                    }));
                    return JSON.stringify(compact(oldState[key])) !== JSON.stringify(compact(newState[key]));
                }
                return oldState[key] !== newState[key];
            });
            if (changed) {
                pushTransformAction(shape, oldState, newState);
            }
        });
        this._undoSnapshots.clear();
        if (!existingBatch) endUndoBatch(batch, 'multi-transform');
    }

    addShape(shape) {
        this.selectedShapes.add(shape);
        shape.isSelected = true;
        this.updateControls();
    }

    removeShape(shape) {
        this.selectedShapes.delete(shape);
        shape.isSelected = false;
        if (this.selectedShapes.size === 0) {
            this.clearSelection();
        } else {
            this.updateControls();
        }
    }

    clearSelection() {
        this.selectedShapes.forEach(shape => {
            shape.isSelected = false;
            if (typeof shape.removeSelection === 'function') {
                shape.removeSelection();
            }
        });
        this.selectedShapes.clear();
        this.removeControls();
        if (typeof currentShape !== 'undefined') {
            currentShape = null;
        }
        if (typeof disableAllSideBars === 'function') {
            disableAllSideBars();
        }
    }

    selectShapesInRect(selectionBounds) {
        this.clearSelection();

        if (typeof shapes !== 'undefined') {
            shapes.forEach(shape => {
                if (isShapeInSelectionRect(shape, selectionBounds)) {
                    this.addShape(shape);
                }
            });
        }

        if (this.selectedShapes.size === 1) {
            if (typeof currentShape !== 'undefined') {
                currentShape = Array.from(this.selectedShapes)[0];
            }
        } else {
            if (typeof currentShape !== 'undefined') {
                currentShape = null;
            }
        }
    }

    getBounds() {
        if (this.selectedShapes.size === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.selectedShapes.forEach(shape => {
            const shapeBounds = this.getShapeBounds(shape);
            minX = Math.min(minX, shapeBounds.x);
            minY = Math.min(minY, shapeBounds.y);
            maxX = Math.max(maxX, shapeBounds.x + shapeBounds.width);
            maxY = Math.max(maxY, shapeBounds.y + shapeBounds.height);
        });

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    getShapeBounds(shape) {
        switch (shape.shapeName) {
            case 'rectangle':
            case 'frame':
                return {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width,
                    height: shape.height
                };
            case 'circle':
                return {
                    x: shape.x - shape.rx,
                    y: shape.y - shape.ry,
                    width: shape.rx * 2,
                    height: shape.ry * 2
                };
            case 'line':
            case 'arrow':
                return {
                    x: Math.min(shape.startPoint.x, shape.endPoint.x),
                    y: Math.min(shape.startPoint.y, shape.endPoint.y),
                    width: Math.abs(shape.endPoint.x - shape.startPoint.x),
                    height: Math.abs(shape.endPoint.y - shape.startPoint.y)
                };
            case 'freehandStroke':
                return {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width,
                    height: shape.height
                };
            case 'text':
                const textElement = shape.group ? shape.group.querySelector('text') : null;
                if (textElement) {
                    const bbox = textElement.getBBox();
                    const transform = shape.group.transform.baseVal.consolidate();
                    const matrix = transform ? transform.matrix : { e: 0, f: 0 };
                    return {
                        x: bbox.x + matrix.e,
                        y: bbox.y + matrix.f,
                        width: bbox.width,
                        height: bbox.height
                    };
                }
                return { x: 0, y: 0, width: 0, height: 0 };
            case 'image':
                if (shape.element) {
                    return {
                        x: parseFloat(shape.element.getAttribute('x')),
                        y: parseFloat(shape.element.getAttribute('y')),
                        width: parseFloat(shape.element.getAttribute('width')),
                        height: parseFloat(shape.element.getAttribute('height'))
                    };
                }
                return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
            case 'icon':
            return {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            default:
                return {
                    x: shape.x || 0,
                    y: shape.y || 0,
                    width: shape.width || 0,
                    height: shape.height || 0
                };
        }
    }

    updateControls() {
        this.removeControls();
        if (this.selectedShapes.size === 0) return;

        this.bounds = this.getBounds();
        if (!this.bounds) return;

        this.createControls();
    }

    createControls() {
        this.createRotatedControls(0);
    }

    createOutline(x, y, width, height) {
        const outlinePoints = [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
            [x, y]
        ];

        this.outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        this.outline.setAttribute('class', 'multi-selection-outline');
        this.outline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));
        this.outline.setAttribute('fill', 'none');
        this.outline.setAttribute('stroke', '#5B57D1');
        this.outline.setAttribute('stroke-width', 1.5);
        this.outline.setAttribute('stroke-dasharray', '4 2');
        this.outline.setAttribute('vector-effect', 'non-scaling-stroke');
        this.outline.setAttribute('style', 'pointer-events: none;');
        this.group.appendChild(this.outline);
    }

    createResizeAnchors(x, y, width, height) {
        const zoom = window.currentZoom || 1;
        const anchorSize = 10 / zoom;
        const anchorPositions = [
            { x: x, y: y, index: 0 },
            { x: x + width, y: y, index: 1 },
            { x: x, y: y + height, index: 2 },
            { x: x + width, y: y + height, index: 3 },
            { x: x + width / 2, y: y, index: 4 },
            { x: x + width / 2, y: y + height, index: 5 },
            { x: x, y: y + height / 2, index: 6 },
            { x: x + width, y: y + height / 2, index: 7 }
        ];

        this.anchors = [];
        anchorPositions.forEach((pos) => {
            const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            anchor.setAttribute('x', pos.x - anchorSize / 2);
            anchor.setAttribute('y', pos.y - anchorSize / 2);
            anchor.setAttribute('width', anchorSize);
            anchor.setAttribute('height', anchorSize);
            anchor.setAttribute('class', 'multi-selection-anchor');
            anchor.setAttribute('data-index', pos.index);
            anchor.setAttribute('fill', '#121212');
            anchor.setAttribute('stroke', '#5B57D1');
            anchor.setAttribute('stroke-width', 2);
            anchor.setAttribute('vector-effect', 'non-scaling-stroke');
            anchor.setAttribute('style', 'pointer-events: all; cursor: pointer;');

            const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize', 'n-resize', 's-resize', 'w-resize', 'e-resize'];
            anchor.style.cursor = cursors[pos.index];

            anchor.addEventListener('pointerdown', (e) => this.startResize(e, pos.index));

            this.group.appendChild(anchor);
            this.anchors.push(anchor);
        });
    }

    createRotationAnchor(x, y, width, height) {
        const zoom = window.currentZoom || 1;
        const rotationAnchorPos = { x: x + width / 2, y: y - 30 / zoom };

        this.rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
        this.rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
        this.rotationAnchor.setAttribute('r', 8 / zoom);
        this.rotationAnchor.setAttribute('class', 'multi-selection-rotation-anchor');
        this.rotationAnchor.setAttribute('fill', '#121212');
        this.rotationAnchor.setAttribute('stroke', '#5B57D1');
        this.rotationAnchor.setAttribute('stroke-width', 2);
        this.rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
        this.rotationAnchor.setAttribute('style', 'pointer-events: all; cursor: grab;');

        this.rotationAnchor.addEventListener('pointerdown', (e) => this.startRotation(e));

        this.rotationLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.rotationLine.setAttribute('x1', rotationAnchorPos.x);
        this.rotationLine.setAttribute('y1', rotationAnchorPos.y);
        this.rotationLine.setAttribute('x2', x + width / 2);
        this.rotationLine.setAttribute('y2', y);
        this.rotationLine.setAttribute('stroke', '#5B57D1');
        this.rotationLine.setAttribute('stroke-width', 1);
        this.rotationLine.setAttribute('stroke-dasharray', '4 2');
        this.rotationLine.setAttribute('vector-effect', 'non-scaling-stroke');
        this.rotationLine.setAttribute('style', 'pointer-events: none;');

        this.group.appendChild(this.rotationLine);
        this.group.appendChild(this.rotationAnchor);
        registerRotationAnchor(this.rotationAnchor, {
            radius: 8,
            edgeY: y,
            line: this.rotationLine,
            lineEnd: '1',
        });
    }

    removeControls() {
        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }
        this.group = null;
        this.anchors = [];
        this.outline = null;
        this.rotationAnchor = null;
        this.rotationLine = null;
    }

    isPointInBounds(x, y) {
        if (!this.bounds) return false;

        const padding = this.selectionPadding;
        return x >= this.bounds.x - padding && x <= this.bounds.x + this.bounds.width + padding &&
               y >= this.bounds.y - padding && y <= this.bounds.y + this.bounds.height + padding;
    }

    move(dx, dy) {
    this.selectedShapes.forEach(shape => {
        // Skip shapes whose parent frame is also selected — the frame's move()
        // will already move them, so moving them independently causes double-move offset
        if (shape.parentFrame && this.selectedShapes.has(shape.parentFrame)) {
            return;
        }

        if (typeof shape.move === 'function') {
            shape.move(dx, dy);
        }

        if (typeof shape.updateAttachedArrows === 'function') {
            shape.updateAttachedArrows();
        }
    });

    this.updateControls();
}

    startRotation(e) {
        e.stopPropagation();
        e.preventDefault();

        this.isRotating = true;

        const currentBounds = this.getBounds();
        this.rotationCenter = {
            x: currentBounds.x + currentBounds.width / 2,
            y: currentBounds.y + currentBounds.height / 2
        };

        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        this.startRotationMouseAngle = Math.atan2(mouseY - this.rotationCenter.y, mouseX - this.rotationCenter.x) * 180 / Math.PI;

        this.storeInitialPositions();

        // Snapshot for undo tracking
        this._snapshotForUndo();

        const onMouseMove = (event) => {
            if (this.isRotating) {
                this.handleRotation(event);
            }
        };

        const onMouseUp = () => {
            this.isRotating = false;
            this.initialPositions.clear();

            // Push undo for all rotated shapes
            this._pushUndoForAll();

            if (typeof svg !== 'undefined') {
                svg.removeEventListener('pointermove', onMouseMove);
                svg.removeEventListener('pointerup', onMouseUp);
                svg.style.cursor = 'default';
            }
        };

        if (typeof svg !== 'undefined') {
            svg.addEventListener('pointermove', onMouseMove);
            svg.addEventListener('pointerup', onMouseUp);
            svg.style.cursor = 'grabbing';
        }
    }

    storeInitialPositions() {
        this.initialPositions.clear();

        const initialBounds = this.getBounds();
        this.initialPositions.set('initialBounds', {
            x: initialBounds.x,
            y: initialBounds.y,
            width: initialBounds.width,
            height: initialBounds.height
        });

        this.selectedShapes.forEach(shape => {
            let shapeData;

            let shapeCenterX, shapeCenterY;

            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                    shapeCenterX = shape.x + shape.width / 2;
                    shapeCenterY = shape.y + shape.height / 2;
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;
                case 'icon':
                shapeCenterX = shape.x + shape.width / 2;
                shapeCenterY = shape.y + shape.height / 2;
                shapeData = {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width || 0,
                    height: shape.height || 0,
                    rotation: shape.rotation || 0,
                    centerX: shapeCenterX,
                    centerY: shapeCenterY,
                    relativeX: shapeCenterX - this.rotationCenter.x,
                    relativeY: shapeCenterY - this.rotationCenter.y
                };
                break;

                case 'circle':
                    shapeCenterX = shape.x;
                    shapeCenterY = shape.y;
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx || 0,
                        ry: shape.ry || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;

                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint },
                        relativeStartX: shape.startPoint.x - this.rotationCenter.x,
                        relativeStartY: shape.startPoint.y - this.rotationCenter.y,
                        relativeEndX: shape.endPoint.x - this.rotationCenter.x,
                        relativeEndY: shape.endPoint.y - this.rotationCenter.y
                    };
                    break;

                    case 'freehandStroke':
                        if (!shape.points || !Array.isArray(shape.points) || shape.points.length === 0) {
                            console.warn('FreehandStroke has invalid points array');
                            return;
                        }

                        const validPoints = shape.points.filter(point =>
                            Array.isArray(point) &&
                            point.length >= 2 &&
                            typeof point[0] === 'number' &&
                            typeof point[1] === 'number' &&
                            !isNaN(point[0]) &&
                            !isNaN(point[1])
                        );

                        if (validPoints.length === 0) {
                            console.warn('FreehandStroke has no valid points');
                            return;
                        }

                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }

                        const boundingBox = this.getShapeBounds(shape);

                        shapeData = {
                            x: boundingBox.x || 0,
                            y: boundingBox.y || 0,
                            width: boundingBox.width || 0,
                            height: boundingBox.height || 0,
                            points: validPoints.map(point => [point[0], point[1], point[2] || 0.5]),
                            relativePoints: validPoints.map(point => [
                                point[0] - this.rotationCenter.x,
                                point[1] - this.rotationCenter.y,
                                point[2] || 0.5
                            ]),
                            boundingBox: { ...boundingBox }
                        };
                        break;

                        case 'text':
                        const textBounds = this.getShapeBounds(shape);
                        shapeCenterX = textBounds.x + textBounds.width / 2;
                        shapeCenterY = textBounds.y + textBounds.height / 2;

                        const currentTransform = shape.group.transform.baseVal.consolidate();
                        const currentX = currentTransform ? currentTransform.matrix.e : 0;
                        const currentY = currentTransform ? currentTransform.matrix.f : 0;

                        shapeData = {
                            x: currentX,
                            y: currentY,
                            width: shape.width || textBounds.width,
                            height: shape.height || textBounds.height,
                            rotation: shape.rotation || 0,
                            centerX: shapeCenterX,
                            centerY: shapeCenterY,
                            relativeX: shapeCenterX - this.rotationCenter.x,
                            relativeY: shapeCenterY - this.rotationCenter.y,
                            visualBounds: textBounds,
                            transformX: currentX,
                            transformY: currentY
                        };
                        break;

                case 'image':
                    shapeCenterX = shape.x + (shape.width || 0) / 2;
                    shapeCenterY = shape.y + (shape.height || 0) / 2;
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;

                default:
                    shapeCenterX = (shape.x || 0) + (shape.width || 0) / 2;
                    shapeCenterY = (shape.y || 0) + (shape.height || 0) / 2;
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
            }

            if (shapeData) {
                this.initialPositions.set(shape, shapeData);
            }
        });
    }

    handleRotation(e) {
        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        const currentMouseAngle = Math.atan2(mouseY - this.rotationCenter.y, mouseX - this.rotationCenter.x) * 180 / Math.PI;
        const angleDiff = currentMouseAngle - this.startRotationMouseAngle;
        const angleRad = angleDiff * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const sinAngle = Math.sin(angleRad);

        this.selectedShapes.forEach(shape => {
            const initialData = this.initialPositions.get(shape);
            if (!initialData) return;

            if (typeof shape.removeSelection === 'function') {
                shape.removeSelection();
            }

            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                case 'image':
                case 'icon':
                    const newCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    shape.x = newCenterX - initialData.width / 2;
                    shape.y = newCenterY - initialData.height / 2;
                    shape.rotation = (initialData.rotation || 0) + angleDiff;

                    if (typeof shape.rotate === 'function') {
                        shape.rotate(shape.rotation);
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                    case 'text':
                    const newTextCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newTextCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    const textElement = shape.group.querySelector('text');
                    if (textElement) {
                        const initialBbox = initialData.visualBounds;

                        const newTransformX = newTextCenterX - initialBbox.width / 2;
                        const newTransformY = newTextCenterY - initialBbox.height / 2;

                        const newRotation = (initialData.rotation || 0) + angleDiff;

                        const textCenterX = initialBbox.width / 2;
                        const textCenterY = initialBbox.height / 2;

                        shape.group.setAttribute('transform',
                            `translate(${newTransformX}, ${newTransformY}) rotate(${newRotation}, ${textCenterX}, ${textCenterY})`
                        );

                        shape.x = newTransformX;
                        shape.y = newTransformY;
                        shape.rotation = newRotation;
                    }

                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                case 'circle':
                    const newCircleCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newCircleCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    shape.x = newCircleCenterX;
                    shape.y = newCircleCenterY;
                    shape.rotation = (initialData.rotation || 0) + angleDiff;

                    if (typeof shape.rotate === 'function') {
                        shape.rotate(shape.rotation);
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                case 'line':
                case 'arrow':
                    const newStartX = this.rotationCenter.x + (initialData.relativeStartX * cosAngle - initialData.relativeStartY * sinAngle);
                    const newStartY = this.rotationCenter.y + (initialData.relativeStartX * sinAngle + initialData.relativeStartY * cosAngle);
                    const newEndX = this.rotationCenter.x + (initialData.relativeEndX * cosAngle - initialData.relativeEndY * sinAngle);
                    const newEndY = this.rotationCenter.y + (initialData.relativeEndX * sinAngle + initialData.relativeEndY * cosAngle);

                    shape.startPoint.x = newStartX;
                    shape.startPoint.y = newStartY;
                    shape.endPoint.x = newEndX;
                    shape.endPoint.y = newEndY;

                    if (shape.shapeName === 'arrow' && shape.arrowCurved && typeof shape.initializeCurveControlPoints === 'function') {
                        shape.initializeCurveControlPoints();
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                    case 'freehandStroke':
                        if (!initialData.relativePoints || !Array.isArray(initialData.relativePoints)) {
                            console.warn('FreehandStroke missing valid relativePoints');
                            break;
                        }

                        const rotatedPoints = initialData.relativePoints.map(relPoint => {
                            if (!Array.isArray(relPoint) || relPoint.length < 2 ||
                                typeof relPoint[0] !== 'number' || typeof relPoint[1] !== 'number' ||
                                isNaN(relPoint[0]) || isNaN(relPoint[1])) {
                                console.warn('Invalid relative point:', relPoint);
                                return [0, 0, 0.5];
                            }

                            const newX = this.rotationCenter.x + (relPoint[0] * cosAngle - relPoint[1] * sinAngle);
                            const newY = this.rotationCenter.y + (relPoint[0] * sinAngle + relPoint[1] * cosAngle);

                            if (isNaN(newX) || isNaN(newY)) {
                                console.warn('Generated NaN coordinates:', { newX, newY, relPoint, rotationCenter: this.rotationCenter });
                                return [0, 0, 0.5];
                            }

                            return [newX, newY, relPoint[2] || 0.5];
                        });

                        shape.points = rotatedPoints.filter(point =>
                            Array.isArray(point) &&
                            point.length >= 2 &&
                            typeof point[0] === 'number' &&
                            typeof point[1] === 'number' &&
                            !isNaN(point[0]) &&
                            !isNaN(point[1])
                        );

                        if (shape.points.length === 0) {
                            console.warn('No valid points after rotation');
                            shape.points = [[0, 0, 0.5]];
                        }

                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }
                        if (typeof shape.draw === 'function') {
                            shape.draw();
                        }
                        break;
            }

            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
        });

        this.updateControlsAfterRotation();
    }

    updateControlsAfterRotation() {
        this.removeControls();
        if (this.selectedShapes.size === 0) return;

        this.bounds = this.getBounds();

        if (!this.bounds) {
            return;
        }

        this.createControls();
    }


createRotatedControls(angleDiff = 0) {
    this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.group.setAttribute('id', 'multi-selection-controls');

    if (angleDiff !== 0) {
        const centerX = this.bounds.x + this.bounds.width / 2;
        const centerY = this.bounds.y + this.bounds.height / 2;
        this.group.setAttribute('transform', `rotate(${angleDiff} ${centerX} ${centerY})`);
    }

    if (typeof svg !== 'undefined') {
        svg.appendChild(this.group);
    }

    // Draw faint individual outlines for each selected shape
    if (this.selectedShapes.size > 1) {
        this.selectedShapes.forEach(shape => {
            const b = this.getShapeBounds(shape);
            if (!b || b.width === 0 && b.height === 0) return;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', b.x - 3);
            rect.setAttribute('y', b.y - 3);
            rect.setAttribute('width', b.width + 6);
            rect.setAttribute('height', b.height + 6);
            rect.setAttribute('fill', 'none');
            rect.setAttribute('class', 'selection-sub-outline');
            rect.setAttribute('stroke', '#5B57D1');
            rect.setAttribute('stroke-width', 1);
            rect.setAttribute('stroke-opacity', 0.35);
            rect.setAttribute('stroke-dasharray', '4 2');
            rect.setAttribute('vector-effect', 'non-scaling-stroke');
            rect.setAttribute('rx', 3);
            rect.setAttribute('style', 'pointer-events: none;');
            this.group.appendChild(rect);
        });
    }

    const expandedX = this.bounds.x - this.selectionPadding;
    const expandedY = this.bounds.y - this.selectionPadding;
    const expandedWidth = this.bounds.width + 2 * this.selectionPadding;
    const expandedHeight = this.bounds.height + 2 * this.selectionPadding;

    this.createOutline(expandedX, expandedY, expandedWidth, expandedHeight);
    this.createResizeAnchors(expandedX, expandedY, expandedWidth, expandedHeight);
    this.createRotationAnchor(expandedX, expandedY, expandedWidth, expandedHeight);
}

    startResize(e, anchorIndex) {
        e.stopPropagation();
        e.preventDefault();

        this.isResizing = true;
        this.resizingAnchorIndex = anchorIndex;

        // Snapshot for undo tracking
        this._snapshotForUndo();

        this.initialPositions.clear();
        const initialBounds = this.getBounds();

        this.selectedShapes.forEach(shape => {
            let shapeData;
            shape.removeSelection();
            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon': 
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                        rotation: shape.rotation
                    };
                    break;
                case 'circle':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx,
                        ry: shape.ry,
                        rotation: shape.rotation
                    };
                    break;
                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint }
                    };
                    break;
                default:
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0
                    };
            }
            this.initialPositions.set(shape, shapeData);
        });

        this.initialPositions.set('bounds', initialBounds);

        const onMouseMove = (event) => {
            if (this.isResizing) {
                this.handleResize(event);
            }
        };

        const onMouseUp = () => {
            this.isResizing = false;
            this.resizingAnchorIndex = null;
            this.initialPositions.clear();

            // Push undo for all resized shapes
            this._pushUndoForAll();

            if (typeof svg !== 'undefined') {
                svg.removeEventListener('pointermove', onMouseMove);
                svg.removeEventListener('pointerup', onMouseUp);
                svg.style.cursor = 'default';
            }
        };

        if (typeof svg !== 'undefined') {
            svg.addEventListener('pointermove', onMouseMove);
            svg.addEventListener('pointerup', onMouseUp);
        }
    }

    handleResize(e) {
        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        const initialBounds = this.initialPositions.get('bounds');
        if (!initialBounds) return;

        let scaleX = 1, scaleY = 1;
        let newBounds = { ...initialBounds };

        switch (this.resizingAnchorIndex) {
            case 0:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.x = mouseX;
                newBounds.y = mouseY;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 1:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.y = mouseY;
                newBounds.width = mouseX - initialBounds.x;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 2:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.x = mouseX;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 3:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.width = mouseX - initialBounds.x;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 4:
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.y = mouseY;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 5:
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 6:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                newBounds.x = mouseX;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                break;
            case 7:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                newBounds.width = mouseX - initialBounds.x;
                break;
        }

        scaleX = Math.max(0.1, Math.abs(scaleX));
        scaleY = Math.max(0.1, Math.abs(scaleY));

        this.selectedShapes.forEach(shape => {
            const initialData = this.initialPositions.get(shape);
            if (!initialData) return;

            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon':
                    const relX = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relY = (initialData.y - initialBounds.y) / initialBounds.height;
                    const relW = initialData.width / initialBounds.width;
                    const relH = initialData.height / initialBounds.height;

                    shape.x = newBounds.x + relX * newBounds.width;
                    shape.y = newBounds.y + relY * newBounds.height;
                    shape.width = relW * newBounds.width;
                    shape.height = relH * newBounds.height;
                    shape._skipAnchors = true;
                    shape.draw();
                    shape._skipAnchors = false;
                    break;

                case 'circle':
                    const relXCircle = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relYCircle = (initialData.y - initialBounds.y) / initialBounds.height;

                    shape.x = newBounds.x + relXCircle * newBounds.width;
                    shape.y = newBounds.y + relYCircle * newBounds.height;
                    shape.rx = initialData.rx * scaleX;
                    shape.ry = initialData.ry * scaleY;
                    shape._skipAnchors = true;
                    shape.draw();
                    shape._skipAnchors = false;
                    break;

                case 'line':
                case 'arrow':
                    const relStartX = (initialData.startPoint.x - initialBounds.x) / initialBounds.width;
                    const relStartY = (initialData.startPoint.y - initialBounds.y) / initialBounds.height;
                    const relEndX = (initialData.endPoint.x - initialBounds.x) / initialBounds.width;
                    const relEndY = (initialData.endPoint.y - initialBounds.y) / initialBounds.height;

                    shape.startPoint.x = newBounds.x + relStartX * newBounds.width;
                    shape.startPoint.y = newBounds.y + relStartY * newBounds.height;
                    shape.endPoint.x = newBounds.x + relEndX * newBounds.width;
                    shape.endPoint.y = newBounds.y + relEndY * newBounds.height;

                    if (shape.shapeName === 'arrow' && shape.arrowCurved) {
                        if (typeof shape.initializeCurveControlPoints === 'function') {
                            shape.initializeCurveControlPoints();
                        }
                    }
                    shape.draw();
                    break;

                default:
                    const relXDefault = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relYDefault = (initialData.y - initialBounds.y) / initialBounds.height;
                    const relWDefault = initialData.width / initialBounds.width;
                    const relHDefault = initialData.height / initialBounds.height;

                    shape.x = newBounds.x + relXDefault * newBounds.width;
                    shape.y = newBounds.y + relYDefault * newBounds.height;
                    if (shape.width !== undefined) shape.width = relWDefault * newBounds.width;
                    if (shape.height !== undefined) shape.height = relHDefault * newBounds.height;

                    if (typeof shape.draw === 'function') {
                        shape._skipAnchors = true;
                        shape.draw();
                        shape._skipAnchors = false;
                    }
            }

            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
        });

        this.updateControls();
    }

    startDrag(e) {
        this.isDragging = true;
        isDraggingMultiSelection = true;
        const { x, y } = getSVGCoordsFromMouse(e);
        this.dragStart = { x, y };

        // Snapshot for undo tracking
        this._snapshotForUndo();

        this.initialPositions.clear();
        this.selectedShapes.forEach(shape => {
            let shapeData;
            shape.removeSelection();
            if (shape.shapeName === 'line') shape.scheduleDragRender?.();
            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                        rotation: shape.rotation
                    };
                    break;
                case 'circle':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx,
                        ry: shape.ry,
                        rotation: shape.rotation
                    };
                    break;
                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint }
                    };
                    break;
                default:
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0
                    };
            }
            this.initialPositions.set(shape, shapeData);
        });

        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'move';
        }
    }

    handleDrag(e) {
        if (!this.isDragging) return;
        isDraggingMultiSelection = true;
        const { x, y } = getSVGCoordsFromMouse(e);
        let dx = x - this.dragStart.x;
        let dy = y - this.dragStart.y;

        // Shift-constrain: lock to horizontal or vertical axis
        if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) {
                dy = 0;
            } else {
                dx = 0;
            }
        }

        this.move(dx, dy);

        // Snap guides for multi-selection
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const bounds = this.getBounds();
            if (bounds) {
                // Create a virtual shape representing the multi-selection bounding box
                const virtualShape = {
                    shapeName: 'rectangle',
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                };
                const snap = calculateSnap(virtualShape, e.shiftKey, e.clientX, e.clientY);
                if (snap.dx || snap.dy) {
                    this.move(snap.dx, snap.dy);
                }
            }
        } else {
            clearSnapGuides();
        }

        this.dragStart = { x: x, y: y };
    }

    endDrag() {
        if (!this.isDragging) return;
        isDraggingMultiSelection = false;
        this.isDragging = false;

        // Clear snap guides on drag end
        clearSnapGuides();

        // Finalize freehand stroke moves (bake transform offset into points)
        this.selectedShapes.forEach(shape => {
            if (typeof shape.finalizeMove === 'function') {
                shape.finalizeMove();
            }
            // Restore isSelected flag (startDrag's removeSelection clears it)
            shape.isSelected = true;
        });

        const undoBatch = beginUndoBatch();

        // Re-parent any selected shape that now sits inside a different frame
        // (Issue #22, bug #9). The per-tool drag handlers (rectangleTool, etc.)
        // do this for single-shape drags, but a multi-selection drag bypassed
        // them and left the shape geometrically inside the frame yet logically
        // outside its child list.
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            this.selectedShapes.forEach(shape => {
                if (!shape || shape.shapeName === 'frame') return;
                // Find the deepest frame whose bounds contain the shape after the drag.
                let target = null;
                for (let i = shapes.length - 1; i >= 0; i--) {
                    const f = shapes[i];
                    if (f.shapeName !== 'frame') continue;
                    if (this.selectedShapes.has(f)) continue; // moving with us — skip
                    if (typeof f.isShapeInFrame === 'function' && f.isShapeInFrame(shape)) {
                        target = f;
                        break;
                    }
                }
                const current = shape.parentFrame || null;
                if (target === current) return;
                if (current && typeof current.removeShapeFromFrame === 'function') {
                    current.removeShapeFromFrame(shape);
                }
                if (target && typeof target.addShapeToFrame === 'function') {
                    target.addShapeToFrame(shape);
                }
            });
        }

        this.initialPositions.clear();

        // Push undo for all moved shapes
        this._pushUndoForAll(undoBatch);
        endUndoBatch(undoBatch, 'multi-move');

        // Refresh bounds and controls after finalizeMove may have changed positions
        this.updateControls();

        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'default';
        }
    }
}

const multiSelection = new MultiSelection();

function selectShapesInRect(selectionBounds) {
    multiSelection.selectShapesInRect(selectionBounds);
}

function clearAllSelections() {
    multiSelection.clearSelection();
}

function getMultiSelectionBounds() {
    return multiSelection.getBounds();
}

function createMultiSelectionControls() {
    multiSelection.updateControls();
}

function removeMultiSelectionControls() {
    multiSelection.removeControls();
}

function isPointInMultiSelection(x, y) {
    return multiSelection.isPointInBounds(x, y);
}

function moveSelectedShapes(dx, dy) {
    multiSelection.move(dx, dy);
}

function handleMultiSelectionMouseDown(e) {
    if (!e.target) return false;
    const { x, y } = getSVGCoordsFromMouse(e);

    // Only handle multi-selection operations if we have multiple shapes selected
    if (multiSelection.selectedShapes.size > 1) {
        const anchor = e.target.closest('.multi-selection-anchor');
        if (anchor) {
            const anchorIndex = parseInt(anchor.getAttribute('data-index'));
            multiSelection.startResize(e, anchorIndex);
            return true;
        }

        if (e.target.closest('.multi-selection-rotation-anchor')) {
            multiSelection.startRotation(e);
            return true;
        }

        // Check if clicking on any shape that's part of the selection
        let clickedOnSelectedShape = null;
        for (const shape of multiSelection.selectedShapes) {
            if (shape.contains && shape.contains(x, y)) {
                clickedOnSelectedShape = shape;
                break;
            }
        }
        if (clickedOnSelectedShape) {
            // Ctrl+Click: toggle shape out of multi-selection
            if (e.ctrlKey || e.metaKey) {
                multiSelection.removeShape(clickedOnSelectedShape);
                return true;
            }
            multiSelection.startDrag(e);
            return true;
        }

        // Click is within the multi-selection bounding box but not directly on a shape —
        // still start dragging the group (prevents accidental deselection)
        if (multiSelection.isPointInBounds(x, y)) {
            multiSelection.startDrag(e);
            return true;
        }

        // Click is outside the selection bounds — fall through to deselect / start new selection
    }

    // Check if clicking on individual shape anchors - let them handle it
    if (e.target.closest('.anchor') || e.target.closest('.rotate-anchor') || e.target.closest('.rotation-anchor')) {
        return false; // Let individual shape handlers manage their own anchors
    }

    // Check if clicking on any shape — prioritise non-frame shapes so that
    // shapes inside frames (text, icons, etc.) can still be selected/interacted with.
    let clickedOnShape = false;
    let clickedShape = null;
    if (typeof shapes !== 'undefined') {
        // Prefer the actual SVG event target. This remains exact regardless
        // of pan/zoom and also covers shapes whose visual bounds come from a
        // foreignObject or imported SVG rather than simple geometry.
        for (let i = shapes.length - 1; i >= 0; i--) {
            const shape = shapes[i];
            const element = shape?.group || shape?.element;
            if (element && (element === e.target || element.contains?.(e.target))) {
                clickedOnShape = true;
                clickedShape = shape;
                break;
            }
        }

        let fallbackFrame = null;
        for (let i = shapes.length - 1; !clickedOnShape && i >= 0; i--) {
            const shape = shapes[i];
            if (shape.contains && shape.contains(x, y)) {
                if (shape.shapeName === 'frame') {
                    // Pick the smallest (most specific/innermost) frame
                    if (!fallbackFrame) {
                        fallbackFrame = shape;
                    } else {
                        const area = (shape.width || 0) * (shape.height || 0);
                        const existingArea = (fallbackFrame.width || 0) * (fallbackFrame.height || 0);
                        if (area < existingArea) {
                            fallbackFrame = shape;
                        }
                    }
                } else {
                    clickedOnShape = true;
                    clickedShape = shape;
                    break;
                }
            }
        }
        // If no non-frame shape was found, use the smallest frame
        if (!clickedOnShape && fallbackFrame) {
            clickedOnShape = true;
            clickedShape = fallbackFrame;
        }
    }

    // If clicking on a shape
    if (clickedOnShape && clickedShape) {
        // Ctrl+click: toggle shape in/out of multi-selection
        if (e.ctrlKey || e.metaKey) {
            if (multiSelection.selectedShapes.has(clickedShape)) {
                multiSelection.removeShape(clickedShape);
            } else {
                // If there's a current individually-selected shape, add it to multi-selection first
                if (currentShape && currentShape !== clickedShape && !multiSelection.selectedShapes.has(currentShape)) {
                    multiSelection.addShape(currentShape);
                    if (typeof currentShape.removeSelection === 'function') currentShape.removeSelection();
                }
                multiSelection.addShape(clickedShape);
            }
            currentShape = null;
            return true;
        }

        // If the clicked shape is part of the multi-selection, start dragging instead of clearing
        if (multiSelection.selectedShapes.size > 1 && multiSelection.selectedShapes.has(clickedShape)) {
            multiSelection.startDrag(e);
            return true;
        }

        // If it's the same shape that's already selected, let individual handlers manage it
        if (currentShape === clickedShape) {
            // Clear any other multi-selected shapes so only this one remains selected
            if (multiSelection.selectedShapes.size > 0) {
                multiSelection.clearSelection();
            }
            return false; // Let individual shape handlers manage their own interactions
        }

        // Normal click (no Ctrl): deselect everything and select only the clicked shape
        if (currentShape && typeof currentShape.removeSelection === 'function') {
            currentShape.removeSelection();
        }

        // Clear multi-selection
        multiSelection.clearSelection();

        // ── Group expansion ────────────────────────────────────────────
        // If the clicked shape is part of a group, select ALL of its
        // group-mates as a multi-selection instead of single-selecting.
        // Subsequent drag/resize/rotate then operates on the whole group
        // via the existing multi-selection plumbing.
        if (clickedShape.groupId && typeof shapes !== 'undefined') {
            const mates = shapes.filter(s => s.groupId === clickedShape.groupId);
            if (mates.length > 1) {
                for (const m of mates) multiSelection.addShape(m);
                currentShape = null;
                multiSelection.startDrag(e);
                return true;
            }
        }

        // Set new current shape
        currentShape = clickedShape;

        // Trigger the shape's own selection handling
        if (typeof clickedShape.addAnchors === 'function') {
            clickedShape.addAnchors();
            clickedShape.isSelected = true;
        } else if (typeof clickedShape.createSelection === 'function') {
            clickedShape.createSelection();
            clickedShape.isSelected = true;
        } else if (typeof clickedShape.selectShape === 'function') {
            clickedShape.selectShape();
            clickedShape.isSelected = true;
        } else if (typeof clickedShape.selectFrame === 'function') {
            clickedShape.selectFrame();
        }

        // Update sidebar if function exists
        if (typeof clickedShape.updateSidebar === 'function') {
            clickedShape.updateSidebar();
        }

        return false; // Let individual handlers also process for drag setup
    }

    // If not clicking on a shape, deselect everything and start multi-selection
    if (!clickedOnShape) {
        // Deselect current individual shape
        if (typeof currentShape !== 'undefined' && currentShape && typeof currentShape.removeSelection === 'function') {
            currentShape.removeSelection();
            currentShape = null;
        }
        // Also deselect any active text editor (textTool's selectedElement)
        if (window.__deselectTextElement) {
            window.__deselectTextElement();
        }
        if (typeof disableAllSideBars === 'function') {
            disableAllSideBars();
        }
        
        multiSelectionStart = { x, y };
        isMultiSelecting = true;
        // Prevent native text selection during drag-select
        if (typeof svg !== 'undefined') {
            svg.style.userSelect = 'none';
            svg.style.webkitUserSelect = 'none';
        }
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        createMultiSelectionRect(x, y);
        clearAllSelections();
        return true;
    }

    return false;
}

function handleMultiSelectionMouseMove(e) {
    const { x, y } = getSVGCoordsFromMouse(e);

    if (multiSelection.isDragging) {
        multiSelection.handleDrag(e);
        return true;
    }

    if (multiSelection.isResizing) {
        multiSelection.handleResize(e);
        return true;
    }

    if (multiSelection.isRotating) {
        multiSelection.handleRotation(e);
        return true;
    }

    if (isMultiSelecting) {
        updateMultiSelectionRect(x, y);
        // Live highlight shapes that fall within the selection rectangle
        highlightShapesInSelectionRect(x, y);
        return true;
    }

    if (multiSelection.selectedShapes.size > 1 && multiSelection.isPointInBounds(x, y)) {
        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'move';
        }
        return true;
    }

    // Show move cursor when hovering over any shape in selection mode
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        const overShape = shapes.some(shape => {
            if (typeof shape.contains === 'function') {
                return shape.contains(x, y);
            }
            return false;
        });
        if (overShape && typeof svg !== 'undefined') {
            svg.style.cursor = 'move';
            return false;
        }
    }

    if (typeof svg !== 'undefined' && svg.style.cursor === 'move') {
        svg.style.cursor = 'default';
    }

    return false;
}

function handleMultiSelectionMouseUp(e) {
    if (multiSelection.isDragging) {
        multiSelection.endDrag();
        return true;
    }

    if (multiSelection.isResizing) {
        multiSelection.isResizing = false;
        multiSelection.resizingAnchorIndex = null;
        multiSelection.initialPositions.clear();
        multiSelection._pushUndoForAll();
        multiSelection.updateControls();
        return true;
    }

    if (multiSelection.isRotating) {
        multiSelection.isRotating = false;
        multiSelection.initialPositions.clear();
        multiSelection._pushUndoForAll();
        return true;
    }

    if (isMultiSelecting) {
        const { x, y } = getSVGCoordsFromMouse(e);

        const selectionBounds = {
            x: Math.min(multiSelectionStart.x, x),
            y: Math.min(multiSelectionStart.y, y),
            width: Math.abs(x - multiSelectionStart.x),
            height: Math.abs(y - multiSelectionStart.y)
        };

        if (selectionBounds.width > 5 && selectionBounds.height > 5) {
            let shapesInBounds = [];
            if (typeof shapes !== 'undefined') {
                shapes.forEach(shape => {
                    if (isShapeInSelectionRect(shape, selectionBounds)) {
                        shapesInBounds.push(shape);
                    }
                });
            }

            if (shapesInBounds.length === 1) {
                const selectedShape = shapesInBounds[0];
                multiSelection.clearSelection();

                if (typeof currentShape !== 'undefined') {
                    currentShape = selectedShape;
                }

                if (typeof selectedShape.addAnchors === 'function') {
                    selectedShape.addAnchors();
                    selectedShape.isSelected = true;
                } else if (typeof selectedShape.createSelection === 'function') {
                    selectedShape.createSelection();
                    selectedShape.isSelected = true;
                } else if (typeof selectedShape.selectShape === 'function') {
                    selectedShape.selectShape();
                    selectedShape.isSelected = true;
                }

                if (typeof selectedShape.updateSidebar === 'function') {
                    selectedShape.updateSidebar();
                }
            } else if (shapesInBounds.length > 1) {
                multiSelection.selectShapesInRect(selectionBounds);
            }
        }

        removeMultiSelectionRect();
        isMultiSelecting = false;
        isDraggingMultiSelection = false;
        // Restore text selection after drag-select
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        if (typeof svg !== 'undefined') {
            svg.style.userSelect = '';
            svg.style.webkitUserSelect = '';
        }
        return true;
    }

    // Safety cleanup - always reset flags on mouse up
    isMultiSelecting = false;
    isDraggingMultiSelection = false;
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    if (typeof svg !== 'undefined') {
        svg.style.userSelect = '';
        svg.style.webkitUserSelect = '';
    }
    return false;
}


// Safety net: clean up selection rect if mouse is released outside the SVG
window.addEventListener('pointerup', () => {
    if (isMultiSelecting) {
        removeMultiSelectionRect();
        isMultiSelecting = false;
        isDraggingMultiSelection = false;
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
    }
});

// Select-all owns the selection state. Cancel an in-progress marquee during
// capture so the app or embedded-engine shortcut can safely select every
// shape without a later pointer-up restoring the partial drag selection.
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key || '').toLowerCase() === 'a') {
        cancelActiveMultiSelectionDrag();
    }
}, true);

// Delete key support for multi-selection
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && multiSelection.selectedShapes.size > 0) {
        // Don't delete if user is typing in an input
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        e.preventDefault();
        deleteSelectedShapes();
    }
});

function deleteSelectedShapes() {
    if (multiSelection.selectedShapes.size === 0) return;

    if (
        Array.isArray(window.shapes) &&
        window.shapes.length > 0 &&
        multiSelection.selectedShapes.size >= window.shapes.length &&
        typeof window.__requestCanvasResetConfirmation === 'function'
    ) {
        window.__requestCanvasResetConfirmation();
        return;
    }

    const shapesToDelete = Array.from(multiSelection.selectedShapes);
    multiSelection.clearSelection();
    const undoBatch = beginUndoBatch();

    // Issue #24 bug #3: when deleting a (regular, non-diagram) frame, its
    // children are released back to the canvas — capture them here so we
    // can re-select them and drop the user into the pointer tool. Diagram
    // frames destroy their children together, so we skip those.
    const releasedChildren = [];

    shapesToDelete.forEach(shape => {
        const isFrame = shape.shapeName === 'frame';
        const isDiagramFrame = isFrame && !!shape._diagramType;
        const parentFrame = shape.parentFrame || null;
        const frameIndex = parentFrame?.containedShapes?.indexOf(shape) ?? -1;

        // Issue #24 bug #7: for a regular (non-diagram) frame, we don't
        // want destroy() — it empties containedShapes and tears down the
        // clipGroup, leaving nothing for undo to rehydrate. Instead:
        //   1. snapshot the children references (for the undo action),
        //   2. release each child visually back to the svg root,
        //   3. detach the frame's <g>, clipGroup, clipPath from DOM.
        // The frame JS object stays alive in the undo action's `shape`
        // reference; on undo, the UndoRedo branch re-appends clipGroup +
        // clipPath and re-attaches each child via addShapeToFrame.
        let childSnapshot = null;
        if (isFrame && !isDiagramFrame) {
            childSnapshot = [...(shape.containedShapes || [])];
            for (const child of childSnapshot) {
                if (!child || child === shape) continue;
                const el = child.group || child.element;
                if (el) {
                    if (shape.clipGroup && el.parentNode === shape.clipGroup) {
                        shape.clipGroup.removeChild(el);
                    }
                    if (window.svg && el.parentNode !== window.svg) window.svg.appendChild(el);
                }
                child.parentFrame = null;
                delete child.isBeingMovedByFrame;
                releasedChildren.push(child);
            }

            // Clear containedShapes — undo will repopulate via
            // addShapeToFrame, which short-circuits on an existing entry.
            shape.containedShapes = [];

            // Detach the frame's own DOM bits — but keep the JS object
            // and its clipGroup/clipPath references intact for undo.
            if (shape.group && shape.group.parentNode) shape.group.parentNode.removeChild(shape.group);
            if (shape.clipGroup && shape.clipGroup.parentNode) shape.clipGroup.parentNode.removeChild(shape.clipGroup);
            if (shape.clipPath && shape.clipPath.parentNode) shape.clipPath.parentNode.removeChild(shape.clipPath);
        } else {
            // Non-frame OR diagram frame: standard delete path.
            if (shape.group && shape.group.parentNode) {
                shape.group.parentNode.removeChild(shape.group);
            } else if (shape.element && shape.element.parentNode) {
                shape.element.parentNode.removeChild(shape.element);
            }
            if (shape.parentFrame && typeof shape.parentFrame.removeShapeFromFrame === 'function') {
                shape.parentFrame.removeShapeFromFrame(shape);
            }
            cleanupAttachments(shape);
            if (isDiagramFrame && typeof shape.destroy === 'function') {
                shape.destroy();
            }
        }

        // Remove from shapes array
        const idx = shapes.indexOf(shape);
        if (idx !== -1) shapes.splice(idx, 1);

        // Issue #24 bug #7: record the delete on the undo stack. Without
        // this the user can't undo a multi-selection delete at all —
        // the action just disappears. For frames we attach the child
        // snapshot so undo can re-attach them.
        try {
            if (childSnapshot) {
                pushDeleteAction(shape, { childSnapshot, shapeIndex: idx, parentFrame, frameIndex });
            } else {
                pushDeleteAction(shape, { shapeIndex: idx, parentFrame, frameIndex });
            }
        } catch (err) {
            console.warn('[deleteSelectedShapes] pushDeleteAction failed:', err);
        }
    });
    endUndoBatch(undoBatch, 'multi-delete');

    // Bug #3 follow-through: auto-select the released children and switch
    // to the pointer tool so the user can immediately keep manipulating
    // them. Skip if nothing was released (no frames deleted).
    if (releasedChildren.length > 0) {
        for (const child of releasedChildren) {
            if (shapes.indexOf(child) === -1) continue;
            multiSelection.addShape(child);
        }
        if (window.__sketchStoreApi && typeof window.__sketchStoreApi.setActiveTool === 'function') {
            window.__sketchStoreApi.setActiveTool('select');
        }
    }
}

/**
 * Create a frame around all currently multi-selected shapes.
 */
function frameSelectedShapes() {
    if (multiSelection.selectedShapes.size < 2) return;

    const shapesToFrame = Array.from(multiSelection.selectedShapes);
    // Frames cannot be nested through the Frame it action, and objects that
    // already belong to a frame must first be detached explicitly.
    if (shapesToFrame.some(shape => shape?.shapeName === 'frame' || shape?.parentFrame)) return;

    const bounds = multiSelection.getBounds();
    if (!bounds) return;

    const padding = 20;
    const fx = bounds.x - padding;
    const fy = bounds.y - padding;
    const fw = bounds.width + padding * 2;
    const fh = bounds.height + padding * 2;

    // Import Frame class dynamically (it's on window from SketchEngine init)
    const FrameClass = window.Frame;
    if (!FrameClass) {
        console.warn('[Selection] Frame class not available');
        return;
    }

    const frame = new FrameClass(fx, fy, fw, fh);
    shapes.push(frame);

    // Add each selected shape into the frame
    multiSelection.clearSelection();

    for (const shape of shapesToFrame) {
        frame.addShapeToFrame(shape);
    }

    // Reorder DOM: frame group should be behind the contained shapes
    const frameEl = frame.group;
    if (frameEl && frameEl.parentNode) {
        // Move frame before its first contained shape in the shapes array
        const frameIdx = shapes.indexOf(frame);
        if (frameIdx > 0) {
            shapes.splice(frameIdx, 1);
            // Find earliest contained shape index
            let earliest = shapes.length;
            for (const s of shapesToFrame) {
                const idx = shapes.indexOf(s);
                if (idx >= 0 && idx < earliest) earliest = idx;
            }
            shapes.splice(earliest, 0, frame);
        }
    }

    // Record after reordering so redo restores the same hit-test/layer index.
    pushCreateAction(frame, {
        frameCreation: true,
        containedShapes: shapesToFrame
    });

    // Select the new frame
    if (typeof frame.selectFrame === 'function') {
        frame.selectFrame();
    }
    currentShape = frame;
}

// Expose for plain scripts (sketchGeneric.js is not a module)
window.clearAllSelections = clearAllSelections;
window.multiSelection = multiSelection;
window.cancelActiveMultiSelectionDrag = cancelActiveMultiSelectionDrag;
window.deleteSelectedShapes = deleteSelectedShapes;
window.frameSelectedShapes = frameSelectedShapes;

export {
    handleMultiSelectionMouseDown,
    handleMultiSelectionMouseMove,
    handleMultiSelectionMouseUp,
    clearAllSelections,
    selectShapesInRect,
    createMultiSelectionControls,
    removeMultiSelectionControls,
    removeMultiSelectionRect,
    cancelActiveMultiSelectionDrag,
    isPointInMultiSelection,
    moveSelectedShapes,
    multiSelection,
    isDraggingMultiSelection,
    isMultiSelecting
};
