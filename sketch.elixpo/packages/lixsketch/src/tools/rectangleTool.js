/* eslint-disable */
// Rectangle tool event handlers - extracted from drawSquare.js
// Depends on globals: svg, shapes, currentShape, rough, currentZoom, lastMousePos
// Depends on globals: isSquareToolActive, isSelectionToolActive
// Depends on globals: squareSideBar, disableAllSideBars
import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { cleanupAttachments } from './arrowTool.js';
import { calculateSnap, clearSnapGuides } from '../core/SnapGuides.js';

let isDrawingSquare = false;
let isDraggingShapeSquare = false;
let isResizingShapeSquare = false;
let isRotatingShapeSquare = false;
let resizingAnchorIndexSquare = null;
let startRotationMouseAngleSquare = 0;
let startShapeRotationSquare = 0;
const rc = rough.svg(svg); 
let startX, startY;
// Issue #38 follow-up: null sentinel means "use theme default at draw
// time". The legacy `"#fff"` literal was invisible on the light canvas;
// reading the body's `theme-dark` class lets the same code produce a
// readable stroke in either mode. As soon as the user picks a colour
// from the sidebar this var holds that value verbatim.
function getThemeStroke() {
    if (typeof document === 'undefined') return '#fff';
    return document.body && document.body.classList.contains('theme-dark') ? '#fff' : '#000000';
}
let squareStrokecolor = null;
let squareBackgroundColor = "transparent";
let squareFillStyleValue = "none";
let squareStrokeThicknes = 2;
let squareOutlineStyle = "solid";
let dragOldPosSquare = null;
let draggedShapeInitialFrame = null;
let hoveredFrame = null;

let SquarecolorOptions = document.querySelectorAll(".squareStrokeSpan");
let backgroundColorOptionsSquare = document.querySelectorAll(".squareBackgroundSpan");
let fillStyleOptions = document.querySelectorAll(".squareFillStyleSpan");
let squareStrokeThicknessValue = document.querySelectorAll(".squareStrokeThickSpan");
let squareOutlineStyleValue = document.querySelectorAll(".squareOutlineStyle");



function getSVGCoordsFromMouse(e) {
    // Use the SVG's current viewBox to map mouse to SVG coordinates
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'rectangle') {
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

// --- Main event handlers ---
const handleMouseDownRect = (e) => {
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
    if (isSquareToolActive) {
        startX = mouseX;
        startY = mouseY;
        isDrawingSquare = true;

        if (currentShape) {
            currentShape.removeSelection();
            currentShape = null;
            disableAllSideBars();
        }

        let initialOptions = {
            stroke: squareStrokecolor ?? getThemeStroke(),
            fill: squareBackgroundColor,
            fillStyle: squareFillStyleValue,
            strokeWidth: squareStrokeThicknes,
        };
        if (squareOutlineStyle === "dashed") {
            initialOptions.strokeDasharray = "10,10";
        } else if (squareOutlineStyle === "dotted") {
            initialOptions.strokeDasharray = "2,8";
        } else {
            initialOptions.strokeDasharray = "";
        }

        currentShape = new Rectangle(startX, startY, 0, 0, initialOptions);
        currentShape.setDrawingState(true);

    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(mouseX, mouseY);
            if (anchorInfo) {
                 dragOldPosSquare = { x: currentShape.x, y: currentShape.y, width: currentShape.width, height: currentShape.height, rotation: currentShape.rotation };
                if (anchorInfo.type === 'resize') {
                    isResizingShapeSquare = true;
                    resizingAnchorIndexSquare = anchorInfo.index;
                } else if (anchorInfo.type === 'rotate') {
                    isRotatingShapeSquare = true;

                    const centerX = currentShape.x + currentShape.width / 2;
                    const centerY = currentShape.y + currentShape.height / 2;
                    startRotationMouseAngleSquare = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
                    startShapeRotationSquare = currentShape.rotation;
                }
                clickedOnShape = true;
            } else if (currentShape.contains(mouseX, mouseY)) {
                 isDraggingShapeSquare = true;
                 dragOldPosSquare = { x: currentShape.x, y: currentShape.y, width: currentShape.width, height: currentShape.height, rotation: currentShape.rotation };
                 
                 // Store initial frame state
                 draggedShapeInitialFrame = currentShape.parentFrame || null;
                 
                 // Temporarily remove from frame clipping if dragging
                 if (currentShape.parentFrame) {
                     currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                 }
                 
                 startX = mouseX; 
                 startY = mouseY;
                 clickedOnShape = true;
             }
        }

        if (!clickedOnShape) {
            let shapeToSelect = null;
            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                if (shape.shapeName === 'rectangle' && shape.contains(mouseX, mouseY)) {
                    shapeToSelect = shape;
                    break; 
                }
            }
            if (currentShape && currentShape !== shapeToSelect) {
                 currentShape.removeSelection();
                 currentShape = null;
                 disableAllSideBars();
            }
            if (shapeToSelect) {
                currentShape = shapeToSelect;
                currentShape.isSelected = true;
                currentShape.draw(); 
                isDraggingShapeSquare = true; 
                dragOldPosSquare = { x: currentShape.x, y: currentShape.y, width: currentShape.width, height: currentShape.height, rotation: currentShape.rotation };
                
                // Store initial frame state
                draggedShapeInitialFrame = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = mouseX; 
                startY = mouseY;
                clickedOnShape = true; 
            }
        }
        if (!clickedOnShape && currentShape) {
             currentShape.removeSelection();
             currentShape = null;
             disableAllSideBars();
        }
    }
};


const handleMouseMoveRect = (e) => {
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };

    if (isDrawingSquare && isSquareToolActive && currentShape) {
        let width = mouseX - startX;
        let height = mouseY - startY;
        currentShape.x = width < 0 ? startX + width : startX;
        currentShape.y = height < 0 ? startY + height : startY;
        currentShape.width = Math.abs(width);
        currentShape.height = Math.abs(height);
        
        // Force update the element size while drawing (but use cached rough element)
        if (currentShape.element && currentShape.width > 0 && currentShape.height > 0) {
            // Remove old element
            if (currentShape.element.parentNode === currentShape.group) {
                currentShape.group.removeChild(currentShape.element);
            }
            
            // Create new rough element with current size
            const roughRect = rc.rectangle(0, 0, currentShape.width, currentShape.height, currentShape.options);
            currentShape.element = roughRect;
            currentShape.group.appendChild(roughRect);
        }
        
        // Update transform
        const rotateCenterX = currentShape.width / 2;
        const rotateCenterY = currentShape.height / 2;
        currentShape.group.setAttribute('transform', `translate(${currentShape.x}, ${currentShape.y}) rotate(${currentShape.rotation}, ${rotateCenterX}, ${rotateCenterY})`);
        
        // Check for frame containment while drawing
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentShape)) {
                    frame.highlightFrame();
                    hoveredFrame = frame;
                } else if (hoveredFrame === frame) {
                    frame.removeHighlight();
                    hoveredFrame = null;
                }
            }
        });
        
    } else if (isDraggingShapeSquare && currentShape && currentShape.isSelected) {
        let dx = mouseX - startX;
        let dy = mouseY - startY;
        currentShape.move(dx, dy);
        startX = mouseX;
        startY = mouseY;
        // Snap guides
        if (window.__sketchStoreApi && window.__sketchStoreApi.getState().snapToObjects) {
            const snap = calculateSnap(currentShape, e.shiftKey, e.clientX, e.clientY);
            if (snap.dx || snap.dy) {
                currentShape.move(snap.dx, snap.dy);
            }
        } else {
            clearSnapGuides();
        }

        // Issue #24 bug #4: track the actual containing frame at every
        // move so the mouseUp logic re-parents correctly. Without this
        // hoveredFrame stays at null for existing-shape drags and the
        // shape is detached the moment the user nudges it by 1 px inside
        // its own parent frame.
        let newHover = null;
        for (const f of shapes) {
            if (f.shapeName !== 'frame') continue;
            if (f === currentShape) continue;
            if (typeof f.isShapeInFrame === 'function' && f.isShapeInFrame(currentShape)) {
                newHover = f;
                break;
            }
        }
        if (hoveredFrame && hoveredFrame !== newHover && typeof hoveredFrame.removeHighlight === 'function') {
            hoveredFrame.removeHighlight();
        }
        if (newHover && newHover !== hoveredFrame && typeof newHover.highlightFrame === 'function') {
            newHover.highlightFrame();
        }
        hoveredFrame = newHover;
    } else if (isResizingShapeSquare && currentShape && currentShape.isSelected && resizingAnchorIndexSquare !== null) {
        currentShape.updatePosition(resizingAnchorIndexSquare, mouseX, mouseY);
        currentShape._skipAnchors = true;
        currentShape.draw();
        currentShape._skipAnchors = false;
    } else if (isRotatingShapeSquare && currentShape && currentShape.isSelected) {
        const centerX = currentShape.x + currentShape.width / 2;
        const centerY = currentShape.y + currentShape.height / 2;
        const currentRotationMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
            const angleDiff = currentRotationMouseAngle - startRotationMouseAngleSquare;
            let newRotation = startShapeRotationSquare + angleDiff;
             const snapAngle = 15;
             if (e.shiftKey) {
                  newRotation = Math.round(newRotation / snapAngle) * snapAngle;
             }
            currentShape.rotate(newRotation);
            currentShape._skipAnchors = true;
            currentShape.draw();
            currentShape._skipAnchors = false;
            svg.style.cursor = 'grabbing'; 
    } else if (isSelectionToolActive && !isDrawingSquare && currentShape && currentShape.isSelected) {
          const anchorInfo = currentShape.isNearAnchor(mouseX, mouseY);
           if (anchorInfo) {
               if (anchorInfo.type === 'resize') {
                   const baseDirection = anchorInfo.index; 
                   const rotatedCursor = currentShape.getRotatedCursor(baseDirection, currentShape.rotation);
                   svg.style.cursor = rotatedCursor + '-resize';
               } else if (anchorInfo.type === 'rotate') {
                    svg.style.cursor = 'grab';
               }
           } else if (currentShape.contains(mouseX, mouseY)) {
               svg.style.cursor = 'move';
           } else {
                svg.style.cursor = 'default';
           }
     } else if (isSelectionToolActive && !isDrawingSquare && !isDraggingShapeSquare && !isResizingShapeSquare && !isRotatingShapeSquare) {
         let hoveredShape = null;
         for (let i = shapes.length - 1; i >= 0; i--) {
             const shape = shapes[i];
             if (shape.shapeName === 'rectangle' && shape.contains(mouseX, mouseY)) {
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
};

    
const handleMouseUpRect = (e) => {
    if (isDrawingSquare && currentShape) {
        currentShape.setDrawingState(false);
        if (currentShape.width === 0 || currentShape.height === 0) {
            if (currentShape.group.parentNode) {
                currentShape.group.parentNode.removeChild(currentShape.group);
            }
            currentShape = null;
        } else {
            currentShape.draw();
            shapes.push(currentShape);
            pushCreateAction(currentShape);

            // Check for frame containment and track attachment
            const finalFrame = hoveredFrame;
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
        if (hoveredFrame) {
            hoveredFrame.removeHighlight();
            hoveredFrame = null;
        }
    }

    if ((isDraggingShapeSquare || isResizingShapeSquare || isRotatingShapeSquare) && dragOldPosSquare && currentShape) {
        // Issue #34 bug #2: for drag operations the actual frame transfer
        // happens AFTER this mouseUp block — so `currentShape.parentFrame`
        // at this point still points at the OLD frame. Use the hovered
        // frame (tracked during mousemove) as the authoritative new
        // destination instead, so the undo action records a real
        // attachment delta and Ctrl+Z re-attaches the shape correctly.
        const newPos = {
            x: currentShape.x,
            y: currentShape.y,
            width: currentShape.width,
            height: currentShape.height,
            rotation: currentShape.rotation,
            parentFrame: isDraggingShapeSquare ? (hoveredFrame || null) : currentShape.parentFrame,
        };
        const oldPos = {
            ...dragOldPosSquare,
            parentFrame: draggedShapeInitialFrame
        };
        
        const stateChanged = oldPos.x !== newPos.x || oldPos.y !== newPos.y ||
                             oldPos.width !== newPos.width || oldPos.height !== newPos.height ||
                             oldPos.rotation !== newPos.rotation;

        const frameChanged = oldPos.parentFrame !== newPos.parentFrame;

        if (stateChanged || frameChanged) {
             pushTransformAction(currentShape, oldPos, newPos);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingShapeSquare) {
            const finalFrame = hoveredFrame;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrame !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrame) {
                    draggedShapeInitialFrame.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrame, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrame);
                }
            } else if (draggedShapeInitialFrame) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrame.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosSquare = null;
        draggedShapeInitialFrame = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrame) {
        hoveredFrame.removeHighlight();
        hoveredFrame = null;
    }

    isDrawingSquare = false;
    isDraggingShapeSquare = false;
    isResizingShapeSquare = false;
    isRotatingShapeSquare = false;
    resizingAnchorIndexSquare = null;
    startRotationMouseAngleSquare = 0;
    startShapeRotationSquare = 0;
    clearSnapGuides();
    svg.style.cursor = 'default';
};

SquarecolorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            pushOptionsChangeAction(currentShape, { ...currentShape.options }); 
            squareStrokecolor = span.getAttribute("data-id"); 
            currentShape.options.stroke = squareStrokecolor; 
            currentShape.draw();
            currentShape.updateSidebar(); 
        } else {
             squareStrokecolor = span.getAttribute("data-id");
        }
         SquarecolorOptions.forEach((el) => el.classList.remove("selected"));
         span.classList.add("selected"); 
    });
});

backgroundColorOptionsSquare.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            pushOptionsChangeAction(currentShape, { ...currentShape.options });
            squareBackgroundColor = span.getAttribute("data-id");
            currentShape.options.fill = squareBackgroundColor;
            currentShape.draw();
            currentShape.updateSidebar();
        } else {
            squareBackgroundColor = span.getAttribute("data-id");
        }
        backgroundColorOptionsSquare.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
    });
});

fillStyleOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation()
         if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            pushOptionsChangeAction(currentShape, { ...currentShape.options });
            squareFillStyleValue = span.getAttribute("data-id");
            currentShape.options.fillStyle = squareFillStyleValue;
            currentShape.draw();
            currentShape.updateSidebar();
        } else {
            squareFillStyleValue = span.getAttribute("data-id");
        }
        fillStyleOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
    });
});

squareStrokeThicknessValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation()
        if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            pushOptionsChangeAction(currentShape, { ...currentShape.options });
            squareStrokeThicknes = parseInt(span.getAttribute("data-id"));
            currentShape.options.strokeWidth = squareStrokeThicknes;
            currentShape.draw();
            currentShape.updateSidebar();
        } else {
            squareStrokeThicknes = parseInt(span.getAttribute("data-id"));
        }
        squareStrokeThicknessValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
    });
});

squareOutlineStyleValue.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
            pushOptionsChangeAction(currentShape, { ...currentShape.options });
            squareOutlineStyle = span.getAttribute("data-id");
            if (squareOutlineStyle === "dashed") {
                currentShape.options.strokeDasharray = "10,10";
            } else if (squareOutlineStyle === "dotted") {
                currentShape.options.strokeDasharray = "2,8";
            } else {
                currentShape.options.strokeDasharray = "";
            }
            currentShape.draw();
            currentShape.updateSidebar();
        } else {
            squareOutlineStyle = span.getAttribute("data-id");
        }
        squareOutlineStyleValue.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
    });
});

window.Rectangle = Rectangle;

// Bridge rectangle tool settings to React sidebar
window.rectToolSettings = {
    get strokeColor() { return squareStrokecolor; },
    set strokeColor(v) { squareStrokecolor = v; },
    get bgColor() { return squareBackgroundColor; },
    set bgColor(v) { squareBackgroundColor = v; },
    get fillStyle() { return squareFillStyleValue; },
    set fillStyle(v) { squareFillStyleValue = v; },
    get strokeWidth() { return squareStrokeThicknes; },
    set strokeWidth(v) { squareStrokeThicknes = v; },
    get outlineStyle() { return squareOutlineStyle; },
    set outlineStyle(v) { squareOutlineStyle = v; },
};
window.updateSelectedRectStyle = function(changes) {
    if (currentShape && currentShape.shapeName === 'rectangle' && currentShape.isSelected) {
        pushOptionsChangeAction(currentShape, { ...currentShape.options });
        if (changes.stroke !== undefined) { squareStrokecolor = changes.stroke; currentShape.options.stroke = changes.stroke; }
        if (changes.fill !== undefined) { squareBackgroundColor = changes.fill; currentShape.options.fill = changes.fill; }
        if (changes.fillStyle !== undefined) { squareFillStyleValue = changes.fillStyle; currentShape.options.fillStyle = changes.fillStyle; }
        if (changes.strokeWidth !== undefined) { squareStrokeThicknes = changes.strokeWidth; currentShape.options.strokeWidth = changes.strokeWidth; }
        if (changes.outlineStyle !== undefined) {
            squareOutlineStyle = changes.outlineStyle;
            if (changes.outlineStyle === "dashed") currentShape.options.strokeDasharray = "10,10";
            else if (changes.outlineStyle === "dotted") currentShape.options.strokeDasharray = "2,8";
            else currentShape.options.strokeDasharray = "";
        }
        currentShape.draw();
    } else {
        if (changes.stroke !== undefined) squareStrokecolor = changes.stroke;
        if (changes.fill !== undefined) squareBackgroundColor = changes.fill;
        if (changes.fillStyle !== undefined) squareFillStyleValue = changes.fillStyle;
        if (changes.strokeWidth !== undefined) squareStrokeThicknes = changes.strokeWidth;
        if (changes.outlineStyle !== undefined) squareOutlineStyle = changes.outlineStyle;
    }
};

export { handleMouseDownRect, handleMouseMoveRect, handleMouseUpRect };
