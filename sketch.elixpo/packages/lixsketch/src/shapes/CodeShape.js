/* eslint-disable */
// CodeShape class - extracted from writeCode.js
// Depends on globals: svg, shapes, currentShape

function extractRotationFromTransform(el) {
    const t = el.getAttribute("transform") || "";
    const m = t.match(/rotate\(([^,)]+)/);
    return m ? parseFloat(m[1]) : 0;
}
function updateAttachedArrows(wrapper) {
    if (!wrapper || typeof shapes === "undefined") return;
    shapes.forEach(s => {
        if (s && s.shapeName === "arrow" && typeof s.updateAttachments === "function") {
            if ((s.attachedToStart && s.attachedToStart.shape === wrapper) ||
                (s.attachedToEnd && s.attachedToEnd.shape === wrapper)) {
                s.updateAttachments();
            }
        }
    });
}
function adjustCodeEditorSize(editor) {
    if (!editor) return;
    editor.style.height = "auto";
    editor.style.height = editor.scrollHeight + "px";
}
let isCodeDragging = false;
let hoveredCodeFrame = null;
let selectedCodeBlock = null;
function updateCodeSelectionFeedback() {}
function deselectCodeBlock() { selectedCodeBlock = null; }
function selectCodeBlock(el) { selectedCodeBlock = el; }

class CodeShape {
    constructor(groupElement) {
        this.group = groupElement;
        this.shapeName = 'code';
        this.shapeID = groupElement.getAttribute('id') || `code-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        
        // Frame attachment properties
        this.parentFrame = null;
        
        // Update group attributes — ensure data-type is set for codeTool interaction
        this.group.setAttribute('type', 'code');
        this.group.setAttribute('data-type', 'code-group');
        this.group.shapeName = 'code';
        this.group.shapeID = this.shapeID;
    }
    
    // Position and dimension properties for frame compatibility
    get x() {
        const transform = this.group.transform.baseVal.consolidate();
        return transform ? transform.matrix.e : parseFloat(this.group.getAttribute('data-x')) || 0;
    }
    
    set x(value) {
        const transform = this.group.transform.baseVal.consolidate();
        const currentY = transform ? transform.matrix.f : parseFloat(this.group.getAttribute('data-y')) || 0;
        const rotation = extractRotationFromTransform(this.group) || 0;
        const codeBlockContainer = this.group.querySelector('foreignObject');
        if (codeBlockContainer) {
            const bbox = codeBlockContainer.getBBox();
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            this.group.setAttribute('transform', `translate(${value}, ${currentY}) rotate(${rotation}, ${centerX}, ${centerY})`);
        } else {
            this.group.setAttribute('transform', `translate(${value}, ${currentY})`);
        }
        this.group.setAttribute('data-x', value);
    }
    
    get y() {
        const transform = this.group.transform.baseVal.consolidate();
        return transform ? transform.matrix.f : parseFloat(this.group.getAttribute('data-y')) || 0;
    }
    
    set y(value) {
        const transform = this.group.transform.baseVal.consolidate();
        const currentX = transform ? transform.matrix.e : parseFloat(this.group.getAttribute('data-x')) || 0;
        const rotation = extractRotationFromTransform(this.group) || 0;
        const codeBlockContainer = this.group.querySelector('foreignObject');
        if (codeBlockContainer) {
            const bbox = codeBlockContainer.getBBox();
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            this.group.setAttribute('transform', `translate(${currentX}, ${value}) rotate(${rotation}, ${centerX}, ${centerY})`);
        } else {
            this.group.setAttribute('transform', `translate(${currentX}, ${value})`);
        }
        this.group.setAttribute('data-y', value);
    }
    
    get width() {
        const codeElement = this.group.querySelector('text');
        if (codeElement) {
            return codeElement.getBBox().width;
        }
        return 0;
    }
    
    set width(value) {
        const codeBlockContainer = this.group.querySelector('foreignObject');
        if (codeBlockContainer) {
            codeBlockContainer.setAttribute('width', value);
            // This might trigger a reflow in the foreignObject content
            const codeEditor = codeBlockContainer.querySelector('.svg-code-editor');
            if (codeEditor) {
                codeEditor.style.width = `${value}px`;
                adjustCodeEditorSize(codeEditor);
            }
        }
    }
    
    get height() {
        const codeElement = this.group.querySelector('text');
        if (codeElement) {
            return codeElement.getBBox().height;
        }
        return 0;
    }
    
    set height(value) {
        const codeBlockContainer = this.group.querySelector('foreignObject');
        if (codeBlockContainer) {
            codeBlockContainer.setAttribute('height', value);
            const codeEditor = codeBlockContainer.querySelector('.svg-code-editor');
            if (codeEditor) {
                codeEditor.style.height = `${value}px`;
                adjustCodeEditorSize(codeEditor);
            }
        }
    }
    
    get rotation() {
        return extractRotationFromTransform(this.group) || 0;
    }
    
    set rotation(value) {
        const currentTransform = this.group.transform.baseVal.consolidate();
        const currentX = currentTransform ? currentTransform.matrix.e : 0;
        const currentY = currentTransform ? currentTransform.matrix.f : 0;
        const codeBlockContainer = this.group.querySelector('foreignObject');
        if (codeBlockContainer) {
            const bbox = codeBlockContainer.getBBox();
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            this.group.setAttribute('transform', `translate(${currentX}, ${currentY}) rotate(${value}, ${centerX}, ${centerY})`);
        }
    }

    move(dx, dy) {
        const currentTransform = this.group.transform.baseVal.consolidate();
        const currentX = currentTransform ? currentTransform.matrix.e : 0;
        const currentY = currentTransform ? currentTransform.matrix.f : 0;

        this.x = currentX + dx;
        this.y = currentY + dy;

        // Only update frame containment if we're actively dragging the shape itself
        // and not being moved by a parent frame
        if (isCodeDragging && !this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }

        this.updateAttachedArrows();
    }

    updateAttachedArrows() {
        updateAttachedArrows(this);
    }

    updateFrameContainment() {
        // Don't update if we're being moved by a frame
        if (this.isBeingMovedByFrame) return;
        
        let targetFrame = null;
        
        // Find which frame this shape is over
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(shape => {
                if (shape.shapeName === 'frame' && shape.isShapeInFrame(this)) {
                    targetFrame = shape;
                }
            });
        }
        
        // If we have a parent frame and we're being dragged, temporarily remove clipping
        if (this.parentFrame && isCodeDragging) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredCodeFrame && hoveredCodeFrame !== targetFrame) {
            hoveredCodeFrame.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredCodeFrame) {
            targetFrame.highlightFrame();
        }
        
        hoveredCodeFrame = targetFrame;
    }

    contains(x, y) {
        const codeElement = this.group.querySelector('text');
        if (!codeElement || typeof codeElement.getBBox !== 'function') return false;

        let bbox;
        try { bbox = codeElement.getBBox(); } catch { return false; }
        const padding = 8; // Selection padding

        const transform = this.group.getAttribute('transform') || '';
        const translate = transform.match(/translate\(\s*([^,\s)]+)[,\s]+([^\s)]+)/);
        const tx = Number.isFinite(parseFloat(this.group.getAttribute('data-x')))
            ? parseFloat(this.group.getAttribute('data-x')) : parseFloat(translate?.[1]) || 0;
        const ty = Number.isFinite(parseFloat(this.group.getAttribute('data-y')))
            ? parseFloat(this.group.getAttribute('data-y')) : parseFloat(translate?.[2]) || 0;
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        const angle = -extractRotationFromTransform(this.group) * Math.PI / 180;
        const dx = x - tx - centerX;
        const dy = y - ty - centerY;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + centerX;
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + centerY;
        
        return localX >= bbox.x - padding &&
               localX <= bbox.x + bbox.width + padding &&
               localY >= bbox.y - padding &&
               localY <= bbox.y + bbox.height + padding;
    }

    // Add draw method for consistency with other shapes
    draw() {
        if (selectedCodeBlock === this.group) {
            updateCodeSelectionFeedback();
        }
    }

    // Add methods for frame compatibility
    removeSelection() {
        if (selectedCodeBlock === this.group) {
            deselectCodeBlock();
        }
    }

    selectShape() {
        selectCodeBlock(this.group);
    }
}

export { CodeShape };
