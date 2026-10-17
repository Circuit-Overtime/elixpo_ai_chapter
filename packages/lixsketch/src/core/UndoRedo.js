/* eslint-disable */
// Undo/Redo system - copied from undoAndRedo.js

// Stacks for undo/redo
const undoStack = [];
const redoStack = [];

export function beginUndoBatch() {
    return { startIndex: undoStack.length };
}

export function endUndoBatch(batch, label = 'batch') {
    if (!batch || !Number.isInteger(batch.startIndex)) return;
    const startIndex = Math.min(Math.max(batch.startIndex, 0), undoStack.length);
    let actions = undoStack.splice(startIndex);
    if (actions.length === 0) return;
    const groupedAction = actions.length === 1 ? actions[0] : { type: 'batch', label, actions };
    undoStack.push(groupedAction);
    redoStack.length = 0;
    notifyCollaboration();
    return groupedAction;
}

// Import references to text-related variables and functions
let selectedElement = null;
let updateSelectionFeedback = null;
let svg = null;

function notifyCollaboration() {
    if (typeof window !== 'undefined' && typeof window.__collabSceneChanged === 'function') {
        window.__collabSceneChanged();
    }
}

// Function to set references from other modules
export function setTextReferences(element, updateFn, svgElement) {
    selectedElement = element;
    updateSelectionFeedback = updateFn;
    svg = svgElement;
}

// Function to get current selectedElement (called from other modules)
export function getCurrentSelectedElement() {
    return selectedElement;
}

// Function to update selectedElement reference (called from other modules)
export function updateSelectedElement(element) {
    selectedElement = element;
}

// Call this after creating a new shape (e.g., Rectangle)
export function pushCreateAction(shape, meta = null) {
    const action = {
        type: 'create',
        shape: shape
    };
    const parentFrame = meta?.parentFrame || shape?.parentFrame || null;
    if (parentFrame) {
        action.parentFrame = parentFrame;
        const frameIndex = Number.isInteger(meta?.frameIndex)
            ? meta.frameIndex
            : parentFrame.containedShapes?.indexOf(shape);
        if (Number.isInteger(frameIndex) && frameIndex >= 0) action.frameIndex = frameIndex;
    }
    if (meta?.frameCreation && shape?.shapeName === 'frame') {
        action.frameCreation = true;
        action.containedShapes = [...(meta.containedShapes || shape.containedShapes || [])];
        action.shapeIndex = Array.isArray(shapes) ? shapes.indexOf(shape) : -1;
    }
    undoStack.push(action);
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

export function pushDeleteAction(shape, meta = null) {
    // Issue #24 bug #7: when the deleted shape is a frame, the caller may
    // pass `meta.childSnapshot` — the contained shape REFERENCES at the
    // time of delete. The undo branch uses this to re-attach the children
    // when the frame is restored, instead of leaving an empty box.
    const action = { type: 'delete', shape };
    if (meta && meta.childSnapshot) action.childSnapshot = meta.childSnapshot;
    if (Number.isInteger(meta?.shapeIndex)) action.shapeIndex = meta.shapeIndex;
    if (meta?.parentFrame) action.parentFrame = meta.parentFrame;
    if (Number.isInteger(meta?.frameIndex)) action.frameIndex = meta.frameIndex;
    undoStack.push(action);

    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

export function pushCanvasResetAction(snapshot, restore, reset) {
    if (!snapshot || typeof restore !== 'function' || typeof reset !== 'function') return;
    // A reset is a new history boundary. Older per-shape actions reference
    // objects that the scene loader will replace, so only the atomic reset
    // snapshot remains undoable.
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push({ type: 'canvasReset', snapshot, restore, reset });
}

export function invalidateCanvasResetUndo() {
    for (let index = undoStack.length - 1; index >= 0; index -= 1) {
        if (undoStack[index]?.type === 'canvasReset') undoStack.splice(index, 1);
    }
    for (let index = redoStack.length - 1; index >= 0; index -= 1) {
        if (redoStack[index]?.type === 'canvasReset') redoStack.splice(index, 1);
    }
}

export function clearUndoHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
}

// Collaboration scene loads rebuild shape instances. Keep this client's
// history private, but point its actions at the newly materialized objects so
// Ctrl+Z never mutates detached SVG nodes after a peer update.
export function rebindUndoHistory(currentShapes = []) {
    const shapeById = new Map(currentShapes
        .filter(shape => shape?.shapeID)
        .map(shape => [shape.shapeID, shape]));
    const visited = new WeakSet();

    const rebind = (value) => {
        if (!value || typeof value !== 'object') return value;
        if (value.shapeID) return shapeById.get(value.shapeID) || value;
        if (visited.has(value)) return value;
        visited.add(value);
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) value[index] = rebind(value[index]);
            return value;
        }
        for (const key of Object.keys(value)) {
            const child = value[key];
            if (child && typeof child === 'object') value[key] = rebind(child);
        }
        return value;
    };

    undoStack.forEach(rebind);
    redoStack.forEach(rebind);
}

// Enhanced delete action to clean up attached arrows
export function pushDeleteActionWithAttachments(shape) {
    let affectedArrows = [];
    
    // If deleting a text element, find all attached arrows
    if (shape.type === 'text' || shape.shapeName === 'text') {
        affectedArrows = shapes.filter(s => s.shapeName === 'arrow' && 
            (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
            .map(arrow => ({
                arrow: arrow,
                oldAttachments: arrow.getAttachmentState(),
                oldPoints: {
                    startPoint: { ...arrow.startPoint },
                    endPoint: { ...arrow.endPoint }
                }
            }));
    }
    
    undoStack.push({
        type: 'delete',
        shape: shape,
        affectedArrows: affectedArrows
    });
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

export function pushFrameAttachmentAction(frame, shape, action, oldFrame = null) {
    undoStack.push({
        type: 'frameAttachment',
        frame: frame,
        shape: shape,
        action: action, // 'attach' or 'detach'
        oldFrame: oldFrame, // Previous frame if shape was moved between frames
        // Store shape position for potential restoration
        shapeState: {
            x: shape.x,
            y: shape.y,
            width: shape.width || 0,
            height: shape.height || 0,
            rotation: shape.rotation || 0
        }
    });
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

export function pushCreateActionWithAttachments(shape) {
    undoStack.push({
        type: 'create',
        shape: shape,
        // Store any arrows that might need to reattach when this is undone
        potentialAttachments: []
    });
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

export function pushTransformAction(shape, oldPos, newPos) {
    if (shape.shapeName === 'frame') {
        // Frame transforms can resize and rotate heterogeneous children.
        // Reconstructing their old geometry from the frame delta loses arrow
        // endpoints, circle radii and freehand points. Prefer the snapshot
        // captured at pointer-down, with a translation-only fallback for old
        // callers that have not supplied one yet.
        const oldSnapshots = new Map((oldPos.containedShapes || []).map(entry => [entry.shape, entry.state]));
        const containedShapesStates = shape.containedShapes.map(containedShape => ({
            shape: containedShape,
            oldState: oldSnapshots.get(containedShape) || {
                ...captureShapeGeometry(containedShape),
                x: typeof containedShape.x === 'number' ? containedShape.x - (newPos.x - oldPos.x) : containedShape.x,
                y: typeof containedShape.y === 'number' ? containedShape.y - (newPos.y - oldPos.y) : containedShape.y,
            },
            newState: captureShapeGeometry(containedShape),
        }));

        undoStack.push({
            type: 'frameTransform',
            shape: shape,
            oldPos: {
                x: oldPos.x,
                y: oldPos.y,
                width: oldPos.width,
                height: oldPos.height,
                rotation: oldPos.rotation,
                frameName: oldPos.frameName || shape.frameName
            },
            newPos: {
                x: newPos.x,
                y: newPos.y,
                width: newPos.width,
                height: newPos.height,
                rotation: newPos.rotation,
                frameName: newPos.frameName || shape.frameName
            },
            containedShapes: containedShapesStates
        });
    } else if (shape.type === 'text') {
        // Enhanced text handling - also track frame attachment changes
        const currentFrame = shape.parentFrame || null;
        
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                x: oldPos.x,
                y: oldPos.y,
                rotation: oldPos.rotation,
                fontSize: oldPos.fontSize
            },
            newPos: {
                x: newPos.x,
                y: newPos.y,
                rotation: newPos.rotation,
                fontSize: newPos.fontSize
            },
            // Track frame attachment state
            frameAttachment: {
                oldFrame: oldPos.parentFrame || null,
                newFrame: currentFrame
            },
            // Store affected arrows with their attachment states
            affectedArrows: shapes.filter(s => s.shapeName === 'arrow' && 
                (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
                .map(arrow => ({
                    arrow: arrow,
                    oldAttachments: arrow.getAttachmentState(),
                    oldPoints: {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    }
                }))
        });
    } else if (shape.type === 'image') {
        // Enhanced image handling - also track frame attachment changes
        const currentFrame = shape.parentFrame || null;
        
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                x: oldPos.x,
                y: oldPos.y,
                width: oldPos.width,
                height: oldPos.height,
                rotation: oldPos.rotation
            },
            newPos: {
                x: newPos.x,
                y: newPos.y,
                width: newPos.width,
                height: newPos.height,
                rotation: newPos.rotation
            },
            // Track frame attachment state
            frameAttachment: {
                oldFrame: oldPos.parentFrame || null,
                newFrame: currentFrame
            },
            // Store affected arrows with their attachment states
            affectedArrows: shapes.filter(s => s.shapeName === 'arrow' && 
                (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
                .map(arrow => ({
                    arrow: arrow,
                    oldAttachments: arrow.getAttachmentState(),
                    oldPoints: {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    }
                }))
        });
    } else if (shape.shapeName === 'circle') {
        // Enhanced circle handling - also track frame attachment changes
        const currentFrame = shape.parentFrame || null;
        
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                x: oldPos.x,
                y: oldPos.y,
                rx: oldPos.rx,
                ry: oldPos.ry,
                rotation: oldPos.rotation
            },
            newPos: {
                x: newPos.x,
                y: newPos.y,
                rx: newPos.rx,
                ry: newPos.ry,
                rotation: newPos.rotation
            },
            // Track frame attachment state
            frameAttachment: {
                oldFrame: oldPos.parentFrame || null,
                newFrame: currentFrame
            },
            // Store affected arrows with their attachment states
            affectedArrows: shapes.filter(s => s.shapeName === 'arrow' && 
                (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
                .map(arrow => ({
                    arrow: arrow,
                    oldAttachments: arrow.getAttachmentState(),
                    oldPoints: {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    }
                }))
        });
    } else if (shape.shapeName === "rectangle") {
        // Enhanced rectangle handling - also track frame attachment changes
        const currentFrame = shape.parentFrame || null;
        
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: { 
                x: oldPos.x, 
                y: oldPos.y, 
                width: oldPos.width, 
                height: oldPos.height, 
                rotation: oldPos.rotation
            },
            newPos: { 
                x: newPos.x, 
                y: newPos.y, 
                width: newPos.width, 
                height: newPos.height, 
                rotation: newPos.rotation
            },
            // Track frame attachment state
            frameAttachment: {
                oldFrame: oldPos.parentFrame || null,
                newFrame: currentFrame
            },
            // Store affected arrows with their attachment states
            affectedArrows: shapes.filter(s => s.shapeName === 'arrow' && 
                (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
                .map(arrow => ({
                    arrow: arrow,
                    oldAttachments: arrow.getAttachmentState(),
                    oldPoints: {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    }
                }))
        });
    } 
    else if (shape.shapeName === 'line') {
        // Enhanced line handling with curve support
        const currentFrame = shape.parentFrame || null;
        
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                startPoint: { x: oldPos.startPoint.x, y: oldPos.startPoint.y },
                endPoint: { x: oldPos.endPoint.x, y: oldPos.endPoint.y },
                controlPoint: oldPos.controlPoint ? { x: oldPos.controlPoint.x, y: oldPos.controlPoint.y } : null,
                isCurved: oldPos.isCurved || false
            },
            newPos: {
                startPoint: { x: newPos.startPoint.x, y: newPos.startPoint.y },
                endPoint: { x: newPos.endPoint.x, y: newPos.endPoint.y },
                controlPoint: newPos.controlPoint ? { x: newPos.controlPoint.x, y: newPos.controlPoint.y } : null,
                isCurved: newPos.isCurved || false
            },
            // Track frame attachment state
            frameAttachment: {
                oldFrame: oldPos.parentFrame || null,
                newFrame: currentFrame
            }
        });
    }
     else if (shape.shapeName === 'arrow') {
        // Handle arrow transform with attachment state
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                startPoint: { x: oldPos.startPoint.x, y: oldPos.startPoint.y },
                endPoint: { x: oldPos.endPoint.x, y: oldPos.endPoint.y },
                controlPoint1: oldPos.controlPoint1 ? { x: oldPos.controlPoint1.x, y: oldPos.controlPoint1.y } : null,
                controlPoint2: oldPos.controlPoint2 ? { x: oldPos.controlPoint2.x, y: oldPos.controlPoint2.y } : null,
                attachments: oldPos.attachments || shape.getAttachmentState()
            },
            newPos: {
                startPoint: { x: newPos.startPoint.x, y: newPos.startPoint.y },
                endPoint: { x: newPos.endPoint.x, y: newPos.endPoint.y },
                controlPoint1: newPos.controlPoint1 ? { x: newPos.controlPoint1.x, y: newPos.controlPoint1.y } : null,
                controlPoint2: newPos.controlPoint2 ? { x: newPos.controlPoint2.x, y: newPos.controlPoint2.y } : null,
                attachments: newPos.attachments || shape.getAttachmentState()
            }
        });
    } 
    else if (shape.type === 'icon') {
    // Enhanced icon handling - also track frame attachment changes
    const currentFrame = shape.parentFrame || null;
    
    undoStack.push({
        type: 'transform',
        shape: shape,
        oldPos: {
            x: oldPos.x,
            y: oldPos.y,
            width: oldPos.width,
            height: oldPos.height,
            rotation: oldPos.rotation
        },
        newPos: {
            x: newPos.x,
            y: newPos.y,
            width: newPos.width,
            height: newPos.height,
            rotation: newPos.rotation
        },
        // Track frame attachment state
        frameAttachment: {
            oldFrame: oldPos.parentFrame || null,
            newFrame: currentFrame
        },
        // Store affected arrows with their attachment states
        affectedArrows: shapes.filter(s => s.shapeName === 'arrow' && 
            (s.attachedToStart?.shape === shape || s.attachedToEnd?.shape === shape))
            .map(arrow => ({
                arrow: arrow,
                oldAttachments: arrow.getAttachmentState(),
                oldPoints: {
                    startPoint: { ...arrow.startPoint },
                    endPoint: { ...arrow.endPoint }
                }
            }))
    });
}

    else if (shape.shapeName === 'freehandStroke') {
        // Handle freehand stroke transform
        undoStack.push({
            type: 'transform',
            shape: shape,
            oldPos: {
                points: JSON.parse(JSON.stringify(oldPos.points)),
                rotation: oldPos.rotation
            },
            newPos: {
                points: JSON.parse(JSON.stringify(newPos.points)),
                rotation: newPos.rotation
            }
        });
    }
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

function clonePoint(point) {
    return point ? { ...point } : point;
}

export function captureShapeGeometry(shape) {
    const state = {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation || 0,
    };
    if (typeof shape.rx === 'number') state.rx = shape.rx;
    if (typeof shape.ry === 'number') state.ry = shape.ry;
    if (shape.startPoint) state.startPoint = clonePoint(shape.startPoint);
    if (shape.endPoint) state.endPoint = clonePoint(shape.endPoint);
    if (shape.controlPoint1) state.controlPoint1 = clonePoint(shape.controlPoint1);
    if (shape.controlPoint2) state.controlPoint2 = clonePoint(shape.controlPoint2);
    if (Array.isArray(shape.points)) state.points = shape.points.map(point => Array.isArray(point) ? [...point] : point);
    if (typeof shape._moveOffsetX === 'number') state._moveOffsetX = shape._moveOffsetX;
    if (typeof shape._moveOffsetY === 'number') state._moveOffsetY = shape._moveOffsetY;
    return state;
}

export function captureFrameChildStates(frame) {
    return (frame?.containedShapes || []).map(shape => ({ shape, state: captureShapeGeometry(shape) }));
}

function restoreShapeGeometry(shape, state) {
    if (!shape || !state) return;
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'rx', 'ry', '_moveOffsetX', '_moveOffsetY']) {
        if (state[key] !== undefined) shape[key] = state[key];
    }
    for (const key of ['startPoint', 'endPoint', 'controlPoint1', 'controlPoint2']) {
        if (state[key] !== undefined) shape[key] = clonePoint(state[key]);
    }
    if (state.points) shape.points = state.points.map(point => Array.isArray(point) ? [...point] : point);
    if (typeof shape.updateBoundingBox === 'function') shape.updateBoundingBox();
    if (typeof shape.draw === 'function') shape.draw();
}

export function pushOptionsChangeAction(shape, oldOptions, newOptions = null) {
    undoStack.push({
        type: 'optionsChange',
        shape: shape,
        oldOptions: oldOptions,
        newOptions: newOptions
    });
    
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    notifyCollaboration();
}

function applyOptionsSnapshot(shape, options) {
    shape.options = { ...options };
    if (shape.shapeName === 'frame') {
        shape.fillColor = options.fillColor;
        shape.fillStyle = options.fillStyle;
    }
    shape.draw();
}

// Issue #34 bug #4: refresh the multi-selection outline + handles so it
// follows the reverted geometry. Without this the selection rect stays
// pinned to the pre-undo coordinates and the user sees a ghost rect
// floating away from the shapes it claims to wrap.
function refreshSelectionAfterAction() {
    const ms = (typeof window !== 'undefined') ? window.multiSelection : null;
    if (!ms) return;
    if (typeof ms.updateControls !== 'function') return;
    if (!ms.selectedShapes || ms.selectedShapes.size === 0) return;
    try { ms.updateControls(); } catch (err) { console.warn('[UndoRedo] selection refresh failed:', err); }
}

function restoreDeletedShapeFrame(action) {
    const frame = action.parentFrame;
    const shape = action.shape;
    if (!frame || !shape || typeof frame.addShapeToFrame !== 'function') return;
    frame.addShapeToFrame(shape);
    if (Number.isInteger(action.frameIndex) && Array.isArray(frame.containedShapes)) {
        const currentIndex = frame.containedShapes.indexOf(shape);
        if (currentIndex >= 0) frame.containedShapes.splice(currentIndex, 1);
        const targetIndex = Math.min(Math.max(action.frameIndex, 0), frame.containedShapes.length);
        frame.containedShapes.splice(targetIndex, 0, shape);
        const element = shape.group || shape.element;
        const nextShape = frame.containedShapes[targetIndex + 1];
        const nextElement = nextShape?.group || nextShape?.element;
        if (element && frame.clipGroup && nextElement?.parentNode === frame.clipGroup) {
            frame.clipGroup.insertBefore(element, nextElement);
        }
    }
}

function detachDeletedShapeFrame(action) {
    const frame = action.parentFrame;
    const shape = action.shape;
    if (frame && shape && typeof frame.removeShapeFromFrame === 'function' && shape.parentFrame === frame) {
        frame.removeShapeFromFrame(shape);
    }
}

function restoreCreatedShapeFrame(action) {
    if (!action.parentFrame) return;
    restoreDeletedShapeFrame(action);
}

function detachCreatedShapeFrame(action) {
    if (!action.parentFrame) return;
    detachDeletedShapeFrame(action);
}

export function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    try {
    if (action.type === 'batch') {
        for (let index = action.actions.length - 1; index >= 0; index -= 1) {
            undoStack.push(action.actions[index]);
            undo();
            redoStack.pop();
        }
        redoStack.push(action);
        return;
    }

    if (action.type === 'canvasReset') {
        action.restore(action.snapshot);
        redoStack.push(action);
        notifyCollaboration();
        return;
    }

    if (action.type === 'frameTransform') {
        // Handle frame transformation undo
        action.shape.x = action.oldPos.x;
        action.shape.y = action.oldPos.y;
        action.shape.width = action.oldPos.width;
        action.shape.height = action.oldPos.height;
        action.shape.rotation = action.oldPos.rotation;
        action.shape.frameName = action.oldPos.frameName;
        
        // Restore contained shapes to their old positions
        action.containedShapes.forEach(shapeData => {
            restoreShapeGeometry(shapeData.shape, shapeData.oldState);
        });
        
        action.shape.isSelected = false;
        if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
        action.shape.draw();
        action.shape.updateClipPath();
        
        redoStack.push(action);
        return;
    }
    
    if (action.type === 'frameAttachment') {
        // Handle frame attachment/detachment undo WITHOUT calling the methods that track undo
        if (action.action === 'attach') {
            // Undo attach: manually remove shape from frame
            const frameIndex = action.frame.containedShapes.indexOf(action.shape);
            if (frameIndex > -1) {
                action.frame.containedShapes.splice(frameIndex, 1);
                action.shape.parentFrame = null;
                
                // Move shape back to main SVG
                if (action.shape.group && action.shape.group.parentNode === action.frame.clipGroup) {
                    action.frame.clipGroup.removeChild(action.shape.group);
                    svg.appendChild(action.shape.group);
                }
            }
            
            // If shape was moved from another frame, restore it there
            if (action.oldFrame) {
                action.oldFrame.containedShapes.push(action.shape);
                action.shape.parentFrame = action.oldFrame;
                
                // Move to old frame's clipped group
                if (action.shape.group && action.shape.group.parentNode === svg) {
                    svg.removeChild(action.shape.group);
                    action.oldFrame.clipGroup.appendChild(action.shape.group);
                }
            }
        } else if (action.action === 'detach') {
            // Undo detach: manually add shape back to frame
            if (!action.frame.containedShapes.includes(action.shape)) {
                action.frame.containedShapes.push(action.shape);
                action.shape.parentFrame = action.frame;
                
                // Move to frame's clipped group
                if (action.shape.group && action.shape.group.parentNode === svg) {
                    svg.removeChild(action.shape.group);
                    action.frame.clipGroup.appendChild(action.shape.group);
                }
            }
        }
        
        // Restore shape state
        action.shape.x = action.shapeState.x;
        action.shape.y = action.shapeState.y;
        action.shape.width = action.shapeState.width;
        action.shape.height = action.shapeState.height;
        action.shape.rotation = action.shapeState.rotation;
        
        if (typeof action.shape.draw === 'function') {
            action.shape.draw();
        }
        
        redoStack.push(action);
        return;
    }

    // Handle mode conversion undo (code ↔ text)
    if (action.type === 'create' && action.shape.type === 'modeConvert') {
        // Undo: remove the new shape, restore the old shape
        const newShape = action.shape.newShape;
        const newElement = action.shape.newElement;
        const oldShape = action.shape.oldShape;
        const oldElement = action.shape.oldElement;

        // Remove new shape from DOM and shapes array
        if (newElement && newElement.parentNode) {
            newElement.parentNode.removeChild(newElement);
        }
        const newIdx = shapes.indexOf(newShape);
        if (newIdx !== -1) shapes.splice(newIdx, 1);

        // Restore old shape to DOM and shapes array
        if (svg && oldElement) {
            svg.appendChild(oldElement);
        }
        if (oldShape) {
            shapes.push(oldShape);
        }

        redoStack.push(action);
        return;
    }

    if (action.type === 'create') {
    detachCreatedShapeFrame(action);
    if (action.frameCreation && action.shape.shapeName === 'frame') {
        // Treat a manually-created frame and its initial membership as one
        // atomic action. Children remain on the canvas when the frame is
        // undone and are clipped back into it on redo.
        for (const child of action.containedShapes || []) {
            if (child?.parentFrame === action.shape) action.shape.removeShapeFromFrame(child);
        }
        if (currentShape === action.shape) {
            action.shape.removeSelection?.();
            currentShape = null;
        }
        const idx = shapes.indexOf(action.shape);
        if (idx !== -1) shapes.splice(idx, 1);
        action.shape.group?.remove();
        action.shape.clipGroup?.remove();
        action.shape.clipPath?.remove();
    } else
    if (action.shape.type === 'text') {
        // Handle text creation undo
        if (action.shape.element && action.shape.element.parentNode) {
            action.shape.element.parentNode.removeChild(action.shape.element);
        } else if (action.shape.parentNode) {
            action.shape.parentNode.removeChild(action.shape);
        }

        // Remove from shapes array
        const idx = shapes.indexOf(action.shape.element || action.shape);
        if (idx !== -1) shapes.splice(idx, 1);

        // Clean up any arrow attachments to this text
        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(action.shape.element || action.shape);
        }
    } else if (action.shape.type === 'image') {
        // Handle image creation undo
        action.shape.remove();
    } else if (action.shape.type === 'icon') {
        // Handle icon creation undo - call the remove method
        action.shape.remove();
    } else {
        // Handle other shape creation undo
        const idx = shapes.indexOf(action.shape);
        if (idx !== -1) shapes.splice(idx, 1);
        if (action.shape.group && action.shape.group.parentNode) {
            action.shape.group.parentNode.removeChild(action.shape.group);
        }
        
        // Handle frame cleanup
        if (action.shape.shapeName === 'frame') {
            action.shape.destroy();
        }
    }
    redoStack.push(action);
    return;
}
    
    if (action.type === 'delete') {
        if (action.shape.type === 'text') {
            // Handle text deletion undo
            if (svg) {
                svg.appendChild(action.shape.element || action.shape);
                // Add back to shapes array
                shapes.push(action.shape.element || action.shape);
            }
            
            // Restore arrow attachments if any existed
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore the old attachment state
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                });
            }
        } else if (action.shape.type === 'image') {
            // Handle image deletion undo
            action.shape.restore();
        } else {
            // Handle other shape deletion undo
            if (shapes.indexOf(action.shape) === -1) {
                const index = Number.isInteger(action.shapeIndex)
                    ? Math.min(Math.max(action.shapeIndex, 0), shapes.length)
                    : shapes.length;
                shapes.splice(index, 0, action.shape);
            }
            if (svg) {
                svg.appendChild(action.shape.group);
            }

            // Issue #24 bug #7: rehydrate frame state. The delete path
            // orphaned the frame (removed <g>, clipGroup, clipPath from
            // DOM) but kept the JS object intact. Re-attach clipGroup +
            // clipPath, then re-parent every child from the snapshot via
            // addShapeToFrame. Skip children that were subsequently
            // deleted (they'll get re-added when their own delete action
            // is undone in turn).
            if (action.shape.shapeName === 'frame' && svg) {
                if (action.shape.clipGroup && !action.shape.clipGroup.parentNode) {
                    svg.appendChild(action.shape.clipGroup);
                }
                if (action.shape.clipPath && !action.shape.clipPath.parentNode) {
                    const defs = svg.querySelector('defs');
                    if (defs) defs.appendChild(action.shape.clipPath);
                    else svg.insertBefore(action.shape.clipPath, svg.firstChild);
                }
                if (action.childSnapshot && Array.isArray(action.childSnapshot)) {
                    for (const child of action.childSnapshot) {
                        if (!child) continue;
                        if (shapes.indexOf(child) === -1) continue;
                        if (typeof action.shape.addShapeToFrame === 'function') {
                            action.shape.addShapeToFrame(child);
                        }
                    }
                }
            }
        }
        restoreDeletedShapeFrame(action);
        redoStack.push(action);
        return;
    }
    
    if (action.type === 'transform') {
        // Handle frame attachment changes first
        if (action.frameAttachment) {
            // Use manual frame operations to avoid undo recursion
            if (action.frameAttachment.newFrame) {
                const frameIndex = action.frameAttachment.newFrame.containedShapes.indexOf(action.shape);
                if (frameIndex > -1) {
                    action.frameAttachment.newFrame.containedShapes.splice(frameIndex, 1);
                    if (action.shape.group && action.shape.group.parentNode === action.frameAttachment.newFrame.clipGroup) {
                        action.frameAttachment.newFrame.clipGroup.removeChild(action.shape.group);
                        svg.appendChild(action.shape.group);
                    }
                }
            }
            if (action.frameAttachment.oldFrame) {
                if (!action.frameAttachment.oldFrame.containedShapes.includes(action.shape)) {
                    action.frameAttachment.oldFrame.containedShapes.push(action.shape);
                    action.shape.parentFrame = action.frameAttachment.oldFrame;
                    if (action.shape.group && action.shape.group.parentNode === svg) {
                        svg.removeChild(action.shape.group);
                        action.frameAttachment.oldFrame.clipGroup.appendChild(action.shape.group);
                    }
                }
            } else {
                action.shape.parentFrame = null;
            }
        }
        
        if (action.shape.type === 'text') {
            // Enhanced text transform undo
            const textElement = (action.shape.element || action.shape).querySelector('text');
            if (textElement && action.oldPos.fontSize !== undefined) {
                textElement.setAttribute('font-size', action.oldPos.fontSize + 'px');
            }
            
            // Restore position and rotation
            const centerX = textElement ? textElement.getBBox().x + textElement.getBBox().width / 2 : 0;
            const centerY = textElement ? textElement.getBBox().y + textElement.getBBox().height / 2 : 0;
            
            (action.shape.element || action.shape).setAttribute('transform', 
                `translate(${action.oldPos.x}, ${action.oldPos.y}) rotate(${action.oldPos.rotation}, ${centerX}, ${centerY})`
            );
            
            (action.shape.element || action.shape).setAttribute('data-x', action.oldPos.x);
            (action.shape.element || action.shape).setAttribute('data-y', action.oldPos.y);
            
            // Update attached arrows after text undo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to old state
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                    
                    // Store current state for redo
                    arrowData.newPoints = {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    };
                    arrowData.newAttachments = arrow.getAttachmentState();
                });
            }
            
            // Update feedback if selected
            if (selectedElement === (action.shape.element || action.shape) && updateSelectionFeedback) {
                setTimeout(updateSelectionFeedback, 0);
            }
        } else if (action.shape.type === 'image') {
            // Enhanced image transform undo
            action.shape.restore(action.oldPos);
            
            // Update attached arrows after image undo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to old state
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                    
                    // Store current state for redo
                    arrowData.newPoints = {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    };
                    arrowData.newAttachments = arrow.getAttachmentState();
                });
            }
        } else if (action.shape.shapeName === 'circle') {
            // Enhanced circle transform undo
            action.shape.x = action.oldPos.x;
            action.shape.y = action.oldPos.y;
            action.shape.rx = action.oldPos.rx;
            action.shape.ry = action.oldPos.ry;
            action.shape.rotation = action.oldPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();

            // Update attached arrows after circle undo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to old state
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                    
                    // Store current state for redo
                    arrowData.newPoints = {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    };
                    arrowData.newAttachments = arrow.getAttachmentState();
                });
            }
        } else if (action.shape.shapeName === 'line') {
            // Enhanced line transform undo with curve support
            action.shape.startPoint = { x: action.oldPos.startPoint.x, y: action.oldPos.startPoint.y };
            action.shape.endPoint = { x: action.oldPos.endPoint.x, y: action.oldPos.endPoint.y };
            
            // Restore curve state
            action.shape.isCurved = action.oldPos.isCurved || false;
            if (action.oldPos.controlPoint) {
                action.shape.controlPoint = { x: action.oldPos.controlPoint.x, y: action.oldPos.controlPoint.y };
            } else {
                action.shape.controlPoint = null;
            }
            
            // Handle frame attachment changes
            if (action.frameAttachment) {
                // Remove from new frame if it exists
                if (action.frameAttachment.newFrame) {
                    const frameIndex = action.frameAttachment.newFrame.containedShapes.indexOf(action.shape);
                    if (frameIndex > -1) {
                        action.frameAttachment.newFrame.containedShapes.splice(frameIndex, 1);
                        if (action.shape.group && action.shape.group.parentNode === action.frameAttachment.newFrame.clipGroup) {
                            action.frameAttachment.newFrame.clipGroup.removeChild(action.shape.group);
                            svg.appendChild(action.shape.group);
                        }
                    }
                }
                
                // Add back to old frame if it exists
                if (action.frameAttachment.oldFrame) {
                    if (!action.frameAttachment.oldFrame.containedShapes.includes(action.shape)) {
                        action.frameAttachment.oldFrame.containedShapes.push(action.shape);
                        action.shape.parentFrame = action.frameAttachment.oldFrame;
                        if (action.shape.group && action.shape.group.parentNode === svg) {
                            svg.removeChild(action.shape.group);
                            action.frameAttachment.oldFrame.clipGroup.appendChild(action.shape.group);
                        }
                    }
                } else {
                    action.shape.parentFrame = null;
                }
            }
            
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();
        }
         else if (action.shape.shapeName === 'arrow') {
            // Enhanced arrow transform undo with attachment restoration
            action.shape.startPoint = { x: action.oldPos.startPoint.x, y: action.oldPos.startPoint.y };
            action.shape.endPoint = { x: action.oldPos.endPoint.x, y: action.oldPos.endPoint.y };
            action.shape.controlPoint1 = action.oldPos.controlPoint1 ? 
                { x: action.oldPos.controlPoint1.x, y: action.oldPos.controlPoint1.y } : null;
            action.shape.controlPoint2 = action.oldPos.controlPoint2 ? 
                { x: action.oldPos.controlPoint2.x, y: action.oldPos.controlPoint2.y } : null;
            
            // Restore attachment state
            if (action.oldPos.attachments) {
                action.shape.restoreAttachmentState(action.oldPos.attachments);
            } else {
                // Clear attachments if none existed before
                action.shape.attachedToStart = null;
                action.shape.attachedToEnd = null;
            }
            
            action.shape.isSelected = false;
            action.shape.draw();
            

            
        } 
        else if (action.shape.type === 'icon') {
            
            action.shape.restore(action.oldPos);
            
            // Update attached arrows after icon undo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to old state
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                    
                    // Store current state for redo
                    arrowData.newPoints = {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    };
                    arrowData.newAttachments = arrow.getAttachmentState();
                });
            }
        }
        else if (action.shape.shapeName === 'freehandStroke') {
            // Handle freehand stroke transform undo
            action.shape.points = JSON.parse(JSON.stringify(action.oldPos.points));
            action.shape.rotation = action.oldPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();
        } else if (action.shape.shapeName === "rectangle") {
            action.shape.x = action.oldPos.x;
            action.shape.y = action.oldPos.y;
            action.shape.height = action.oldPos.height;
            action.shape.width = action.oldPos.width;
            action.shape.rotation = action.oldPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();

            // Update attached arrows after rectangle undo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    arrow.restoreAttachmentState(arrowData.oldAttachments);
                    arrowData.newPoints = {
                        startPoint: { ...arrow.startPoint },
                        endPoint: { ...arrow.endPoint }
                    };
                    arrowData.newAttachments = arrow.getAttachmentState();
                });
            }
        }
        redoStack.push(action);
        return;
    }
    
    if (action.type === 'optionsChange') {
        if (!action.newOptions && action.shape?.options) {
            action.newOptions = action.shape.shapeName === 'arrow'
                ? {
                    ...action.shape.options,
                    arrowOutlineStyle: action.shape.arrowOutlineStyle,
                    arrowHeadStyle: action.shape.arrowHeadStyle,
                    arrowCurved: action.shape.arrowCurved,
                    arrowCurveAmount: action.shape.arrowCurveAmount,
                }
                : { ...action.shape.options };
        }
        if (action.shape.type === 'text') {
            // Handle text options change undo
            const textElement = (action.shape.element || action.shape).querySelector('text');
            if (textElement) {
                if (action.oldOptions.color) textElement.setAttribute('fill', action.oldOptions.color);
                if (action.oldOptions.font) textElement.setAttribute('font-family', action.oldOptions.font);
                if (action.oldOptions.size) textElement.setAttribute('font-size', action.oldOptions.size);
                if (action.oldOptions.align) textElement.setAttribute('text-anchor', action.oldOptions.align);
                
                // Update feedback if selected
                if (selectedElement === (action.shape.element || action.shape) && updateSelectionFeedback) {
                    setTimeout(updateSelectionFeedback, 0);
                }
            }
        } else if (action.shape.shapeName === 'arrow') {
            // Handle arrow options change undo
            action.shape.options = { ...action.oldOptions };
            action.shape.arrowOutlineStyle = action.oldOptions.arrowOutlineStyle;
            action.shape.arrowHeadStyle = action.oldOptions.arrowHeadStyle;
            action.shape.arrowCurved = action.oldOptions.arrowCurved;
            action.shape.arrowCurveAmount = action.oldOptions.arrowCurveAmount;
            action.shape.draw();
        } else {
            // Handle other shape options change undo
            applyOptionsSnapshot(action.shape, action.oldOptions);
        }
        redoStack.push(action);
        return;
    }
    } finally {
        refreshSelectionAfterAction();
        notifyCollaboration();
    }
}

export function redo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    try {
    if (action.type === 'batch') {
        for (const childAction of action.actions) {
            redoStack.push(childAction);
            redo();
            undoStack.pop();
        }
        undoStack.push(action);
        return;
    }

    if (action.type === 'canvasReset') {
        action.reset();
        undoStack.push(action);
        notifyCollaboration();
        return;
    }

    if (action.type === 'frameTransform') {
        // Handle frame transformation redo
        action.shape.x = action.newPos.x;
        action.shape.y = action.newPos.y;
        action.shape.width = action.newPos.width;
        action.shape.height = action.newPos.height;
        action.shape.rotation = action.newPos.rotation;
        action.shape.frameName = action.newPos.frameName;
        
        // Restore contained shapes to their new positions
        action.containedShapes.forEach(shapeData => {
            restoreShapeGeometry(shapeData.shape, shapeData.newState);
        });
        
        action.shape.isSelected = false;
        if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
        action.shape.draw();
        action.shape.updateClipPath();
        
        undoStack.push(action);
        return;
    }

    
    if (action.type === 'frameAttachment') {
        // Handle frame attachment/detachment redo WITHOUT calling the methods that track undo
        if (action.action === 'attach') {
            // Redo attach: manually add shape to frame
            if (action.oldFrame) {
                // Remove from old frame
                const oldFrameIndex = action.oldFrame.containedShapes.indexOf(action.shape);
                if (oldFrameIndex > -1) {
                    action.oldFrame.containedShapes.splice(oldFrameIndex, 1);
                    if (action.shape.group && action.shape.group.parentNode === action.oldFrame.clipGroup) {
                        action.oldFrame.clipGroup.removeChild(action.shape.group);
                        svg.appendChild(action.shape.group);
                    }
                }
            }
            
            // Add to new frame
            if (!action.frame.containedShapes.includes(action.shape)) {
                action.frame.containedShapes.push(action.shape);
                action.shape.parentFrame = action.frame;
                
                if (action.shape.group && action.shape.group.parentNode === svg) {
                    svg.removeChild(action.shape.group);
                    action.frame.clipGroup.appendChild(action.shape.group);
                }
            }
        } else if (action.action === 'detach') {
            // Redo detach: manually remove shape from frame
            const frameIndex = action.frame.containedShapes.indexOf(action.shape);
            if (frameIndex > -1) {
                action.frame.containedShapes.splice(frameIndex, 1);
                action.shape.parentFrame = null;
                
                if (action.shape.group && action.shape.group.parentNode === action.frame.clipGroup) {
                    action.frame.clipGroup.removeChild(action.shape.group);
                    svg.appendChild(action.shape.group);
                }
            }
        }
        
        if (typeof action.shape.draw === 'function') {
            action.shape.draw();
        }
        
        undoStack.push(action);
        return;
    }

    // Handle mode conversion redo (code ↔ text)
    if (action.type === 'create' && action.shape.type === 'modeConvert') {
        // Redo: remove the old shape, restore the new shape
        const newShape = action.shape.newShape;
        const newElement = action.shape.newElement;
        const oldShape = action.shape.oldShape;
        const oldElement = action.shape.oldElement;

        // Remove old shape from DOM and shapes array
        if (oldElement && oldElement.parentNode) {
            oldElement.parentNode.removeChild(oldElement);
        }
        const oldIdx = shapes.indexOf(oldShape);
        if (oldIdx !== -1) shapes.splice(oldIdx, 1);

        // Restore new shape to DOM and shapes array
        if (svg && newElement) {
            svg.appendChild(newElement);
        }
        if (newShape) {
            shapes.push(newShape);
        }

        undoStack.push(action);
        return;
    }

    if (action.type === 'create') {
    if (action.frameCreation && action.shape.shapeName === 'frame') {
        const frame = action.shape;
        let defs = svg?.querySelector('defs');
        if (!defs && svg) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }
        if (defs && frame.clipPath && !frame.clipPath.parentNode) defs.appendChild(frame.clipPath);
        if (svg && frame.group && !frame.group.parentNode) svg.appendChild(frame.group);
        if (svg && frame.clipGroup && !frame.clipGroup.parentNode) svg.appendChild(frame.clipGroup);
        if (shapes.indexOf(frame) === -1) {
            const index = action.shapeIndex >= 0 ? Math.min(action.shapeIndex, shapes.length) : shapes.length;
            shapes.splice(index, 0, frame);
        }
        frame.containedShapes = [];
        frame.draw();
        frame.updateClipPath();
        for (const child of action.containedShapes || []) {
            if (child && shapes.includes(child)) frame.addShapeToFrame(child);
        }
    } else
    if (action.shape.type === 'text') {
        // Handle text creation redo
        if (svg) {
            svg.appendChild(action.shape.element || action.shape);
            // Add back to shapes array
            shapes.push(action.shape.element || action.shape);
        }
    }
    else if (action.shape.type === 'image') {
        // Handle image creation redo
        action.shape.restore();
    } else if (action.shape.type === 'icon') {
        // Handle icon creation redo - append the group, not the shape object
        if (svg && action.shape.group) {
            svg.appendChild(action.shape.group);
        }
        // Add back to shapes array
        if (shapes.indexOf(action.shape) === -1) {
            shapes.push(action.shape);
        }
    } else {
        // Handle other shape creation redo
        if (!shapes.includes(action.shape)) shapes.push(action.shape);
        if (svg) {
            svg.appendChild(action.shape.group);
        }
    }
    restoreCreatedShapeFrame(action);
    undoStack.push(action);
    return;
}
    
    if (action.type === 'delete') {
        detachDeletedShapeFrame(action);
        if (action.shape.type === 'text') {
            // Handle text deletion redo
            if ((action.shape.element || action.shape).parentNode) {
                (action.shape.element || action.shape).parentNode.removeChild(action.shape.element || action.shape);
            }
            // Remove from shapes array
            const idx = shapes.indexOf(action.shape.element || action.shape);
            if (idx !== -1) shapes.splice(idx, 1);
            
            // Clean up arrow attachments again
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Detach from the deleted text
                    if (arrow.attachedToStart && arrow.attachedToStart.shape === (action.shape.element || action.shape)) {
                        arrow.detachFromShape(true);
                    }
                    if (arrow.attachedToEnd && arrow.attachedToEnd.shape === (action.shape.element || action.shape)) {
                        arrow.detachFromShape(false);
                    }
                    arrow.draw();
                });
            }
        }
        else if (action.shape.type === 'image') {
            // Handle image deletion redo
            action.shape.remove();
        } else {
            // Handle other shape deletion redo
            const idx = shapes.indexOf(action.shape);
            if (idx !== -1) shapes.splice(idx, 1);

            // Issue #24 bug #7: for a regular frame, re-orphan instead of
            // destroy() — releases children visually, detaches the frame's
            // own DOM bits, but keeps the JS object and child references
            // intact so a subsequent undo can rehydrate again.
            if (action.shape.shapeName === 'frame' && !action.shape._diagramType && action.childSnapshot) {
                for (const child of action.childSnapshot) {
                    if (!child) continue;
                    const el = child.group || child.element;
                    if (el && svg) {
                        if (action.shape.clipGroup && el.parentNode === action.shape.clipGroup) {
                            action.shape.clipGroup.removeChild(el);
                        }
                        if (el.parentNode !== svg) svg.appendChild(el);
                    }
                    child.parentFrame = null;
                    delete child.isBeingMovedByFrame;
                }
                action.shape.containedShapes = [];
                if (action.shape.group && action.shape.group.parentNode) action.shape.group.parentNode.removeChild(action.shape.group);
                if (action.shape.clipGroup && action.shape.clipGroup.parentNode) action.shape.clipGroup.parentNode.removeChild(action.shape.clipGroup);
                if (action.shape.clipPath && action.shape.clipPath.parentNode) action.shape.clipPath.parentNode.removeChild(action.shape.clipPath);
            } else {
                if (action.shape.group && action.shape.group.parentNode) {
                    action.shape.group.parentNode.removeChild(action.shape.group);
                }
                // Diagram frame OR no snapshot → fall back to destroy().
                if (action.shape.shapeName === 'frame' && typeof action.shape.destroy === 'function') {
                    action.shape.destroy();
                }
            }
        }
        undoStack.push(action);
        return;
    }
    
    if (action.type === 'transform') {
        // Handle frame attachment changes first
        if (action.frameAttachment) {
            // Use manual frame operations to avoid undo recursion
            if (action.frameAttachment.oldFrame) {
                const oldFrameIndex = action.frameAttachment.oldFrame.containedShapes.indexOf(action.shape);
                if (oldFrameIndex > -1) {
                    action.frameAttachment.oldFrame.containedShapes.splice(oldFrameIndex, 1);
                    if (action.shape.group && action.shape.group.parentNode === action.frameAttachment.oldFrame.clipGroup) {
                        action.frameAttachment.oldFrame.clipGroup.removeChild(action.shape.group);
                        svg.appendChild(action.shape.group);
                    }
                }
            }
            if (action.frameAttachment.newFrame) {
                if (!action.frameAttachment.newFrame.containedShapes.includes(action.shape)) {
                    action.frameAttachment.newFrame.containedShapes.push(action.shape);
                    action.shape.parentFrame = action.frameAttachment.newFrame;
                    if (action.shape.group && action.shape.group.parentNode === svg) {
                        svg.removeChild(action.shape.group);
                        action.frameAttachment.newFrame.clipGroup.appendChild(action.shape.group);
                    }
                }
            } else {
                action.shape.parentFrame = null;
            }
        }
        
        if (action.shape.type === 'text') {
            // Enhanced text transform redo
            const textElement = (action.shape.element || action.shape).querySelector('text');
            if (textElement && action.newPos.fontSize !== undefined) {
                textElement.setAttribute('font-size', action.newPos.fontSize + 'px');
            }
            
            // Restore position and rotation
            const centerX = textElement ? textElement.getBBox().x + textElement.getBBox().width / 2 : 0;
            const centerY = textElement ? textElement.getBBox().y + textElement.getBBox().height / 2 : 0;
            
            (action.shape.element || action.shape).setAttribute('transform', 
                `translate(${action.newPos.x}, ${action.newPos.y}) rotate(${action.newPos.rotation}, ${centerX}, ${centerY})`
            );
            
            (action.shape.element || action.shape).setAttribute('data-x', action.newPos.x);
            (action.shape.element || action.shape).setAttribute('data-y', action.newPos.y);
            
            // Update attached arrows after text redo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to new state
                    if (arrowData.newAttachments) {
                        arrow.restoreAttachmentState(arrowData.newAttachments);
                    } else {
                        // If no new attachments stored, recalculate based on current text position
                        arrow.updateAttachments();
                    }
                });
            }
            
            // Update feedback if selected
            if (selectedElement === (action.shape.element || action.shape) && updateSelectionFeedback) {
                setTimeout(updateSelectionFeedback, 0);
            }
        } else if (action.shape.type === 'image') {
            // Enhanced image transform redo
            action.shape.restore(action.newPos);
            
            // Update attached arrows after image redo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to new state
                    if (arrowData.newAttachments) {
                        arrow.restoreAttachmentState(arrowData.newAttachments);
                    } else {
                        // If no new attachments stored, recalculate based on current image position
                        arrow.updateAttachments();
                    }
                });
            }
        } else if (action.shape.shapeName === 'circle') {
            // Enhanced circle transform redo
            action.shape.x = action.newPos.x;
            action.shape.y = action.newPos.y;
            action.shape.rx = action.newPos.rx;
            action.shape.ry = action.newPos.ry;
            action.shape.rotation = action.newPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();

            // Update attached arrows after circle redo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to new state
                    if (arrowData.newAttachments) {
                        arrow.restoreAttachmentState(arrowData.newAttachments);
                    } else {
                        // If no new attachments stored, recalculate based on current circle position
                        arrow.updateAttachments();
                    }
                });
            }
        } else if (action.shape.shapeName === 'line') {
            // Enhanced line transform redo with curve support
            action.shape.startPoint = { x: action.newPos.startPoint.x, y: action.newPos.startPoint.y };
            action.shape.endPoint = { x: action.newPos.endPoint.x, y: action.newPos.endPoint.y };
            
            // Restore curve state
            action.shape.isCurved = action.newPos.isCurved || false;
            if (action.newPos.controlPoint) {
                action.shape.controlPoint = { x: action.newPos.controlPoint.x, y: action.newPos.controlPoint.y };
            } else {
                action.shape.controlPoint = null;
            }
            
            // Handle frame attachment changes
            if (action.frameAttachment) {
                // Remove from old frame if it exists
                if (action.frameAttachment.oldFrame) {
                    const oldFrameIndex = action.frameAttachment.oldFrame.containedShapes.indexOf(action.shape);
                    if (oldFrameIndex > -1) {
                        action.frameAttachment.oldFrame.containedShapes.splice(oldFrameIndex, 1);
                        if (action.shape.group && action.shape.group.parentNode === action.frameAttachment.oldFrame.clipGroup) {
                            action.frameAttachment.oldFrame.clipGroup.removeChild(action.shape.group);
                            svg.appendChild(action.shape.group);
                        }
                    }
                }
                
                // Add to new frame if it exists
                if (action.frameAttachment.newFrame) {
                    if (!action.frameAttachment.newFrame.containedShapes.includes(action.shape)) {
                        action.frameAttachment.newFrame.containedShapes.push(action.shape);
                        action.shape.parentFrame = action.frameAttachment.newFrame;
                        if (action.shape.group && action.shape.group.parentNode === svg) {
                            svg.removeChild(action.shape.group);
                            action.frameAttachment.newFrame.clipGroup.appendChild(action.shape.group);
                        }
                    }
                } else {
                    action.shape.parentFrame = null;
                }
            }
            
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();
        }
         else if (action.shape.shapeName === 'arrow') {
            // Enhanced arrow transform redo with attachment restoration
            action.shape.startPoint = { x: action.newPos.startPoint.x, y: action.newPos.startPoint.y };
            action.shape.endPoint = { x: action.newPos.endPoint.x, y: action.newPos.endPoint.y };
            action.shape.controlPoint1 = action.newPos.controlPoint1 ? 
                { x: action.newPos.controlPoint1.x, y: action.newPos.controlPoint1.y } : null;
            action.shape.controlPoint2 = action.newPos.controlPoint2 ? 
                { x: action.newPos.controlPoint2.x, y: action.newPos.controlPoint2.y } : null;
            
            // Restore attachment state
            if (action.newPos.attachments) {
                action.shape.restoreAttachmentState(action.newPos.attachments);
            } else {
                // Clear attachments if none should exist
                action.shape.attachedToStart = null;
                action.shape.attachedToEnd = null;
            }
            
            action.shape.isSelected = false;
            action.shape.draw();
            
        } 
        else if (action.shape.type === 'icon') {
            action.shape.restore(action.newPos);
            
            // Update attached arrows after icon redo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to new state
                    if (arrowData.newAttachments) {
                        arrow.restoreAttachmentState(arrowData.newAttachments);
                    } else {
                        // If no new attachments stored, recalculate based on current icon position
                        arrow.updateAttachments();
                    }
                });
            }
        }
        else if (action.shape.shapeName === 'freehandStroke') {
            // Handle freehand stroke transform redo
            action.shape.points = JSON.parse(JSON.stringify(action.newPos.points));
            action.shape.rotation = action.newPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();
        } else if (action.shape.shapeName === "rectangle") {
            // Enhanced rectangle transform redo
            action.shape.x = action.newPos.x;
            action.shape.y = action.newPos.y;
            action.shape.height = action.newPos.height;
            action.shape.width = action.newPos.width;
            action.shape.rotation = action.newPos.rotation;
            action.shape.isSelected = false;
            if (typeof action.shape.removeSelection === 'function') action.shape.removeSelection();
            action.shape.draw();

            // Update attached arrows after rectangle redo
            if (action.affectedArrows) {
                action.affectedArrows.forEach(arrowData => {
                    const arrow = arrowData.arrow;
                    // Restore arrow attachments to new state
                    if (arrowData.newAttachments) {
                        arrow.restoreAttachmentState(arrowData.newAttachments);
                    } else {
                        // If no new attachments stored, recalculate based on current rectangle position
                        arrow.updateAttachments();
                    }
                });
            }
        }
        undoStack.push(action);
        return;
    }
    
    if (action.type === 'optionsChange') {
        if (action.shape.type === 'text') {
            // Handle text options change redo
            const textElement = (action.shape.element || action.shape).querySelector('text');
            if (textElement) {
                if (action.newOptions.color) textElement.setAttribute('fill', action.newOptions.color);
                if (action.newOptions.font) textElement.setAttribute('font-family', action.newOptions.font);
                if (action.newOptions.size) textElement.setAttribute('font-size', action.newOptions.size);
                if (action.newOptions.align) textElement.setAttribute('text-anchor', action.newOptions.align);
                
                // Update feedback if selected
                if (selectedElement === (action.shape.element || action.shape) && updateSelectionFeedback) {
                    setTimeout(updateSelectionFeedback, 0);
                }
            }
        } else if (action.shape.shapeName === 'arrow') {
            action.shape.options = { ...action.newOptions };
            action.shape.arrowOutlineStyle = action.newOptions.arrowOutlineStyle;
            action.shape.arrowHeadStyle = action.newOptions.arrowHeadStyle;
            action.shape.arrowCurved = action.newOptions.arrowCurved;
            action.shape.arrowCurveAmount = action.newOptions.arrowCurveAmount;
            action.shape.draw();
        } else {
            applyOptionsSnapshot(action.shape, action.newOptions);
        }
        undoStack.push(action);
        return;
    }
    } finally {
        refreshSelectionAfterAction();
        notifyCollaboration();
    }
}

// Optional: Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
    }
});

// Attach to buttons
document.getElementById('undo')?.addEventListener('click', undo);
document.getElementById('redo')?.addEventListener('click', redo);

// Expose globally for plain scripts
window.pushCreateAction = pushCreateAction;
window.beginUndoBatch = beginUndoBatch;
window.endUndoBatch = endUndoBatch;
window.pushDeleteAction = pushDeleteAction;
window.pushCanvasResetAction = pushCanvasResetAction;
window.invalidateCanvasResetUndo = invalidateCanvasResetUndo;
window.clearUndoHistory = clearUndoHistory;
window.rebindUndoHistory = rebindUndoHistory;
window.pushDeleteActionWithAttachments = pushDeleteActionWithAttachments;
window.pushTransformAction = pushTransformAction;
window.pushOptionsChangeAction = pushOptionsChangeAction;
window.pushCreateActionWithAttachments = pushCreateActionWithAttachments;
window.undo = undo;
window.redo = redo;
