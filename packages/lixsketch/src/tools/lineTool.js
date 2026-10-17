/* eslint-disable */
// Line tool event handlers - extracted from lineTool.js
import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { updateAttachedArrows as updateArrowsForShape, cleanupAttachments } from './arrowTool.js';
import { calculateSnap, clearSnapGuides } from '../core/SnapGuides.js';

function getThemeStroke() { if (typeof document === "undefined") return "#fff"; return document.body && document.body.classList.contains("theme-dark") ? "#fff" : "#000000"; }

let isDrawingLine = false;
let currentLine = null;
let lineStartX = 0;      
let lineStartY = 0;      
let currentLineGroup = null;    
let lineColor = null;
let lineStrokeWidth = 3;
let lineStrokeStyle = "solid";
let lineEdgeType = 1;
let lineSktetchRate = 3;

let isDraggingLine = false;
let dragOldPosLine = null;
let copiedShapeData = null;
let draggedShapeInitialFrameLine = null;
let hoveredFrameLine = null;

let startX, startY;

let lineColorOptions = document.querySelectorAll(".lineColor > span");
let lineThicknessOptions = document.querySelectorAll(".lineThicknessSpan");
let lineOutlineOptions = document.querySelectorAll(".lineStyleSpan");
let lineSlopeOptions = document.querySelectorAll(".lineSlopeSpan");
let lineEdgeOptions = document.querySelectorAll(".lineEdgeSpan");


function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

// Add delete functionality
function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'line') {
        const idx = shapes.indexOf(currentShape);
        if (idx !== -1) shapes.splice(idx, 1);
        if (currentShape.group.parentNode) {
            currentShape.group.parentNode.removeChild(currentShape.group);
        }
        pushDeleteAction(currentShape);
        currentShape = null;
        disableAllSideBars();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'line') {
        deleteCurrentShape();
    }
});

const handleMouseDown = (e) => {
    if (!isLineToolActive && !isSelectionToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);

    if (isLineToolActive) {
        isDrawingLine = true;
        currentLine = new Line(
            { x, y },
            { x, y },
            {
                stroke: lineColor ?? getThemeStroke(),
                strokeWidth: lineStrokeWidth,
                roughness: lineSktetchRate,
                bowing: lineEdgeType,
                strokeDasharray: lineStrokeStyle === "dashed" ? "5,5" : (lineStrokeStyle === "dotted" ? "2,12" : "")
            }
        );
        currentLine.isBeingDrawn = true;
        shapes.push(currentLine);
        currentShape = currentLine;
    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        
        // Check if clicking on current selected line
        if (currentShape && currentShape.shapeName === 'line' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(x, y);
            
            if (anchorInfo && anchorInfo.type === 'anchor') {
                clickedOnShape = true;
                currentShape.scheduleDragRender?.();
                // Start anchor drag
                dragOldPosLine = {
                    startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                    endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                    controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                    isCurved: currentShape.isCurved,
                    parentFrame: currentShape.parentFrame
                };
                
                const anchorIndex = anchorInfo.index;
                
                const onPointerMove = (event) => {
                    const { x: newX, y: newY } = getSVGCoordsFromMouse(event);
                    currentShape.updatePosition(anchorIndex, newX, newY);
                };
                
                const onPointerUp = () => {
                    currentShape.finalizeMove?.();
                    if (dragOldPosLine) {
                        const newPos = {
                            startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                            endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                            controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                            isCurved: currentShape.isCurved,
                            parentFrame: currentShape.parentFrame
                        };
                        pushTransformAction(currentShape, dragOldPosLine, newPos);
                        dragOldPosLine = null;
                    }
                    svg.removeEventListener('pointermove', onPointerMove);
                    svg.removeEventListener('pointerup', onPointerUp);
                };
                
                svg.addEventListener('pointermove', onPointerMove);
                svg.addEventListener('pointerup', onPointerUp);
                
                // Prevent default to stop any other drag behavior
                e.preventDefault();
                e.stopPropagation();
                
            } else if (currentShape.contains(x, y)) {
                // Dragging the line itself (not anchors)
                isDraggingLine = true;
                currentShape.scheduleDragRender?.();
                dragOldPosLine = {
                    startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                    endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                    controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                    isCurved: currentShape.isCurved,
                    parentFrame: currentShape.parentFrame
                };
                
                // Store initial frame state
                draggedShapeInitialFrameLine = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = x;
                startY = y;
                clickedOnShape = true;
            }
        }

        // If not clicking on selected shape, check for other shapes
        if (!clickedOnShape) {
            let shapeToSelect = null;
            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                if (shape instanceof Line && shape.contains(x, y)) {
                    shapeToSelect = shape;
                    break;
                }
            }

            if (currentShape && currentShape !== shapeToSelect) {
                currentShape.removeSelection();
                currentShape = null;
            }

            if (shapeToSelect) {
                currentShape = shapeToSelect;
                currentShape.selectLine();
                clickedOnShape = true;
            }
        }

        if (!clickedOnShape && currentShape) {
            currentShape.removeSelection();
            currentShape = null;
        }
    }
};
// Update clone function to remove rotation property
function cloneLineData(line) {
    return {
        startPoint: { x: line.startPoint.x, y: line.startPoint.y },
        endPoint: { x: line.endPoint.x, y: line.endPoint.y },
        controlPoint: line.controlPoint ? { x: line.controlPoint.x, y: line.controlPoint.y } : null,
        isCurved: line.isCurved || false,
        parentFrame: line.parentFrame,
        options: cloneOptions(line.options)
    };
}

const handleMouseMove = (e) => {
    const { x, y } = getSVGCoordsFromMouse(e);
    
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };
    
    if (isDrawingLine && currentLine) {
        let endX = x, endY = y;
        if (e.shiftKey) {
            const dx = x - currentLine.startPoint.x;
            const dy = y - currentLine.startPoint.y;
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const dist = Math.sqrt(dx * dx + dy * dy);
            endX = currentLine.startPoint.x + dist * Math.cos(snapAngle);
            endY = currentLine.startPoint.y + dist * Math.sin(snapAngle);
        }
        currentLine.endPoint = { x: endX, y: endY };
        currentLine.draw();
        
        // Check for frame containment while drawing (but don't apply clipping yet)
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentLine)) {
                    frame.highlightFrame();
                    hoveredFrameLine = frame;
                } else if (hoveredFrameLine === frame) {
                    frame.removeHighlight();
                    hoveredFrameLine = null;
                }
            }
        });
    } else if (isDraggingLine && currentShape && currentShape.isSelected) {
        const dx = x - startX;
        const dy = y - startY;
        currentShape.move(dx, dy);
        startX = x;
        startY = y;

        // Issue #24 bug #4: track containing frame during existing-line
        // drag so mouseUp re-parents from current geometry, not from a
        // stale hoveredFrameLine.
        let newHover = null;
        for (const f of shapes) {
            if (f.shapeName !== 'frame') continue;
            if (f === currentShape) continue;
            if (typeof f.isShapeInFrame === 'function' && f.isShapeInFrame(currentShape)) {
                newHover = f;
                break;
            }
        }
        if (hoveredFrameLine && hoveredFrameLine !== newHover && typeof hoveredFrameLine.removeHighlight === 'function') {
            hoveredFrameLine.removeHighlight();
        }
        if (newHover && newHover !== hoveredFrameLine && typeof newHover.highlightFrame === 'function') {
            newHover.highlightFrame();
        }
        hoveredFrameLine = newHover;

        // Snap guides
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const snap = calculateSnap(currentShape, e.shiftKey, e.clientX, e.clientY);
            if (snap.dx || snap.dy) {
                currentShape.move(snap.dx, snap.dy);
            }
        } else {
            clearSnapGuides();
        }
    }
};

const handleMouseUp = (e) => {
    if (isDrawingLine) {
        isDrawingLine = false;
        
        // Check if line is too small
        const dx = currentLine.endPoint.x - currentLine.startPoint.x;
        const dy = currentLine.endPoint.y - currentLine.startPoint.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq < (5 / currentZoom) ** 2) {
            shapes.pop();
            if (currentLine.group.parentNode) {
                currentLine.group.parentNode.removeChild(currentLine.group);
            }
            currentLine = null;
            currentShape = null;
        } else {
            // Finalize: apply roughness now that drawing is done
            currentLine.isBeingDrawn = false;
            currentLine.draw();

            // Push create action for undo/redo
            pushCreateAction(currentLine);

            // Check for frame containment and track attachment
            const finalFrame = hoveredFrameLine;
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentLine);
                // Track the attachment for undo
                pushFrameAttachmentAction(finalFrame, currentLine, 'attach', null);
            }

            // Auto-select the drawn line and switch to selection tool
            const drawnLine = currentLine;
            if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
            currentShape = drawnLine;
            drawnLine.selectLine();
        }
        
        // Clear frame highlighting
        if (hoveredFrameLine) {
            hoveredFrameLine.removeHighlight();
            hoveredFrameLine = null;
        }
        
        currentLine = null;
    }
    
    if (isDraggingLine && dragOldPosLine && currentShape) {
        currentShape.finalizeMove?.();
        // Issue #34 bug #2: use hoveredFrameLine (actual destination) instead
        // of the stale parentFrame — containment transfer hasn't happened yet.
        const newPos = {
            startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
            endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
            controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
            parentFrame: hoveredFrameLine || null,
        };
        const oldPos = {
            ...dragOldPosLine,
            parentFrame: draggedShapeInitialFrameLine
        };
        
        const stateChanged = dragOldPosLine.startPoint.x !== newPos.startPoint.x || 
                           dragOldPosLine.startPoint.y !== newPos.startPoint.y ||
                           dragOldPosLine.endPoint.x !== newPos.endPoint.x || 
                           dragOldPosLine.endPoint.y !== newPos.endPoint.y;

        const frameChanged = oldPos.parentFrame !== newPos.parentFrame;
        
        if (stateChanged || frameChanged) {
            pushTransformAction(currentShape, oldPos, newPos);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingLine) {
            const finalFrame = hoveredFrameLine;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameLine !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameLine) {
                    draggedShapeInitialFrameLine.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameLine, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameLine);
                }
            } else if (draggedShapeInitialFrameLine) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameLine.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosLine = null;
        draggedShapeInitialFrameLine = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrameLine) {
        hoveredFrameLine.removeHighlight();
        hoveredFrameLine = null;
    }
    
    clearSnapGuides();
    isDraggingLine = false;
};

// --- Event Handlers ---

// --- Style Option Event Listeners ---
lineColorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineColorOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.stroke = span.getAttribute("data-id");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineColor = span.getAttribute("data-id");
        }
    });
});

lineThicknessOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineThicknessOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeWidth = parseInt(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineStrokeWidth = parseInt(span.getAttribute("data-id"));
        }
    });
});

lineOutlineOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineOutlineOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            const style = span.getAttribute("data-id");
            currentShape.options.strokeDasharray = 
                style === "dashed" ? "5,5" : 
                (style === "dotted" ? "2,12" : "");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineStrokeStyle = span.getAttribute("data-id");
        }
    });
});

lineSlopeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineSlopeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.roughness = parseFloat(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineSktetchRate = parseFloat(span.getAttribute("data-id"));
        }
    });
});

lineEdgeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineEdgeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.bowing = parseFloat(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineEdgeType = parseFloat(span.getAttribute("data-id"));
        }
    });
});

// Add copy/paste functionality
function cloneOptions(options) {
    return JSON.parse(JSON.stringify(options));
}

window.Line = Line;

// Bridge line tool settings to React sidebar
window.lineToolSettings = {
    get strokeColor() { return lineColor; },
    set strokeColor(v) { lineColor = v; },
    get strokeWidth() { return lineStrokeWidth; },
    set strokeWidth(v) { lineStrokeWidth = v; },
    get strokeStyle() { return lineStrokeStyle; },
    set strokeStyle(v) { lineStrokeStyle = v; },
    get sloppiness() { return lineSktetchRate; },
    set sloppiness(v) { lineSktetchRate = v; },
    get edge() { return lineEdgeType; },
    set edge(v) { lineEdgeType = v; },
};
window.updateSelectedLineStyle = function(changes) {
    if (currentShape instanceof Line && currentShape.isSelected) {
        const oldOptions = {...currentShape.options};
        if (changes.stroke !== undefined) { lineColor = changes.stroke; currentShape.options.stroke = changes.stroke; }
        if (changes.strokeWidth !== undefined) { lineStrokeWidth = changes.strokeWidth; currentShape.options.strokeWidth = changes.strokeWidth; }
        if (changes.strokeStyle !== undefined) {
            lineStrokeStyle = changes.strokeStyle;
            currentShape.options.strokeDasharray = changes.strokeStyle === "dashed" ? "5,5" : (changes.strokeStyle === "dotted" ? "2,12" : "");
        }
        if (changes.sloppiness !== undefined) { lineSktetchRate = changes.sloppiness; currentShape.options.roughness = changes.sloppiness; }
        if (changes.edge !== undefined) { lineEdgeType = changes.edge; currentShape.options.bowing = changes.edge; }
        currentShape.draw();
        pushOptionsChangeAction(currentShape, oldOptions);
    } else {
        if (changes.stroke !== undefined) lineColor = changes.stroke;
        if (changes.strokeWidth !== undefined) lineStrokeWidth = changes.strokeWidth;
        if (changes.strokeStyle !== undefined) lineStrokeStyle = changes.strokeStyle;
        if (changes.sloppiness !== undefined) lineSktetchRate = changes.sloppiness;
        if (changes.edge !== undefined) lineEdgeType = changes.edge;
    }
};

export {
    handleMouseDown as handleMouseDownLine,
    handleMouseMove as handleMouseMoveLine,
    handleMouseUp as handleMouseUpLine,
};
