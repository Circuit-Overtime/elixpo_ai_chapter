/* eslint-disable */
// Circle tool event handlers - extracted from drawCircle.js
import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { cleanupAttachments } from './arrowTool.js';
import { calculateSnap, clearSnapGuides } from '../core/SnapGuides.js';

function getThemeStroke() { if (typeof document === "undefined") return "#fff"; return document.body && document.body.classList.contains("theme-dark") ? "#fff" : "#000000"; }

let isDrawingCircle = false;
let isDraggingShapeCircle = false;
let isResizingShapeCircle = false;
let isRotatingShapeCircle = false;
let resizingAnchorIndexCircle = null;

let startRotationMouseAngleCircle = null;
let startShapeRotationCircle = null;
const rc = rough.svg(svg);
let startX, startY;


let circleStrokecolor = null;
let circleBackgroundColor = "transparent";
let circleFillStyleValue = "none";
let circleStrokeThicknes = 2;
let circleOutlineStyle = "solid";

let dragOldPosCircle = null;
let draggedShapeInitialFrameCircle = null;
let hoveredFrameCircle = null;
let colorOptionsCircle = document.querySelectorAll(".circleStrokeSpan");
let backgroundColorOptionsCircle = document.querySelectorAll(".circleBackgroundSpan");
let fillStyleOptionsCircle = document.querySelectorAll(".circleFillStyleSpan");
let strokeThicknessValueCircle = document.querySelectorAll(".circleStrokeThickSpan");
let outlineStyleValueCircle = document.querySelectorAll(".circleOutlineStyle");



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
    if (currentShape && currentShape.shapeName === 'circle') {
        const idx = shapes.indexOf(currentShape);
        if (idx !== -1) shapes.splice(idx, 1);
        
        // Clean up any arrow attachments before deleting
        cleanupAttachments(currentShape);
        
        if (currentShape.group.parentNode) {
            currentShape.group.parentNode.removeChild(currentShape.group);
        }
        pushDeleteAction(currentShape);
        currentShape = null;
        disableAllSideBars();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'circle') {
        deleteCurrentShape();
    }
});

const handleMouseDown = (e) => {
    const {x: svgMouseX, y: svgMouseY} = getSVGCoordsFromMouse(e);

    if(isCircleToolActive)
    {
        startX = svgMouseX;
        startY = svgMouseY;
        isDrawingCircle = true;

        if(currentShape) 
        {
            currentShape.removeSelection();
            currentShape = null;
            disableAllSideBars();
        }
        let initialOptions = {
            stroke: circleStrokecolor ?? getThemeStroke(),
            fill: circleBackgroundColor,
            fillStyle: circleFillStyleValue,
            strokeWidth: circleStrokeThicknes,
        };
        if(circleOutlineStyle === "dashed") {
            initialOptions.strokeDasharray = "5,5";
        }
        else if(circleOutlineStyle === "dotted") {
            initialOptions.strokeDasharray = "2,8";
        } else {
            initialOptions.strokeDasharray = "";
        }

        currentShape = new Circle(startX, startY, 0, 0, initialOptions);
        currentShape.isBeingDrawn = true;
    }

    else if(isSelectionToolActive) 
    {
        let clickedOnShape = false;
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected)
        {
            const anchorInfo = currentShape.isNearAnchor(svgMouseX, svgMouseY);
            if (anchorInfo) {
                dragOldPosCircle = { 
                    x: currentShape.x, 
                    y: currentShape.y, 
                    rx: currentShape.rx, 
                    ry: currentShape.ry, 
                    rotation: currentShape.rotation 
                };
                if(anchorInfo.type === 'resize') 
                {
                    isResizingShapeCircle = true;
                    resizingAnchorIndexCircle = anchorInfo.index;
                }
                else if(anchorInfo.type === 'rotate') 
                {
                    isRotatingShapeCircle = true;
                    startRotationMouseAngleCircle = Math.atan2(svgMouseY - currentShape.y, svgMouseX - currentShape.x) * (180 / Math.PI);
                    startShapeRotationCircle = currentShape.rotation;
                }
                clickedOnShape = true;
            }
            else if (currentShape.contains(svgMouseX, svgMouseY)) 
            {
                isDraggingShapeCircle = true;
                dragOldPosCircle = { 
                    x: currentShape.x, 
                    y: currentShape.y, 
                    rx: currentShape.rx, 
                    ry: currentShape.ry, 
                    rotation: currentShape.rotation 
                };
                
                // Store initial frame state
                draggedShapeInitialFrameCircle = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = svgMouseX;
                startY = svgMouseY;
                clickedOnShape = true;
            }
        }
        if (!clickedOnShape) 
        {
            let shapeToSelect = null;
            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                if (shape.shapeName === 'circle' && shape.contains(svgMouseX, svgMouseY)) {
                    shapeToSelect = shape;
                    break; 
                }
            }
            if (currentShape && currentShape !== shapeToSelect) {
                currentShape.removeSelection();
                currentShape = null;
                disableAllSideBars();
            }
            if(shapeToSelect)
            {
                currentShape = shapeToSelect;
                currentShape.isSelected = true;
                currentShape.draw();
                isDraggingShapeCircle = true;
                dragOldPosCircle = { 
                    x: currentShape.x, 
                    y: currentShape.y, 
                    rx: currentShape.rx, 
                    ry: currentShape.ry, 
                    rotation: currentShape.rotation 
                };
                
                // Store initial frame state
                draggedShapeInitialFrameCircle = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = svgMouseX;
                startY = svgMouseY;
                clickedOnShape = true;
            }
        }
        if(!clickedOnShape && currentShape) {
            currentShape.removeSelection();
            currentShape = null;
            disableAllSideBars();
        }
    }
};

const handleMouseMove = (e) => {

    const {x: svgMouseX, y: svgMouseY} = getSVGCoordsFromMouse(e);
    
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };

    if(isDrawingCircle && isCircleToolActive && currentShape)   
    {
        currentShape.x = (startX + svgMouseX) / 2;
        currentShape.y = (startY + svgMouseY) / 2;
        currentShape.rx = Math.abs(svgMouseX - startX) / 2;
        currentShape.ry = Math.abs(svgMouseY - startY) / 2;
        currentShape.scheduleDrawingRender();
        
        // Check for frame containment while drawing (but don't apply clipping yet)
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentShape)) {
                    frame.highlightFrame();
                    hoveredFrameCircle = frame;
                } else if (hoveredFrameCircle === frame) {
                    frame.removeHighlight();
                    hoveredFrameCircle = null;
                }
            }
        });
    }
    else if (isDraggingShapeCircle && currentShape && currentShape.isSelected) {
        const dx = svgMouseX - startX;
        const dy = svgMouseY - startY;
        currentShape.move(dx, dy);
        startX = svgMouseX;
        startY = svgMouseY;

        // Snap guides
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const snap = calculateSnap(currentShape, e.shiftKey, e.clientX, e.clientY);
            if (snap.dx || snap.dy) {
                currentShape.move(snap.dx, snap.dy);
            }
        } else {
            clearSnapGuides();
        }

        // Issue #24 bug #4: track containing frame during drag (see same
        // block in rectangleTool for the rationale).
        let newHover = null;
        for (const f of shapes) {
            if (f.shapeName !== 'frame') continue;
            if (f === currentShape) continue;
            if (typeof f.isShapeInFrame === 'function' && f.isShapeInFrame(currentShape)) {
                newHover = f;
                break;
            }
        }
        if (hoveredFrameCircle && hoveredFrameCircle !== newHover && typeof hoveredFrameCircle.removeHighlight === 'function') {
            hoveredFrameCircle.removeHighlight();
        }
        if (newHover && newHover !== hoveredFrameCircle && typeof newHover.highlightFrame === 'function') {
            newHover.highlightFrame();
        }
        hoveredFrameCircle = newHover;
    }
       
    else if(isResizingShapeCircle && currentShape && currentShape.isSelected)
    {
        currentShape.updatePosition(resizingAnchorIndexCircle, svgMouseX, svgMouseY);
        currentShape._skipAnchors = true;
        currentShape.draw();
        currentShape._skipAnchors = false;
    }
    else if (isRotatingShapeCircle && currentShape && currentShape.isSelected)
    {
        const currentMouseAngle = Math.atan2(svgMouseY - currentShape.y, svgMouseX - currentShape.x) * (180 / Math.PI);
            const angleDiff = currentMouseAngle - startRotationMouseAngleCircle;
            let newRotation = startShapeRotationCircle + angleDiff;
            const snapAngle = 15;
            if (e.shiftKey) {
                newRotation = Math.round(newRotation / snapAngle) * snapAngle;
            }
            currentShape.rotate(newRotation);
            currentShape._skipAnchors = true;
            currentShape.draw();
            currentShape._skipAnchors = false;
            svg.style.cursor = 'grabbing'; 
    }
    else if (isSelectionToolActive && !isDrawingCircle && currentShape && currentShape.isSelected) 
    {
        const anchorInfo = currentShape.isNearAnchor(svgMouseX, svgMouseY);
        if(anchorInfo)
        {
            if(anchorInfo.type === 'resize') {
                const baseDirection = anchorInfo.index; 
                const rotatedCursor = currentShape.getRotatedCursor(baseDirection, currentShape.rotation);
                svg.style.cursor = rotatedCursor + '-resize';
            }
            else if(anchorInfo.type === 'rotate') {
                svg.style.cursor = 'grab';
            }
        }
        else if(currentShape.contains(svgMouseX, svgMouseY)) {
            svg.style.cursor = 'move';
        }
        else 
        {
            svg.style.cursor = 'default';
        }
    }
    else if (isSelectionToolActive && !isDrawingCircle && !isDraggingShapeCircle && !isResizingShapeCircle && !isRotatingShapeCircle) 
    {
        let hoveredShape = null;
        for (let i = shapes.length - 1; i >= 0; i--) {
            const shape = shapes[i];
            if (shape.shapeName === 'circle' && shape.contains(svgMouseX, svgMouseY)) {
                hoveredShape = shape;
                break; 
            }
        }
        if (hoveredShape) {
            svg.style.cursor = 'pointer';
        } else {
            svg.style.cursor = 'default';
        }
    }
}

const handleMouseUp = (e) => {
    if (isDrawingCircle && currentShape) {
        if(currentShape.rx === 0 && currentShape.ry === 0) {
            currentShape.cancelDrawingRender();
            if (currentShape.group.parentNode) {
                currentShape.group.parentNode.removeChild(currentShape.group);
            }
            currentShape = null;
        } else {
            currentShape.finalizeDrawing();
            shapes.push(currentShape);
            pushCreateAction(currentShape);

            // Check for frame containment and track attachment
            const finalFrame = hoveredFrameCircle;
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentShape);
                // Track the attachment for undo
                pushFrameAttachmentAction(finalFrame, currentShape, 'attach', null);
            }

            // Auto-select the drawn shape and switch to selection tool
            const drawnShape = currentShape;
            if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
            currentShape = drawnShape;
            currentShape.isSelected = true;
            if (typeof currentShape.addAnchors === 'function') {
                currentShape.addAnchors();
            }
        }
        
        // Clear frame highlighting
        if (hoveredFrameCircle) {
            hoveredFrameCircle.removeHighlight();
            hoveredFrameCircle = null;
        }
    }
    
    if((isDraggingShapeCircle || isResizingShapeCircle || isRotatingShapeCircle) && dragOldPosCircle && currentShape) {
        // Issue #34 bug #2: see rectangleTool — record the hovered frame
        // as the destination, not the stale `parentFrame` (containment
        // transfer happens later in this handler).
        const newPos = {
            x: currentShape.x,
            y: currentShape.y,
            rx: currentShape.rx,
            ry: currentShape.ry,
            rotation: currentShape.rotation,
            parentFrame: isDraggingShapeCircle ? (hoveredFrameCircle || null) : currentShape.parentFrame,
        };
        const oldPos = {
            ...dragOldPosCircle,
            parentFrame: draggedShapeInitialFrameCircle
        };
        
        const stateChanged = oldPos.x !== newPos.x || oldPos.y !== newPos.y ||
                              oldPos.rx !== newPos.rx || oldPos.ry !== newPos.ry || 
                              oldPos.rotation !== newPos.rotation;

        const frameChanged = oldPos.parentFrame !== newPos.parentFrame;

        if (stateChanged || frameChanged) {
            const oldPosForUndo = {
                x: oldPos.x,
                y: oldPos.y,
                rx: oldPos.rx,
                ry: oldPos.ry,
                rotation: oldPos.rotation,
                parentFrame: oldPos.parentFrame
            };
            const newPosForUndo = {
                x: newPos.x,
                y: newPos.y,
                rx: newPos.rx,
                ry: newPos.ry,
                rotation: newPos.rotation,
                parentFrame: newPos.parentFrame
            };
            pushTransformAction(currentShape, oldPosForUndo, newPosForUndo);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingShapeCircle) {
            const finalFrame = hoveredFrameCircle;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameCircle !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameCircle) {
                    draggedShapeInitialFrameCircle.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameCircle, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameCircle);
                }
            } else if (draggedShapeInitialFrameCircle) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameCircle.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosCircle = null;
        draggedShapeInitialFrameCircle = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrameCircle) {
        hoveredFrameCircle.removeHighlight();
        hoveredFrameCircle = null;
    }

    clearSnapGuides();
    isDrawingCircle = false;
    isDraggingShapeCircle = false;
    isResizingShapeCircle = false;
    isRotatingShapeCircle = false;
    resizingAnchorIndexCircle = null;
    startRotationMouseAngleCircle = null;
    startShapeRotationCircle = 0;
    svg.style.cursor = 'default';
}


colorOptionsCircle.forEach(span => {
    span.addEventListener('click', function(event) {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
            const color = this.getAttribute('data-id');
            const oldOptions = {...currentShape.options};
            currentShape.options.stroke = color;
            currentShape.draw();
            currentShape.updateSidebar();
            pushOptionsChangeAction(currentShape, oldOptions);
        }
        else 
        {
            circleStrokecolor = this.getAttribute('data-id');
        }
        colorOptionsCircle.forEach(span => {
            span.classList.remove('selected');
        });
        this.classList.add('selected');
    });
});
backgroundColorOptionsCircle.forEach(span => {
    span.addEventListener('click', function(event) {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
            const color = this.getAttribute('data-id');
            const oldOptions = {...currentShape.options};
            currentShape.options.fill = color;
            currentShape.draw();
            currentShape.updateSidebar();
            pushOptionsChangeAction(currentShape, oldOptions);
        }
        else 
        {
            circleBackgroundColor = this.getAttribute('data-id');
        }
        backgroundColorOptionsCircle.forEach(span => {
            span.classList.remove('selected');
        });
        this.classList.add('selected');
    });
});
fillStyleOptionsCircle.forEach(span => {
    span.addEventListener('click', function(event) {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
            const style = this.getAttribute('data-id');
            const oldOptions = {...currentShape.options};
            currentShape.options.fillStyle = style;
            currentShape.draw();
            currentShape.updateSidebar();
            pushOptionsChangeAction(currentShape, oldOptions);
        }
        else 
        {
            circleFillStyleValue = this.getAttribute('data-id');
        }
        fillStyleOptionsCircle.forEach(span => {
            span.classList.remove('selected');
        });
        this.classList.add('selected');
    });
});
strokeThicknessValueCircle.forEach(span => {
    span.addEventListener('click', function(event) {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
            const thick = parseInt(this.getAttribute('data-id'), 10);
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeWidth = thick;
            currentShape.draw();
            currentShape.updateSidebar();
            pushOptionsChangeAction(currentShape, oldOptions);
        }
        else 
        {
            circleStrokeThicknes = parseInt(this.getAttribute('data-id'), 10);
        }
        strokeThicknessValueCircle.forEach(span => {
            span.classList.remove('selected');
        });
        this.classList.add('selected');
    });
});
outlineStyleValueCircle.forEach(span => {
    span.addEventListener('click', function(event) {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
            const style = this.getAttribute('data-id');
            const oldOptions = {...currentShape.options};
            if (style === "dashed") {
                currentShape.options.strokeDasharray = "5,5";
            } else if (style === "dotted") {
                currentShape.options.strokeDasharray = "2,8";
            } else {
                currentShape.options.strokeDasharray = "";
            }
            currentShape.draw();
            currentShape.updateSidebar();
            pushOptionsChangeAction(currentShape, oldOptions);
        }
        else 
        {
            circleOutlineStyle = this.getAttribute('data-id');
        }
        outlineStyleValueCircle.forEach(span => {
            span.classList.remove('selected');
        });
        this.classList.add('selected');
    });
});

window.Circle = Circle;

// Bridge circle tool settings to React sidebar
window.circleToolSettings = {
    get strokeColor() { return circleStrokecolor; },
    set strokeColor(v) { circleStrokecolor = v; },
    get bgColor() { return circleBackgroundColor; },
    set bgColor(v) { circleBackgroundColor = v; },
    get fillStyle() { return circleFillStyleValue; },
    set fillStyle(v) { circleFillStyleValue = v; },
    get strokeWidth() { return circleStrokeThicknes; },
    set strokeWidth(v) { circleStrokeThicknes = v; },
    get outlineStyle() { return circleOutlineStyle; },
    set outlineStyle(v) { circleOutlineStyle = v; },
};
window.updateSelectedCircleStyle = function(changes) {
    if (currentShape && currentShape.shapeName === 'circle' && currentShape.isSelected) {
        pushOptionsChangeAction(currentShape, { ...currentShape.options });
        if (changes.stroke !== undefined) { circleStrokecolor = changes.stroke; currentShape.options.stroke = changes.stroke; }
        if (changes.fill !== undefined) { circleBackgroundColor = changes.fill; currentShape.options.fill = changes.fill; }
        if (changes.fillStyle !== undefined) { circleFillStyleValue = changes.fillStyle; currentShape.options.fillStyle = changes.fillStyle; }
        if (changes.strokeWidth !== undefined) { circleStrokeThicknes = changes.strokeWidth; currentShape.options.strokeWidth = changes.strokeWidth; }
        if (changes.outlineStyle !== undefined) {
            circleOutlineStyle = changes.outlineStyle;
            if (changes.outlineStyle === "dashed") currentShape.options.strokeDasharray = "5,5";
            else if (changes.outlineStyle === "dotted") currentShape.options.strokeDasharray = "2,8";
            else currentShape.options.strokeDasharray = "";
        }
        currentShape.draw();
    } else {
        if (changes.stroke !== undefined) circleStrokecolor = changes.stroke;
        if (changes.fill !== undefined) circleBackgroundColor = changes.fill;
        if (changes.fillStyle !== undefined) circleFillStyleValue = changes.fillStyle;
        if (changes.strokeWidth !== undefined) circleStrokeThicknes = changes.strokeWidth;
        if (changes.outlineStyle !== undefined) circleOutlineStyle = changes.outlineStyle;
    }
};

export {
    handleMouseDown as handleMouseDownCircle,
    handleMouseMove as handleMouseMoveCircle,
    handleMouseUp as handleMouseUpCircle,
}
