/* eslint-disable */
// Frame tool event handlers - extracted from frameHolder.js
import { captureFrameChildStates, pushCreateAction, pushDeleteAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { updateAttachedArrows, cleanupAttachments } from './arrowTool.js';

let currentFrame = null;
let isResizing = false;
let isDragging = false;
let activeAnchor = null;
let isDrawingFrame = false;
let frameStrokeColor = "#888";
let frameStrokeThickness = 2;
let frameFillColor = "transparent";
let frameOpacity = 1;
let startX, startY;
let dragOldPosFrame = null;

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}


// Event handlers for frame tool
const handleMouseDown = (e) => {
    if (!isFrameToolActive && !isSelectionToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);

    if (isFrameToolActive) {
        isDrawingFrame = true;
        startX = x;
        startY = y;
        currentFrame = new Frame(x, y, 0, 0, {
            stroke: frameStrokeColor,
            strokeWidth: frameStrokeThickness,
            fill: frameFillColor,
            opacity: frameOpacity
        });
        shapes.push(currentFrame);
        currentShape = currentFrame;
    } else if (isSelectionToolActive) {
        // Handle frame selection — but first check if a contained shape was clicked
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].shapeName === 'frame' && shapes[i].contains(x, y)) {
                const clickedFrame = shapes[i];

                // Check if click is on a shape inside this frame — let shape handlers deal with it
                let clickedContainedShape = false;
                if (clickedFrame.containedShapes && clickedFrame.containedShapes.length > 0) {
                    for (let j = clickedFrame.containedShapes.length - 1; j >= 0; j--) {
                        const inner = clickedFrame.containedShapes[j];
                        if (inner.contains && inner.contains(x, y)) {
                            clickedContainedShape = true;
                            break;
                        }
                    }
                }
                // If a contained shape was clicked, don't select the frame —
                // and crucially, clear `currentShape` so the EventDispatcher's
                // `if (handled && prevShape && !currentShape) handled=false` gate
                // triggers and the dispatcher falls through to shape-specific
                // handlers. Without this clear, the dispatcher returns with
                // `handled=true` and the child shape is never selected (Issue
                // #22, bug #2).
                if (clickedContainedShape) {
                    if (currentShape && currentShape.shapeName === 'frame'
                        && typeof currentShape.removeSelection === 'function') {
                        currentShape.removeSelection();
                    }
                    currentShape = null;
                    return;
                }

                if (currentShape && currentShape !== clickedFrame) {
                    currentShape.removeSelection();
                }
                currentShape = clickedFrame;
                currentShape.selectFrame();

                // Check for anchor interaction
                const anchorIndex = typeof currentShape.isNearAnchor === 'function' ? currentShape.isNearAnchor(x, y) : null;
                if (anchorIndex !== null) {
                    activeAnchor = anchorIndex;
                    isResizing = true;
                } else {
                    isDragging = true;
                    startX = x;
                    startY = y;
                    dragOldPosFrame = {
                        x: currentShape.x,
                        y: currentShape.y,
                        width: currentShape.width,
                        height: currentShape.height,
                        rotation: currentShape.rotation,
                        containedShapes: captureFrameChildStates(currentShape),
                    };
                }
                return;
            }
        }

        // If no frame was clicked, deselect current
        if (currentShape && currentShape.shapeName === 'frame') {
            currentShape.removeSelection();
            currentShape = null;
        }
    }
};

    const handleMouseMove = (e) => {
    const { x, y } = getSVGCoordsFromMouse(e);

    if (isDrawingFrame && currentFrame) {
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        currentFrame.x = Math.min(startX, x);
        currentFrame.y = Math.min(startY, y);
        currentFrame.width = width;
        currentFrame.height = height;
        currentFrame.draw();
    } else if (isDragging && currentShape && currentShape.shapeName === 'frame') {
        const dx = x - startX;
        const dy = y - startY;
        
        // Use the frame's move method which properly handles contained shapes
        currentShape.move(dx, dy);
        
        startX = x;
        startY = y;
    }
};

    const handleMouseUp = (e) => {
    if (isDrawingFrame && currentFrame) {
        // Check if frame is too small
        if (currentFrame.width < 10 || currentFrame.height < 10) {
            currentFrame.destroy();
            currentFrame = null;
            currentShape = null;
        } else {
            // Check for shapes that should be contained in the new frame
            currentFrame.updateContainedShapes(true); // Apply clipping immediately for new frames
            pushCreateAction(currentFrame, {
                frameCreation: true,
                containedShapes: [...currentFrame.containedShapes]
            });

            // Auto-select the new frame and switch to selection tool
            const placedFrame = currentFrame;
            if (window.__sketchStoreApi) {
                window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
            } else {
                window.isSelectionToolActive = true;
            }
            currentShape = placedFrame;
            placedFrame.selectFrame();
        }
        isDrawingFrame = false;
    }

    if (isDragging && dragOldPosFrame && currentShape) {
        const newPos = {
            x: currentShape.x,
            y: currentShape.y,
            width: currentShape.width,
            height: currentShape.height,
            rotation: currentShape.rotation
        };
        pushTransformAction(currentShape, dragOldPosFrame, newPos);
        dragOldPosFrame = null;
        
        // Update frame containment after moving frame (but don't re-move contained shapes)
        if (currentShape.shapeName === 'frame') {
            currentShape.updateClipPath();
        }
    }

    // Only check frame containment for shapes that aren't already in frames.
    // Record this fallback attachment too; individual shape tools normally do
    // it themselves, but restored/imported shapes can reach this path.
    if (!isDragging) {
        shapes.forEach(shape => {
            if (shape.shapeName !== 'frame' && !shape.parentFrame) {
                let targetFrame = null;
                for (let i = shapes.length - 1; i >= 0; i--) {
                    const frame = shapes[i];
                    if (frame.shapeName === 'frame' && frame.isShapeInFrame(shape)) {
                        targetFrame = frame;
                        break;
                    }
                }
                if (targetFrame) {
                    targetFrame.addShapeToFrame(shape);
                    pushFrameAttachmentAction(targetFrame, shape, 'attach', null);
                }
            }
        });
    }

    isDrawingFrame = false;
    isDragging = false;
    isResizing = false;
    activeAnchor = null;
    svg.style.cursor = 'default';
};

Frame.prototype.isNearAnchor = function(x, y) {
    const anchorSize = 10 / currentZoom;
    
    // Define anchor positions
    const anchorPositions = [
        { x: this.x, y: this.y },
        { x: this.x + this.width / 2, y: this.y },
        { x: this.x + this.width, y: this.y },
        { x: this.x + this.width, y: this.y + this.height / 2 },
        { x: this.x + this.width, y: this.y + this.height },
        { x: this.x + this.width / 2, y: this.y + this.height },
        { x: this.x, y: this.y + this.height },
        { x: this.x, y: this.y + this.height / 2 },
        { x: this.x + this.width / 2, y: this.y - 30 / currentZoom } // Rotation handle
    ];

    for (let i = 0; i < anchorPositions.length; i++) {
        const pos = anchorPositions[i];
        const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (distance <= anchorSize) {
            return i;
        }
    }
    return null;
};

// Delete functionality
function deleteCurrentFrame() {
    if (currentShape && currentShape.shapeName === 'frame') {
        const frame = currentShape;
        const isDiagramFrame = !!frame._diagramType;

        // Issue #24 bug #7: regular frame → orphan children + snapshot
        // (mirrors deleteSelectedShapes / EngineShortcuts).
        let childSnapshot = null;
        if (!isDiagramFrame) {
            childSnapshot = [...(frame.containedShapes || [])];
            for (const child of childSnapshot) {
                if (!child || child === frame) continue;
                const el = child.group || child.element;
                if (el) {
                    if (frame.clipGroup && el.parentNode === frame.clipGroup) frame.clipGroup.removeChild(el);
                    if (window.svg && el.parentNode !== window.svg) window.svg.appendChild(el);
                }
                child.parentFrame = null;
                delete child.isBeingMovedByFrame;
            }
            frame.containedShapes = [];
        }

        const idx = shapes.indexOf(frame);
        if (idx !== -1) shapes.splice(idx, 1);

        if (!isDiagramFrame) {
            if (frame.group && frame.group.parentNode) frame.group.parentNode.removeChild(frame.group);
            if (frame.clipGroup && frame.clipGroup.parentNode) frame.clipGroup.parentNode.removeChild(frame.clipGroup);
            if (frame.clipPath && frame.clipPath.parentNode) frame.clipPath.parentNode.removeChild(frame.clipPath);
        } else if (frame.group && frame.group.parentNode) {
            frame.group.parentNode.removeChild(frame.group);
        }

        if (childSnapshot) pushDeleteAction(frame, { childSnapshot });
        else pushDeleteAction(frame);
        currentShape = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'frame') {
        deleteCurrentFrame();
    }
});

window.Frame = Frame;

export {
    handleMouseDown as handleMouseDownFrame,
    handleMouseMove as handleMouseMoveFrame,
    handleMouseUp as handleMouseUpFrame
};
