/* eslint-disable */
// Event dispatcher - extracted from eventListeners.js
// Central event routing for all tools

import { handleMouseDownRect, handleMouseMoveRect, handleMouseUpRect } from '../tools/rectangleTool.js';
import { handleMouseDownArrow, handleMouseMoveArrow, handleMouseUpArrow } from '../tools/arrowTool.js';
import { handleMouseDownCircle, handleMouseMoveCircle, handleMouseUpCircle } from '../tools/circleTool.js';
import { handleMouseUpImage, handleMouseDownImage, handleMouseMoveImage } from '../tools/imageTool.js';
import { handleMouseDownLine, handleMouseMoveLine, handleMouseUpLine } from '../tools/lineTool.js';
import { handleFreehandMouseDown, handleFreehandMouseMove, handleFreehandMouseUp } from '../tools/freehandTool.js';
import { handleTextMouseDown, handleTextMouseMove, handleTextMouseUp, enterEditMode } from '../tools/textTool.js';
import { handleMouseDownFrame, handleMouseMoveFrame, handleMouseUpFrame } from '../tools/frameTool.js';
import { handleMultiSelectionMouseDown, handleMultiSelectionMouseMove, handleMultiSelectionMouseUp, removeMultiSelectionRect, multiSelection, isMultiSelecting} from './Selection.js';
import { handleMouseDownIcon, handleMouseMoveIcon, handleMouseUpIcon } from '../tools/iconTool.js';
import { handleCodeMouseDown, handleCodeMouseMove, handleCodeMouseUp } from '../tools/codeTool.js';
import { handleShapeRecognitionDown, handleShapeRecognitionMove, handleShapeRecognitionUp } from '../tools/shapeRecognitionTool.js';
import { handlePaintBucketDown } from '../tools/paintBucketTool.js';
import { handleLassoDown, handleLassoMove, handleLassoUp } from '../tools/lassoTool.js';
import { handleWebEmbedDown, handleWebEmbedMove, handleWebEmbedUp } from '../tools/webEmbedTool.js';
import { createSelectionGestureOwner } from './SelectionGesture.js';

const selectionGestureOwner = createSelectionGestureOwner();

const shapePointerHandlers = {
    rectangle: { down: handleMouseDownRect, move: handleMouseMoveRect, up: handleMouseUpRect },
    arrow: { down: handleMouseDownArrow, move: handleMouseMoveArrow, up: handleMouseUpArrow },
    circle: { down: handleMouseDownCircle, move: handleMouseMoveCircle, up: handleMouseUpCircle },
    image: { down: handleMouseDownImage, move: handleMouseMoveImage, up: handleMouseUpImage },
    line: { down: handleMouseDownLine, move: handleMouseMoveLine, up: handleMouseUpLine },
    freehandStroke: { down: handleFreehandMouseDown, move: handleFreehandMouseMove, up: handleFreehandMouseUp },
    text: { down: handleTextMouseDown, move: handleTextMouseMove, up: handleTextMouseUp },
    frame: { down: handleMouseDownFrame, move: handleMouseMoveFrame, up: handleMouseUpFrame },
    icon: { down: handleMouseDownIcon, move: handleMouseMoveIcon, up: handleMouseUpIcon },
    code: { down: handleCodeMouseDown, move: handleCodeMouseMove, up: handleCodeMouseUp },
};

function routeShapePointer(phase, event, shape = currentShape) {
    const handler = shapePointerHandlers[shape?.shapeName]?.[phase];
    if (!handler) return false;
    handler(event);
    return true;
}

function captureSelectionGesture(event) {
    if (isMultiSelecting || multiSelection.isDragging || multiSelection.isResizing || multiSelection.isRotating) {
        selectionGestureOwner.captureMulti(event.pointerId);
    } else if (currentShape?.isSelected) {
        selectionGestureOwner.captureShape(currentShape, event.pointerId);
    }
}

// === Auto-scroll when dragging near viewport edges ===
const EDGE_THRESHOLD = 40; // px from edge to start scrolling
const SCROLL_SPEED = 8;    // base px per frame (scaled by zoom)
let _autoScrollRAF = null;

function _autoScroll(e) {
    if (!(e.buttons & 1)) { _stopAutoScroll(); return; } // no primary button
    if (typeof currentViewBox === 'undefined' || typeof currentZoom === 'undefined') return;
    if (typeof isPanning !== 'undefined' && isPanning) return; // don't fight pan tool
    if (typeof isPanningToolActive !== 'undefined' && isPanningToolActive) return;

    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let dx = 0, dy = 0;
    if (mx < EDGE_THRESHOLD) dx = -SCROLL_SPEED * (1 - mx / EDGE_THRESHOLD);
    else if (mx > rect.width - EDGE_THRESHOLD) dx = SCROLL_SPEED * (1 - (rect.width - mx) / EDGE_THRESHOLD);
    if (my < EDGE_THRESHOLD) dy = -SCROLL_SPEED * (1 - my / EDGE_THRESHOLD);
    else if (my > rect.height - EDGE_THRESHOLD) dy = SCROLL_SPEED * (1 - (rect.height - my) / EDGE_THRESHOLD);

    // Also scroll when cursor is outside the canvas entirely
    if (e.clientX < rect.left) dx = -SCROLL_SPEED;
    else if (e.clientX > rect.right) dx = SCROLL_SPEED;
    if (e.clientY < rect.top) dy = -SCROLL_SPEED;
    else if (e.clientY > rect.bottom) dy = SCROLL_SPEED;

    if (dx === 0 && dy === 0) { _stopAutoScroll(); return; }

    // Scale speed inversely with zoom so scrolling feels consistent
    const scale = 1 / currentZoom;
    currentViewBox.x += dx * scale;
    currentViewBox.y += dy * scale;
    svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
    if (typeof freehandCanvas !== 'undefined' && freehandCanvas !== svg) {
        freehandCanvas.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
    }
}

function _startAutoScroll() {
    if (_autoScrollRAF) return;
    const tick = () => {
        if (_lastDragEvent) _autoScroll(_lastDragEvent);
        _autoScrollRAF = requestAnimationFrame(tick);
    };
    _autoScrollRAF = requestAnimationFrame(tick);
}

function _stopAutoScroll() {
    if (_autoScrollRAF) {
        cancelAnimationFrame(_autoScrollRAF);
        _autoScrollRAF = null;
    }
    _lastDragEvent = null;
}

let _lastDragEvent = null;
let _documentDragActive = false;

function _onDocumentDragMove(e) {
    _lastDragEvent = e;
    // Clamp mouse coordinates to SVG bounds before forwarding to tool handlers,
    // so getSVGCoordsFromMouse doesn't produce extreme values when cursor is outside.
    const rect = svg.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    const clampedEvent = new PointerEvent(e.type, {
        pointerId: e.pointerId,
        clientX: clampedX,
        clientY: clampedY,
        buttons: e.buttons,
        button: e.button,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
    });
    handleMainMouseMove(clampedEvent);
}

function _onDocumentDragUp(e) {
    _stopAutoScroll();
    document.removeEventListener('pointermove', _onDocumentDragMove);
    document.removeEventListener('pointerup', _onDocumentDragUp);
    _documentDragActive = false;
    // Finalize the operation
    handleMainMouseUp(e);
}

const handleMainMouseDown = (e) => {
    if (!e.target) return;
    // Middle / right mouse buttons are reserved for panning and the
    // browser context menu; they should NOT trigger tool actions or the
    // multi-selection rectangle. Without this guard, middle-click-drag
    // simultaneously pans (handled in ZoomPan) and starts a selection
    // marquee.
    if (e.button === 1 || e.button === 2 || window.__spacePanActive) return;
    selectionGestureOwner.clearAll();
    // Safety: remove any stray selection rectangle from a previous interrupted drag
    removeMultiSelectionRect();

    // For non-selection tools: deselect everything when clicking on empty canvas
    // (Selection tool handles its own deselection in handleMultiSelectionMouseDown)
    if (!isSelectionToolActive) {
        // Clear multi-selection for any tool switch
        if (multiSelection.selectedShapes.size > 0) {
            multiSelection.clearSelection();
        }
        // Deselect current individual shape when starting a new tool action
        if (currentShape && typeof currentShape.removeSelection === 'function') {
            currentShape.removeSelection();
            currentShape = null;
        }
        if (typeof disableAllSideBars === 'function') {
            disableAllSideBars();
        }
    }

    if (window.isLassoToolActive) {
        handleLassoDown(e);
    } else if (window.isWebEmbedToolActive) {
        handleWebEmbedDown(e);
    } else if (window.isShapeRecognitionToolActive) {
        handleShapeRecognitionDown(e);
    } else if (window.isPaintBucketToolActive) {
        handlePaintBucketDown(e);
    } else if (isSquareToolActive) {
        handleMouseDownRect(e);
    } else if (isArrowToolActive) {
        handleMouseDownArrow(e);
    } else if (isCircleToolActive) {
        handleMouseDownCircle(e);
    } else if (isImageToolActive) {
        handleMouseDownImage(e);
    } 
    else if (isLineToolActive) {
        handleMouseDownLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseDown(e);
    }
    else if (isTextToolActive) {
        // Text tool handles both text and code shapes based on target and mode
        const targetCodeGroup = e.target.closest('g[data-type="code-group"]');
        const targetTextGroup = e.target.closest('g[data-type="text-group"]');
        if (targetCodeGroup && !targetTextGroup) {
            handleCodeMouseDown(e);
        } else if (isTextInCodeMode && !targetTextGroup && !targetCodeGroup) {
            handleCodeMouseDown(e);
        } else {
            handleTextMouseDown(e);
        }
    }
    else if (isFrameToolActive) {
        handleMouseDownFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseDownIcon(e);
    }
    else if (isSelectionToolActive) {
        // Try multi-selection first when selection tool is active
        if (handleMultiSelectionMouseDown(e)) {
            captureSelectionGesture(e);
            return; // Multi-selection handled the event
        }

        // Remember previous shape to detect deselection
        const prevShape = currentShape;
        let handled = false;

        // If multi-selection didn't handle it, proceed with shape-specific selection
        handled = routeShapePointer('down', e);

        // If the handler deselected (currentShape cleared) but didn't select something new,
        // fall through to try all handlers so clicking another shape type works
        if (handled && prevShape && !currentShape) {
            handled = false;
        }

        if (!handled) {
            const originalCurrentShape = currentShape;
            handleMouseDownRect(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownCircle(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownArrow(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownImage(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownLine(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleFreehandMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleTextMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownFrame(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleMouseDownIcon(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            handleCodeMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) { captureSelectionGesture(e); return; }
            if (currentShape === originalCurrentShape) {
                if (currentShape) {
                    currentShape.removeSelection();
                    currentShape = null;
                }
            }
        }
        captureSelectionGesture(e);
    }
};

const handleMainMouseMove = (e) => {
    if (window.__spacePanPointerActive) return;
    // Auto-scroll when dragging near/past viewport edges (checked first so early returns don't skip it)
    if (e.buttons & 1) {
        _lastDragEvent = e;
        _startAutoScroll();
    } else {
        _stopAutoScroll();
    }

    if (window.isLassoToolActive) {
        handleLassoMove(e);
    } else if (window.isWebEmbedToolActive) {
        handleWebEmbedMove(e);
    } else if (window.isShapeRecognitionToolActive) {
        handleShapeRecognitionMove(e);
    } else if (window.isPaintBucketToolActive) {
        return;
    } else if (isSquareToolActive) {
        handleMouseMoveRect(e);
    } else if (isArrowToolActive) {
        handleMouseMoveArrow(e);
    } else if (isCircleToolActive) {
        handleMouseMoveCircle(e);
    } else if (isImageToolActive) {
        handleMouseMoveImage(e);
    } 
    else if (isLineToolActive) {
        handleMouseMoveLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseMove(e);
    }
    else if (isTextToolActive) {
        handleTextMouseMove(e);
        handleCodeMouseMove(e);
    }
    else if (isFrameToolActive) {
        handleMouseMoveFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseMoveIcon(e);
    }
    else if (isSelectionToolActive) {
        const activeGesture = selectionGestureOwner.get(e.pointerId);
        if (activeGesture) {
            if (activeGesture.kind === 'multi') {
                handleMultiSelectionMouseMove(e);
            } else if (currentShape === activeGesture.shape && currentShape?.isSelected) {
                routeShapePointer('move', e, activeGesture.shape);
            }
            return;
        }

        // Handle multi-selection operations first - these take priority
        if (isMultiSelecting || multiSelection.isDragging || multiSelection.isResizing || multiSelection.isRotating) {
            if (handleMultiSelectionMouseMove(e)) {
                return; // Multi-selection handled the event
            }
        }
        
        // Shape-specific mouse move handling
        if (currentShape?.shapeName === 'rectangle') {
            handleMouseMoveRect(e);
        } else if (currentShape?.shapeName === 'arrow') {
            handleMouseMoveArrow(e);
        } else if (currentShape?.shapeName === 'circle') {
            handleMouseMoveCircle(e);
        } else if (currentShape?.shapeName === 'image') {
            handleMouseMoveImage(e);
        } 
        else if (currentShape?.shapeName === 'line') {
            handleMouseMoveLine(e);
        }
        else if (currentShape?.shapeName === 'freehandStroke') {
            handleFreehandMouseMove(e);
        }
        else if (currentShape?.shapeName === 'text') {
            handleTextMouseMove(e);
        }
        else if (currentShape?.shapeName === 'frame') {
            handleMouseMoveFrame(e);
        }
        else if (currentShape?.shapeName === 'icon') {
            handleMouseMoveIcon(e);
        }
        else if (currentShape?.shapeName === 'code') {
            handleCodeMouseMove(e);
        }

        else {
            // Try multi-selection mouse move for cursor updates
            if (handleMultiSelectionMouseMove(e)) {
                return;
            }
            
            handleMouseMoveRect(e);
            handleMouseMoveArrow(e);
            handleMouseMoveCircle(e);
            handleMouseMoveImage(e);
            handleMouseMoveLine(e);
            handleFreehandMouseMove(e);
            handleTextMouseMove(e);
            handleMouseMoveFrame(e);
            handleMouseMoveIcon(e);
            handleCodeMouseMove(e);
        }
    }
};

const handleMainMouseUp = (e) => {
    if (window.__spacePanPointerActive) return;
    _stopAutoScroll();
    if (window.isLassoToolActive) {
        handleLassoUp(e);
    } else if (window.isWebEmbedToolActive) {
        handleWebEmbedUp(e);
    } else if (window.isShapeRecognitionToolActive) {
        handleShapeRecognitionUp(e);
    } else if (window.isPaintBucketToolActive) {
        return;
    } else if (isSquareToolActive) {
        handleMouseUpRect(e);
    } else if (isArrowToolActive) {
        handleMouseUpArrow(e);
    } else if (isCircleToolActive) {
        handleMouseUpCircle(e);
    } else if (isImageToolActive) {
        handleMouseUpImage(e);
    } 
    else if (isLineToolActive) {    
        handleMouseUpLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseUp(e);
    }
    else if (isTextToolActive) {
        handleTextMouseUp(e);
        handleCodeMouseUp(e);
    }
    else if (isFrameToolActive) {
        handleMouseUpFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseUpIcon(e);
    }

    else if (isSelectionToolActive) {
        const activeGesture = selectionGestureOwner.get(e.pointerId);
        if (activeGesture) {
            try {
                if (activeGesture.kind === 'multi') {
                    handleMultiSelectionMouseUp(e);
                } else if (currentShape === activeGesture.shape) {
                    routeShapePointer('up', e, activeGesture.shape);
                }
            } finally {
                selectionGestureOwner.clear(e.pointerId);
            }
            return;
        }

        // Always try multi-selection cleanup first
        if (isMultiSelecting || multiSelection.isDragging || multiSelection.isResizing || multiSelection.isRotating) {
            handleMultiSelectionMouseUp(e);
            return;
        }

        // Shape-specific mouse up handling
        if (currentShape?.shapeName === 'rectangle') {
            handleMouseUpRect(e);
        } else if (currentShape?.shapeName === 'arrow') {
            handleMouseUpArrow(e);
        } else if (currentShape?.shapeName === 'circle') {
            handleMouseUpCircle(e);
        } else if (currentShape?.shapeName === 'image') {
            handleMouseUpImage(e);
        }
        else if (currentShape?.shapeName === 'line') {
            handleMouseUpLine(e);
        }
        else if (currentShape?.shapeName === 'freehandStroke') {
            handleFreehandMouseUp(e);
        }
        else if (currentShape?.shapeName === 'text') {
            handleTextMouseUp(e);
        }
        else if (currentShape?.shapeName === 'frame') {
            handleMouseUpFrame(e);
        }
        else if (currentShape?.shapeName === 'icon') {
            handleMouseUpIcon(e);
        }
        else if (currentShape?.shapeName === 'code') {
            handleCodeMouseUp(e);
        }

        else {
            handleMultiSelectionMouseUp(e);
            handleMouseUpRect(e);
            handleMouseUpArrow(e);
            handleMouseUpCircle(e);
            handleMouseUpImage(e);
            handleMouseUpLine(e);
            handleFreehandMouseUp(e);
            handleTextMouseUp(e);
            handleMouseUpFrame(e);
            handleMouseUpIcon(e);
            handleCodeMouseUp(e);
        }
    }
};

const handleMainMouseLeave = (e) => {
    if (window.__spacePanPointerActive) return;
    // If the user is still holding the primary button (dragging outside the canvas),
    // keep auto-scrolling and don't finalize the operation yet.
    if (e.buttons & 1) {
        _lastDragEvent = e;
        _startAutoScroll();

        // Listen on document to continue receiving move events outside the SVG
        if (!_documentDragActive) {
            _documentDragActive = true;
            document.addEventListener('pointermove', _onDocumentDragMove);
            document.addEventListener('pointerup', _onDocumentDragUp);
        }
        return;
    }

    // Stop all active drawing tools when pointer leaves the canvas

    // Fire mouseUp for whichever tool is active to finalize/cancel the operation
    handleMainMouseUp(e);

    // Always clean up any stray selection rectangle when pointer leaves canvas
    removeMultiSelectionRect();

    // Eraser: force cleanup any lingering trail
    if (typeof window.forceCleanupEraserTrail === 'function') {
        window.forceCleanupEraserTrail();
    }

    // Laser: stop drawing and fade out active laser (globals from laserTool.js)
    if (typeof isDrawing !== 'undefined' && isDrawing) {
        isDrawing = false;
        if (typeof lasers !== 'undefined' && lasers.length > 0 && typeof fadeLaserTrail === 'function') {
            const lastLaser = lasers[lasers.length - 1];
            fadeLaserTrail(lastLaser);
        }
    }
};

let _boundSvg = null;

function _onMouseEnter(e) {
    // Cursor re-entered the SVG — stop document-level tracking, SVG handles events again
    if (_documentDragActive) {
        document.removeEventListener('pointermove', _onDocumentDragMove);
        document.removeEventListener('pointerup', _onDocumentDragUp);
        _documentDragActive = false;
    }
}

const handleMainDblClick = (e) => {
    if (!e.target) return;
    // Double-click on a text group from any tool: enter text edit mode
    const targetTextGroup = e.target.closest('g[data-type="text-group"]');
    if (targetTextGroup) {
        e.stopPropagation();
        enterEditMode(targetTextGroup);
    }
};

function initEventDispatcher(svgEl) {
    if (_boundSvg) cleanupEventDispatcher();
    const target = svgEl || svg;
    target.addEventListener('pointerdown', handleMainMouseDown);
    target.addEventListener('pointermove', handleMainMouseMove);
    target.addEventListener('pointerup', handleMainMouseUp);
    target.addEventListener('pointerleave', handleMainMouseLeave);
    target.addEventListener('pointerenter', _onMouseEnter);
    target.addEventListener('dblclick', handleMainDblClick);
    _boundSvg = target;
}

function cleanupEventDispatcher() {
    _stopAutoScroll();
    selectionGestureOwner.clearAll();
    if (_documentDragActive) {
        document.removeEventListener('pointermove', _onDocumentDragMove);
        document.removeEventListener('pointerup', _onDocumentDragUp);
        _documentDragActive = false;
    }
    if (_boundSvg) {
        _boundSvg.removeEventListener('pointerdown', handleMainMouseDown);
        _boundSvg.removeEventListener('pointermove', handleMainMouseMove);
        _boundSvg.removeEventListener('pointerup', handleMainMouseUp);
        _boundSvg.removeEventListener('pointerleave', handleMainMouseLeave);
        _boundSvg.removeEventListener('pointerenter', _onMouseEnter);
        _boundSvg.removeEventListener('dblclick', handleMainDblClick);
        _boundSvg = null;
    }
}

// Auto-init if svg is already available (first load)
if (typeof svg !== 'undefined' && svg) {
    initEventDispatcher(svg);
}

export { handleMainMouseDown, handleMainMouseMove, handleMainMouseUp, handleMainMouseLeave, initEventDispatcher, cleanupEventDispatcher };
