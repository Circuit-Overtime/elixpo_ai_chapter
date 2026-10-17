/* eslint-disable */
// Freehand tool event handlers - extracted from canvasStroke.js
import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { updateAttachedArrows as updateArrowsForShape, cleanupAttachments } from './arrowTool.js';
import { calculateSnap, clearSnapGuides } from '../core/SnapGuides.js';

function getThemeStroke() { if (typeof document === "undefined") return "#fff"; return document.body && document.body.classList.contains("theme-dark") ? "#fff" : "#000000"; }

// Expose updateArrowsForShape globally so FreehandStroke.updateAttachedArrows() can call it
// (FreehandStroke.js is a separate module and cannot import freehandTool's local bindings)
window.__updateArrowsForShape = updateArrowsForShape;

const strokeColors = document.querySelectorAll(".strokeColors span");
const strokeThicknesses = document.querySelectorAll(".strokeThickness span");
const strokeStyles = document.querySelectorAll(".strokeStyleSpan");
const strokeTapers = document.querySelectorAll(".strokeTaperSpan");
const strokeRoughnesses = document.querySelectorAll(".strokeRoughnessSpan");
let strokeColor = null;
let strokeThickness = 2;
let strokeStyleValue = "solid";
let strokeThinning = 0;
let strokeRoughnessValue = "smooth";
let points = [];
let isDrawingStroke = false;
let currentStroke = null;
let strokeOpacity = 1;


let isDraggingStroke = false;
let isResizingStroke = false;
let isRotatingStroke = false;
let dragOldPosStroke = null;
let resizingAnchorIndex = null;
let startRotationMouseAngle = null;
let startShapeRotation = null;
let startX, startY;

// Frame attachment variables
let draggedShapeInitialFrameStroke = null;
let hoveredFrameStroke = null;

// Enhanced mouse tracking with better point collection
let lastPoint = null;
let lastTime = 0;
const minDistance = 2; // Minimum distance between points
const maxDistance = 15; // Maximum distance for interpolation
let isdraggingOpacity = false;


function getSvgCoordinates(event) {
    const rect = svg.getBoundingClientRect();
    const scaleX = currentViewBox.width / rect.width;
    const scaleY = currentViewBox.height / rect.height;

    const svgX = currentViewBox.x + (event.clientX - rect.left) * scaleX;
    const svgY = currentViewBox.y + (event.clientY - rect.top) * scaleY;

    return { x: svgX, y: svgY };
}

function getSvgPathFromStroke(stroke) {
    if (!stroke.length) return '';
    
    // Use more sophisticated curve fitting
    const pathData = [];
    pathData.push('M', stroke[0][0], stroke[0][1]);
    
    for (let i = 1; i < stroke.length - 1; i++) {
        const curr = stroke[i];
        const next = stroke[i + 1];
        
        // Calculate control points for smoother curves
        const cpX = curr[0] + (next[0] - curr[0]) * 0.5;
        const cpY = curr[1] + (next[1] - curr[1]) * 0.5;
        
        pathData.push('Q', curr[0], curr[1], cpX, cpY);
    }
    
    // Add final point
    if (stroke.length > 1) {
        const lastPoint = stroke[stroke.length - 1];
        pathData.push('L', lastPoint[0], lastPoint[1]);
    }
    
    return pathData.join(' ');
}

// Frame containment check for a freehand stroke during drag.
// Lives here (not in FreehandStroke.js) because it needs isDraggingStroke & hoveredFrameStroke.
function updateFrameContainmentForStroke(shape) {
    if (shape.isBeingMovedByFrame) return;

    let targetFrame = null;
    shapes.forEach(s => {
        if (s.shapeName === 'frame' && s.isShapeInFrame(shape)) {
            targetFrame = s;
        }
    });

    if (shape.parentFrame && isDraggingStroke) {
        shape.parentFrame.temporarilyRemoveFromFrame(shape);
    }

    if (hoveredFrameStroke && hoveredFrameStroke !== targetFrame) {
        hoveredFrameStroke.removeHighlight();
    }
    if (targetFrame && targetFrame !== hoveredFrameStroke) {
        targetFrame.highlightFrame();
    }
    hoveredFrameStroke = targetFrame;
}

// Delete functionality
function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'freehandStroke') {
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
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'freehandStroke') {
        deleteCurrentShape();
    }
});

// Event handlers
function handleMouseDown(e) {
    const { x, y } = getSvgCoordinates(e);
    
    if (isPaintToolActive) {
        isDrawingStroke = true;
        const pressure = e.pressure || 0.5;
        points = [[x, y, pressure]];
        lastPoint = [x, y, pressure];
        lastTime = Date.now();

        currentStroke = new FreehandStroke(points, {
            stroke: strokeColor ?? getThemeStroke(),
            strokeWidth: strokeThickness
        });

        shapes.push(currentStroke);
        currentShape = currentStroke;
    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        
        // Check if clicking on current selected stroke
        if (currentShape && currentShape.shapeName === 'freehandStroke' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(x, y);
            if (anchorInfo) {
                if (anchorInfo.type === 'resize') {
                    isResizingStroke = true;
                    resizingAnchorIndex = anchorInfo.index;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                } else if (anchorInfo.type === 'rotate') {
                    isRotatingStroke = true;
                    const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
                    const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
                    startRotationMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
                    startShapeRotation = currentShape.rotation;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                }
                clickedOnShape = true;
            } else if (currentShape.contains(x, y)) {
                isDraggingStroke = true;
                dragOldPosStroke = cloneStrokeData(currentShape);
                
                // Store initial frame state
                draggedShapeInitialFrameStroke = currentShape.parentFrame || null;
                
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
                if (shape instanceof FreehandStroke && shape.contains(x, y)) {
                    shapeToSelect = shape;
                    break;
                }
            }

            if (currentShape && currentShape !== shapeToSelect) {
                currentShape.deselectStroke();
                currentShape = null;
            }

            if (shapeToSelect) {
                currentShape = shapeToSelect;
                currentShape.selectStroke(); // This will show the sidebar
                
                const anchorInfo = currentShape.isNearAnchor(x, y);
                if (anchorInfo) {
                    if (anchorInfo.type === 'resize') {
                        isResizingStroke = true;
                        resizingAnchorIndex = anchorInfo.index;
                        dragOldPosStroke = cloneStrokeData(currentShape);
                    } else if (anchorInfo.type === 'rotate') {
                        isRotatingStroke = true;
                        const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
                        const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
                        startRotationMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
                        startShapeRotation = currentShape.rotation;
                        dragOldPosStroke = cloneStrokeData(currentShape);
                    }
                } else {
                    isDraggingStroke = true;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                    
                    // Store initial frame state
                    draggedShapeInitialFrameStroke = currentShape.parentFrame || null;
                    
                    // Temporarily remove from frame clipping if dragging
                    if (currentShape.parentFrame) {
                        currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                    }
                    
                    startX = x;
                    startY = y;
                }
                clickedOnShape = true;
            }
        }

        if (!clickedOnShape && currentShape) {
            currentShape.deselectStroke();
            currentShape = null;
            disableAllSideBars(); // Hide sidebar when deselecting
        }
    }
}

function handleMouseMove(e) {
    let { x, y } = getSvgCoordinates(e);
    const currentTime = Date.now();
    
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };
    
    if (isDrawingStroke && isPaintToolActive) {
        const pressure = e.pressure || 0.5;

        // Shift key constrains to straight line from start point
        if (e.shiftKey && points.length > 0) {
            const startX = points[0][0], startY = points[0][1];
            const dx = x - startX, dy = y - startY;
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const dist = Math.sqrt(dx * dx + dy * dy);
            x = startX + dist * Math.cos(snapAngle);
            y = startY + dist * Math.sin(snapAngle);
            // Reset points to just start + current for straight line
            points = [points[0], [x, y, pressure]];
            lastPoint = [x, y, pressure];
            currentStroke.points = points;
            currentStroke.draw();
            return;
        }

        if (lastPoint) {
            const dx = x - lastPoint[0];
            const dy = y - lastPoint[1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only add point if it's far enough from the last one
            if (distance >= minDistance) {
                // If distance is too large, interpolate points
                if (distance > maxDistance) {
                    const steps = Math.ceil(distance / maxDistance);
                    for (let i = 1; i < steps; i++) {
                        const t = i / steps;
                        const interpX = lastPoint[0] + dx * t;
                        const interpY = lastPoint[1] + dy * t;
                        const interpPressure = lastPoint[2] + (pressure - lastPoint[2]) * t;
                        points.push([interpX, interpY, interpPressure]);
                    }
                }
                
                // Calculate velocity-based pressure
                const timeDelta = currentTime - lastTime;
                const velocity = distance / Math.max(timeDelta, 1);
                const velocityPressure = Math.min(1, Math.max(0.1, 1 - velocity * 0.02));
                const finalPressure = (pressure + velocityPressure) * 0.5;
                
                points.push([x, y, finalPressure]);
                currentStroke.points = points;
                currentStroke.draw();
                
                lastPoint = [x, y, finalPressure];
                lastTime = currentTime;
            }
        } else {
            lastPoint = [x, y, pressure];
            lastTime = currentTime;
        }
        
        // Check for frame containment while drawing (but don't apply clipping yet)
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentStroke)) {
                    frame.highlightFrame();
                    hoveredFrameStroke = frame;
                } else if (hoveredFrameStroke === frame) {
                    frame.removeHighlight();
                    hoveredFrameStroke = null;
                }
            }
        });
    } else if (isDraggingStroke && currentShape && currentShape.isSelected) {
        const dx = x - startX;
        const dy = y - startY;
        currentShape.move(dx, dy);
        startX = x;
        startY = y;

        // Frame containment update (must live here where isDraggingStroke is in scope)
        if (!currentShape.isBeingMovedByFrame) {
            updateFrameContainmentForStroke(currentShape);
        }

        // Update arrows attached to this shape
        currentShape.updateAttachedArrows();

        // Snap guides
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const snap = calculateSnap(currentShape, e.shiftKey, e.clientX, e.clientY);
            if (snap.dx || snap.dy) {
                currentShape.move(snap.dx, snap.dy);
            }
        } else {
            clearSnapGuides();
        }
    } else if (isResizingStroke && currentShape && currentShape.isSelected) {
        currentShape.updatePosition(resizingAnchorIndex, x, y);
    } else if (isRotatingStroke && currentShape && currentShape.isSelected) {
        const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
        const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
        const currentMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
        const angleDiff = currentMouseAngle - startRotationMouseAngle;
        currentShape.rotate(startShapeRotation + angleDiff);
        currentShape.draw();
    }
}

function handleMouseUp(e) {
    if (isDrawingStroke) {
        isDrawingStroke = false;
        lastPoint = null;
        
        // Final smoothing pass after drawing is complete
        if (currentStroke && currentStroke.points.length >= 2) {
            currentStroke.draw(); // Redraw with final smoothing
            pushCreateAction(currentStroke);

            // Check for frame containment and track attachment
            const finalFrame = hoveredFrameStroke;
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentStroke);
                // Track the attachment for undo
                pushFrameAttachmentAction(finalFrame, currentStroke, 'attach', null);
            }

            // Auto-select the drawn stroke and switch to selection tool
            const drawnShape = currentStroke;
            if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
            currentShape = drawnShape;
            currentShape.selectStroke();
        } else if (currentStroke) {
            // Remove strokes that are too small
            shapes.pop();
            if (currentStroke.group.parentNode) {
                currentStroke.group.parentNode.removeChild(currentStroke.group);
            }
        }

        // Clear frame highlighting
        if (hoveredFrameStroke) {
            hoveredFrameStroke.removeHighlight();
            hoveredFrameStroke = null;
        }

        currentStroke = null;
    }
    
    if ((isDraggingStroke || isResizingStroke || isRotatingStroke) && dragOldPosStroke && currentShape) {
        const newPos = cloneStrokeData(currentShape);
        const stateChanged = 
            JSON.stringify(dragOldPosStroke.points) !== JSON.stringify(newPos.points) ||
            dragOldPosStroke.rotation !== newPos.rotation;
        
        const oldPos = {
            ...dragOldPosStroke,
            parentFrame: draggedShapeInitialFrameStroke
        };
        // Issue #34 bug #2: for drag, hoveredFrameStroke is the actual
        // destination — currentShape.parentFrame at this point is still
        // the OLD frame. Resize / rotate don't track hover, fall back to
        // the shape's own parent.
        const newPosForUndo = {
            ...newPos,
            parentFrame: isDraggingStroke
                ? (hoveredFrameStroke || null)
                : currentShape.parentFrame,
        };
        
        const frameChanged = oldPos.parentFrame !== newPosForUndo.parentFrame;
        
        if (stateChanged || frameChanged) {
            pushTransformAction(currentShape, oldPos, newPosForUndo);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingStroke) {
            const finalFrame = hoveredFrameStroke;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameStroke !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameStroke) {
                    draggedShapeInitialFrameStroke.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameStroke, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameStroke);
                }
            } else if (draggedShapeInitialFrameStroke) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameStroke.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosStroke = null;
        draggedShapeInitialFrameStroke = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrameStroke) {
        hoveredFrameStroke.removeHighlight();
        hoveredFrameStroke = null;
    }
    
    // Bake accumulated move offset into point coordinates
    if (currentShape && typeof currentShape.finalizeMove === 'function') {
        currentShape.finalizeMove();
    }
    clearSnapGuides();
    isDraggingStroke = false;
    isResizingStroke = false;
    isRotatingStroke = false;
    resizingAnchorIndex = null;
    startRotationMouseAngle = null;
    startShapeRotation = null;
    svg.style.cursor = 'default';
}

// Color and thickness selection
strokeColors.forEach(span => {
    span.addEventListener("click", (event) => {
        strokeColors.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.stroke = span.getAttribute("data-id");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeColor = span.getAttribute("data-id");
        }
    });
});

strokeThicknesses.forEach(span => {
    span.addEventListener("click", (event) => {
        strokeThicknesses.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeWidth = parseInt(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeThickness = parseInt(span.getAttribute("data-id"));
        }
    });
});


strokeStyles.forEach(span => {
    span.addEventListener("click", () => {
        strokeStyles.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        const val = span.getAttribute("data-id");
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeStyle = val;
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeStyleValue = val;
        }
    });
});

strokeTapers.forEach(span => {
    span.addEventListener("click", () => {
        strokeTapers.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        const val = parseFloat(span.getAttribute("data-id"));
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.thinning = val;
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeThinning = val;
        }
    });
});

strokeRoughnesses.forEach(span => {
    span.addEventListener("click", () => {
        strokeRoughnesses.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        const val = span.getAttribute("data-id");
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.roughness = val;
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeRoughnessValue = val;
        }
    });
});

document.getElementById("strokeOpacity")?.addEventListener("mousedown", (event) => {
    isdraggingOpacity = true;
});

document.getElementById("strokeOpacity")?.addEventListener("mousemove", (event) => {
    if(isdraggingOpacity) 
    {
        const slider = document.getElementById("strokeOpacity");
        const rect = slider.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (mouseX / rect.width) * 100));
        document.getElementById("opacityContainerValue").textContent = percent.toFixed(0);
        const opacity = percent / 100; 
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeOpacity = opacity; 
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeOpacity = opacity; 
        }
    }
});

document.getElementById("strokeOpacity")?.addEventListener("mouseup", (event) => {
    isdraggingOpacity = false;
});

function cloneOptions(options) {
    return JSON.parse(JSON.stringify(options));
}

function cloneStrokeData(stroke) {
    return {
        points: JSON.parse(JSON.stringify(stroke.points)),
        rotation: stroke.rotation,
        options: cloneOptions(stroke.options)
    };
}

// Event listeners
// svg.addEventListener('pointerdown', handleMouseDown);
// svg.addEventListener('pointermove', handleMouseMove);
// svg.addEventListener('pointerup', handleMouseUp);

// Bridge freehand tool settings to React sidebar
window.freehandToolSettings = {
    get strokeColor() { return strokeColor; },
    set strokeColor(v) { strokeColor = v; },
    get strokeWidth() { return strokeThickness; },
    set strokeWidth(v) { strokeThickness = v; },
    get strokeStyle() { return strokeStyleValue; },
    set strokeStyle(v) { strokeStyleValue = v; },
    get thinning() { return strokeThinning; },
    set thinning(v) { strokeThinning = v; },
    get roughness() { return strokeRoughnessValue; },
    set roughness(v) { strokeRoughnessValue = v; },
    get opacity() { return strokeOpacity; },
    set opacity(v) { strokeOpacity = v; },
};
window.updateSelectedFreehandStyle = function(changes) {
    if (currentShape && currentShape.shapeName === 'freehandStroke' && currentShape.isSelected) {
        if (changes.stroke !== undefined) { strokeColor = changes.stroke; currentShape.options.stroke = changes.stroke; }
        if (changes.strokeWidth !== undefined) { strokeThickness = changes.strokeWidth; currentShape.options.strokeWidth = changes.strokeWidth; }
        if (changes.thinning !== undefined) { strokeThinning = changes.thinning; currentShape.options.thinning = changes.thinning; }
        if (changes.roughness !== undefined) { strokeRoughnessValue = changes.roughness; currentShape.options.roughness = changes.roughness; }
        if (changes.opacity !== undefined) { strokeOpacity = changes.opacity; currentShape.options.strokeOpacity = changes.opacity; }
        currentShape.draw();
    } else {
        if (changes.stroke !== undefined) strokeColor = changes.stroke;
        if (changes.strokeWidth !== undefined) strokeThickness = changes.strokeWidth;
        if (changes.thinning !== undefined) strokeThinning = changes.thinning;
        if (changes.roughness !== undefined) strokeRoughnessValue = changes.roughness;
        if (changes.opacity !== undefined) strokeOpacity = changes.opacity;
    }
};

// Safety net: if mouseup fires outside the SVG canvas (e.g. on toolbar/overlay),
// ensure we stop drawing so the stroke doesn't continue when pointer re-enters.
window.addEventListener('pointerup', () => {
    if (isDrawingStroke) {
        isDrawingStroke = false;
        lastPoint = null;
        if (currentStroke && currentStroke.points && currentStroke.points.length >= 2) {
            currentStroke.draw();
        }
        currentStroke = null;
    }
});

// Also listen for visibility change (e.g. alt-tab while drawing)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isDrawingStroke) {
        isDrawingStroke = false;
        lastPoint = null;
        currentStroke = null;
    }
});

export
{
    handleMouseDown as handleFreehandMouseDown,
    handleMouseMove as handleFreehandMouseMove,
    handleMouseUp as handleFreehandMouseUp,
}
