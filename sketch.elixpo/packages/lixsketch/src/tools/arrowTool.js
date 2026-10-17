/* eslint-disable */
// Arrow tool event handlers - extracted from drawArrow.js
import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { calculateSnap, clearSnapGuides } from '../core/SnapGuides.js';


function getThemeStroke() { if (typeof document === "undefined") return "#fff"; return document.body && document.body.classList.contains("theme-dark") ? "#fff" : "#000000"; }

let arrowStartX, arrowStartY;
let currentArrow = null;
let isResizing = false;
let isDragging = false;
let activeAnchor = null;
let isDrawingArrow = false;
let arrowStrokeColor = null;
let arrowStrokeThickness = 2;
let arrowOutlineStyle = "solid";
let arrowCurved = "straight";
let arrowCurveAmount = 20;
let arrowHeadLength = 10;
let arrowHeadAngleDeg = 30;
let arrowHeadStyle = "default";
let startX, startY;
let dragOldPosArrow = null;
let draggedShapeInitialFrameArrow = null;
let hoveredFrameArrow = null;
let arrowStrokeColorOptions = document.querySelectorAll(".arrowStrokeSpan");
let arrowStrokeThicknessValue = document.querySelectorAll(".arrowStrokeThickSpan");
let arrowOutlineStyleValue = document.querySelectorAll(".arrowOutlineStyle");
let arrowTypeStyleValue = document.querySelectorAll(".arrowTypeStyle");
let arrowHeadStyleValue = document.querySelectorAll(".arrowHeadStyleSpan");
let arrowCurveAmountOptions = document.querySelectorAll(".arrowCurveSpan");


function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'arrow') {
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
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'arrow') {
        deleteCurrentShape();
    }
});


const handleMouseDown = (e) => {
    if (!isArrowToolActive && !isSelectionToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);

    if (isArrowToolActive) {
        isDrawingArrow = true;
        currentArrow = new Arrow({ x, y }, { x, y }, {
            stroke: arrowStrokeColor ?? getThemeStroke(),
            strokeWidth: arrowStrokeThickness,
            arrowOutlineStyle: arrowOutlineStyle,
            arrowHeadStyle: arrowHeadStyle,
            arrowCurved: arrowCurved,
            arrowCurveAmount: arrowCurveAmount
        });
        shapes.push(currentArrow);
        currentShape = currentArrow;
    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        let clickedOnAnchor = false;

        if (currentShape && currentShape.shapeName === 'arrow' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(x, y);
            if (anchorInfo && anchorInfo.type === 'anchor') {
                clickedOnAnchor = true;
                clickedOnShape = true;
            } 
            if (currentShape.contains(x, y)) {
                isDragging = true;
                dragOldPosArrow = {
                    startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                    endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                    controlPoint1: currentShape.controlPoint1 ? { x: currentShape.controlPoint1.x, y: currentShape.controlPoint1.y } : null,
                    controlPoint2: currentShape.controlPoint2 ? { x: currentShape.controlPoint2.x, y: currentShape.controlPoint2.y } : null,
                    parentFrame: currentShape.parentFrame  // Add this line
                };
                
                // Store initial frame state
                draggedShapeInitialFrameArrow = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = x;
                startY = y;
                clickedOnShape = true;
            }
                    }

        if (!clickedOnShape) {
            let shapeToSelect = null;

            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                if (shape instanceof Arrow && shape.contains(x, y)) {
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
                currentShape.selectArrow();

                const anchorInfo = currentShape.isNearAnchor(x, y);
                if (anchorInfo && anchorInfo.type === 'anchor') {
                    clickedOnAnchor = true;
                } else {
                    isDragging = true;
                    dragOldPosArrow = {
                        startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                        endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                        controlPoint1: currentShape.controlPoint1 ? { x: currentShape.controlPoint1.x, y: currentShape.controlPoint1.y } : null,
                        controlPoint2: currentShape.controlPoint2 ? { x: currentShape.controlPoint2.x, y: currentShape.controlPoint2.y } : null
                    };
                    startX = x;
                    startY = y;
                }
                clickedOnShape = true;
            }
        }

        if (!clickedOnShape && !clickedOnAnchor && currentShape) {
            currentShape.removeSelection();
            currentShape = null;
        }
    }
};

// Enhanced mouse move with better cursor feedback
const handleMouseMove = (e) => {
    const { x, y } = getSVGCoordsFromMouse(e);

    if (isDrawingArrow && currentArrow) {
            let endX = x, endY = y;
            if (e.shiftKey) {
                const dx = x - currentArrow.startPoint.x;
                const dy = y - currentArrow.startPoint.y;
                const angle = Math.atan2(dy, dx);
                const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                const dist = Math.sqrt(dx * dx + dy * dy);
                endX = currentArrow.startPoint.x + dist * Math.cos(snapAngle);
                endY = currentArrow.startPoint.y + dist * Math.sin(snapAngle);
            }
            currentArrow.endPoint = { x: endX, y: endY };

            // Check for potential attachment and show preview
            const nearbyShape = Arrow.findNearbyShape({ x: endX, y: endY });
            if (nearbyShape) {
                // Snap to attachment point
                currentArrow.endPoint = nearbyShape.attachment.point;
                svg.style.cursor = 'crosshair';

                const existingPreview = svg.querySelector('.attachment-preview');
                if (existingPreview) existingPreview.remove();

                const preview = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                preview.setAttribute("cx", nearbyShape.attachment.point.x);
                preview.setAttribute("cy", nearbyShape.attachment.point.y);
                preview.setAttribute("r", 6);
                preview.setAttribute("fill", "none");
                preview.setAttribute("stroke", "#5B57D1");
                preview.setAttribute("stroke-width", 2);
                preview.setAttribute("class", "attachment-preview");
                preview.setAttribute("opacity", "0.7");
                svg.appendChild(preview);
            } else {
                // Remove preview if no nearby shape
                const existingPreview = svg.querySelector('.attachment-preview');
                if (existingPreview) existingPreview.remove();
            }

            // Check for frame containment while drawing (but don't apply clipping yet)
            shapes.forEach(frame => {
                if (frame.shapeName === 'frame') {
                    if (frame.isShapeInFrame(currentArrow)) {
                        frame.highlightFrame();
                        hoveredFrameArrow = frame;
                    } else if (hoveredFrameArrow === frame) {
                        frame.removeHighlight();
                        hoveredFrameArrow = null;
                    }
                }
            });

            // Update control points for curved arrows during drawing
            if (currentArrow.arrowCurved) {
                currentArrow.initializeCurveControlPoints();
            }
            currentArrow.draw();
        }

    else if (isDragging && currentShape && currentShape.isSelected) {
        const dx = x - startX;
        const dy = y - startY;
        currentShape.move(dx, dy);
        startX = x;
        startY = y;

        // Issue #24 bug #4: track containing frame during drag of an
        // existing arrow so mouseUp re-parents correctly. Without this
        // hoveredFrameArrow stays null and the arrow is detached the
        // moment the user nudges it inside its own parent frame.
        let newHover = null;
        for (const f of shapes) {
            if (f.shapeName !== 'frame') continue;
            if (f === currentShape) continue;
            if (typeof f.isShapeInFrame === 'function' && f.isShapeInFrame(currentShape)) {
                newHover = f;
                break;
            }
        }
        if (hoveredFrameArrow && hoveredFrameArrow !== newHover && typeof hoveredFrameArrow.removeHighlight === 'function') {
            hoveredFrameArrow.removeHighlight();
        }
        if (newHover && newHover !== hoveredFrameArrow && typeof newHover.highlightFrame === 'function') {
            newHover.highlightFrame();
        }
        hoveredFrameArrow = newHover;

        // Snap guides
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const snap = calculateSnap(currentShape, e.shiftKey, e.clientX, e.clientY);
            if (snap.dx || snap.dy) {
                currentShape.move(snap.dx, snap.dy);
            }
        } else {
            clearSnapGuides();
        }

        svg.style.cursor = 'grabbing';
    } else if (isSelectionToolActive && currentShape && currentShape.isSelected) {
        // Provide visual feedback when hovering over anchors or the arrow
        const anchorInfo = currentShape.isNearAnchor(x, y);
        if (anchorInfo) {
            svg.style.cursor = 'grab';
        } else if (currentShape.contains(x, y)) {
            svg.style.cursor = 'move';
        } else {
            svg.style.cursor = 'default';
        }
    } else if (isSelectionToolActive) {
        // Check if hovering over any selectable arrow
        let hoveringOverArrow = false;
        for (let i = shapes.length - 1; i >= 0; i--) {
            const shape = shapes[i];
            if (shape instanceof Arrow && shape.contains(x, y)) {
                hoveringOverArrow = true;
                break;
            }
        }
        svg.style.cursor = hoveringOverArrow ? 'pointer' : 'default';
    }
};

const handleMouseUp = (e) => {
if (isDrawingArrow && currentArrow) {
    // Remove any attachment preview that might still be visible
    const existingPreview = svg.querySelector('.attachment-preview');
    if (existingPreview) existingPreview.remove();

    // Check if arrow is too small
    const dx = currentArrow.endPoint.x - currentArrow.startPoint.x;
    const dy = currentArrow.endPoint.y - currentArrow.startPoint.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq < (5 / currentZoom) ** 2) {
        shapes.pop();
        if (currentArrow.group.parentNode) {
            currentArrow.group.parentNode.removeChild(currentArrow.group);
        }
        currentArrow = null;
        currentShape = null;
    } else {
        const startAttachment = Arrow.findNearbyShape(currentArrow.startPoint);
        const endAttachment = Arrow.findNearbyShape(currentArrow.endPoint);

        if (startAttachment) {
            currentArrow.attachToShape(true, startAttachment.shape, startAttachment.attachment);
        }

        if (endAttachment) {
            currentArrow.attachToShape(false, endAttachment.shape, endAttachment.attachment);
        }

        // Check for frame containment and track attachment
        const finalFrame = hoveredFrameArrow;
        if (finalFrame) {
            finalFrame.addShapeToFrame(currentArrow);
            // Track the attachment for undo
            pushFrameAttachmentAction(finalFrame, currentArrow, 'attach', null);
        }

        // Push create action for undo/redo
        pushCreateAction(currentArrow);

        // Auto-select the drawn arrow and switch to selection tool
        const drawnArrow = currentArrow;
        if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
        currentShape = drawnArrow;
        drawnArrow.selectArrow();
    }

    // Clear frame highlighting
    if (hoveredFrameArrow) {
        hoveredFrameArrow.removeHighlight();
        hoveredFrameArrow = null;
    }

    currentArrow = null;
}

if (isDragging && dragOldPosArrow && currentShape) {
    // Issue #34 bug #2: containment transfer happens later in this block,
    // so currentShape.parentFrame is still the OLD frame here. hoveredFrameArrow
    // tracks the actual destination during mousemove — use that as the truth.
    const newPos = {
        startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
        endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
        parentFrame: hoveredFrameArrow || null,
    };
    const oldPos = {
        ...dragOldPosArrow,
        parentFrame: draggedShapeInitialFrameArrow  // Add this line
    };
    
    const stateChanged = dragOldPosArrow.startPoint.x !== newPos.startPoint.x ||
                       dragOldPosArrow.startPoint.y !== newPos.startPoint.y ||
                       dragOldPosArrow.endPoint.x !== newPos.endPoint.x ||
                       dragOldPosArrow.endPoint.y !== newPos.endPoint.y;
    
    const frameChanged = oldPos.parentFrame !== newPos.parentFrame;

    if (stateChanged || frameChanged) {
        pushTransformAction(currentShape, oldPos, newPos);
    }
    
    // Handle frame containment changes after drag
    if (isDragging) {
        const finalFrame = hoveredFrameArrow;
        
        // If shape moved to a different frame
        if (draggedShapeInitialFrameArrow !== finalFrame) {
            // Remove from initial frame
            if (draggedShapeInitialFrameArrow) {
                draggedShapeInitialFrameArrow.removeShapeFromFrame(currentShape);
            }
            
            // Add to new frame
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentShape);
            }
            
            // Track the frame change for undo
            if (frameChanged) {
                pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameArrow, currentShape, 
                    finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameArrow);
            }
        } else if (draggedShapeInitialFrameArrow) {
            // Shape stayed in same frame, restore clipping
            draggedShapeInitialFrameArrow.restoreToFrame(currentShape);
        }
    }
    
    draggedShapeInitialFrameArrow = null;
    dragOldPosArrow = null;
}

// Clear frame highlighting
if (hoveredFrameArrow) {
    hoveredFrameArrow.removeHighlight();
    hoveredFrameArrow = null;
}

clearSnapGuides();
isDrawingArrow = false;
isResizing = false;
isDragging = false;
activeAnchor = null;
svg.style.cursor = 'default';
};

// Remove old event listeners and add new ones
svg.removeEventListener('pointerdown', handleMouseDown);
svg.removeEventListener('pointermove', handleMouseMove);
svg.removeEventListener('pointerup', handleMouseUp);


// Updated style handlers with undo/redo support
const updateSelectedArrowStyle = (styleChanges) => {
    if (currentShape instanceof Arrow && currentShape.isSelected) {
        const oldOptions = {
            ...currentShape.options,
            arrowOutlineStyle: currentShape.arrowOutlineStyle,
            arrowHeadStyle: currentShape.arrowHeadStyle,
            arrowCurved: currentShape.arrowCurved,
            arrowCurveAmount: currentShape.arrowCurveAmount
        };
        currentShape.updateStyle(styleChanges);
        pushOptionsChangeAction(currentShape, oldOptions);
    } else {
         if (styleChanges.stroke !== undefined) arrowStrokeColor = styleChanges.stroke;
         if (styleChanges.strokeWidth !== undefined) arrowStrokeThickness = styleChanges.strokeWidth;
         if (styleChanges.arrowOutlineStyle !== undefined) arrowOutlineStyle = styleChanges.arrowOutlineStyle;
         if (styleChanges.arrowHeadStyle !== undefined) arrowHeadStyle = styleChanges.arrowHeadStyle;
         if (styleChanges.arrowCurved !== undefined) arrowCurved = styleChanges.arrowCurved;
         if (styleChanges.arrowCurveAmount !== undefined) arrowCurveAmount = styleChanges.arrowCurveAmount;
    }
};

arrowStrokeColorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowStrokeColorOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        const newColor = span.getAttribute("data-id");
        updateSelectedArrowStyle({ stroke: newColor });
    });
});

arrowStrokeThicknessValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowStrokeThicknessValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        const newThickness = parseInt(span.getAttribute("data-id"));
        updateSelectedArrowStyle({ strokeWidth: newThickness });
    });
});

arrowOutlineStyleValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowOutlineStyleValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        const newStyle = span.getAttribute("data-id");
        updateSelectedArrowStyle({ arrowOutlineStyle: newStyle });
    });
});

arrowTypeStyleValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowTypeStyleValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        updateSelectedArrowStyle({ arrowCurved: span.getAttribute("data-id") });
    });
});

arrowCurveAmountOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowCurveAmountOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        updateSelectedArrowStyle({ arrowCurveAmount: parseInt(span.getAttribute("data-id")) });
    });
});

arrowHeadStyleValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        arrowHeadStyleValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        const newHeadStyle = span.getAttribute("data-id");
        updateSelectedArrowStyle({ arrowHeadStyle: newHeadStyle });
    });
});

function detachSelectedArrow() {
    if (currentShape instanceof Arrow && currentShape.isSelected) {
        if (currentShape.attachedToStart || currentShape.attachedToEnd) {
            const oldState = {
                attachedToStart: currentShape.attachedToStart,
                attachedToEnd: currentShape.attachedToEnd,
                startPoint: { ...currentShape.startPoint },
                endPoint: { ...currentShape.endPoint }
            };

            currentShape.detachFromShape(true);
            currentShape.detachFromShape(false);
            currentShape.draw();

            // Add to undo/redo if needed
        }
    }
}

function updateAttachedArrows(shape) {
    if (!shape) return;

    // If a DOM element was passed (e.g. from text/code/image move), find the wrapper
    let targetShape = shape;
    if (shape.nodeType) {
        targetShape = shapes.find(s => s.group === shape || s.element === shape) || shape;
    }

    shapes.forEach(arrowShape => {
        if (arrowShape instanceof Arrow) {
            let needsUpdate = false;
            if (arrowShape.attachedToStart && arrowShape.attachedToStart.shape === targetShape) {
                needsUpdate = true;
            }
            if (arrowShape.attachedToEnd && arrowShape.attachedToEnd.shape === targetShape) {
                needsUpdate = true;
            }

            if (needsUpdate) {
                arrowShape.updateAttachments();
            }
        }
    });
}

function cleanupAttachments(deletedShape) {
    if (!deletedShape) return;

    // If a DOM element was passed, find the wrapper
    let targetShape = deletedShape;
    if (deletedShape.nodeType) {
        targetShape = shapes.find(s => s.group === deletedShape || s.element === deletedShape) || deletedShape;
    }

    shapes.forEach(shape => {
        if (shape instanceof Arrow) {
            let needsDraw = false;
            if (shape.attachedToStart && shape.attachedToStart.shape === targetShape) {
                shape.detachFromShape(true);
                needsDraw = true;
            }
            if (shape.attachedToEnd && shape.attachedToEnd.shape === targetShape) {
                shape.detachFromShape(false);
                needsDraw = true;
            }
            if (needsDraw) {
                shape.draw();
            }
        }
    });
}

// Add keyboard shortcut to detach arrows
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'd' && e.ctrlKey) {
        e.preventDefault();
        detachSelectedArrow();
    }
});

// Expose arrow tool settings on window for React sidebar bridge
window.arrowToolSettings = {
    get strokeColor() { return arrowStrokeColor; },
    set strokeColor(v) { arrowStrokeColor = v; },
    get strokeWidth() { return arrowStrokeThickness; },
    set strokeWidth(v) { arrowStrokeThickness = v; },
    get outlineStyle() { return arrowOutlineStyle; },
    set outlineStyle(v) { arrowOutlineStyle = v; },
    get headStyle() { return arrowHeadStyle; },
    set headStyle(v) { arrowHeadStyle = v; },
    get arrowCurved() { return arrowCurved; },
    set arrowCurved(v) { arrowCurved = v; },
    get curveAmount() { return arrowCurveAmount; },
    set curveAmount(v) { arrowCurveAmount = v; },
};
window.updateSelectedArrowStyle = updateSelectedArrowStyle;

// Export the cleanup function
// Expose cleanupAttachments globally for centralized delete
window.cleanupAttachments = cleanupAttachments;

export {
    handleMouseDown as handleMouseDownArrow,
    handleMouseMove as handleMouseMoveArrow,
    handleMouseUp as handleMouseUpArrow,
    cleanupAttachments,
    updateAttachedArrows
};
