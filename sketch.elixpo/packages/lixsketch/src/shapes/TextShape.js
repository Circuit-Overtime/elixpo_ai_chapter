/* eslint-disable */
// TextShape class - extracted from writeText.js
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
let isDragging = false;
let hoveredFrameText = null;
let selectedElement = null;
function updateSelectionFeedback() {}
function deselectElement() { selectedElement = null; }
function selectElement(el) { selectedElement = el; }

function removeLegacySoftWrap(groupElement) {
    const textElement = groupElement.querySelector('text');
    if (!textElement || !textElement.hasAttribute('data-wrap-width')) return;
    const source = textElement.getAttribute('data-wrap-source');
    if (source === null) return;

    while (textElement.firstChild) textElement.removeChild(textElement.firstChild);
    const x = textElement.getAttribute('x') || 0;
    source.split('\n').forEach((line, index) => {
        const tspan = textElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', x);
        tspan.setAttribute('dy', index === 0 ? '0' : '1.2em');
        tspan.textContent = line || ' ';
        textElement.appendChild(tspan);
    });
    textElement.removeAttribute('data-wrap-width');
}

class TextShape {
    constructor(groupElement) {
        this.group = groupElement;
        removeLegacySoftWrap(groupElement);
        this.shapeName = 'text';
        this.shapeID = groupElement.getAttribute('id') || `text-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        
        // Frame attachment properties
        this.parentFrame = null;
        
        // Update group attributes — ensure data-type is set for textTool interaction
        this.group.setAttribute('type', 'text');
        this.group.setAttribute('data-type', 'text-group');
        this.group.shapeName = 'text';
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
        const textElement = this.group.querySelector('text');
        if (textElement) {
            const bbox = textElement.getBBox();
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
        const textElement = this.group.querySelector('text');
        if (textElement) {
            const bbox = textElement.getBBox();
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            this.group.setAttribute('transform', `translate(${currentX}, ${value}) rotate(${rotation}, ${centerX}, ${centerY})`);
        } else {
            this.group.setAttribute('transform', `translate(${currentX}, ${value})`);
        }
        this.group.setAttribute('data-y', value);
    }
    
    get width() {
        const textElement = this.group.querySelector('text');
        if (textElement) {
            return textElement.getBBox().width;
        }
        return 0;
    }
    
    set width(value) {
        // Text width is determined by content and font size, not directly settable
        // This is here for frame compatibility but doesn't change the text
    }
    
    get height() {
        const textElement = this.group.querySelector('text');
        if (textElement) {
            return textElement.getBBox().height;
        }
        return 0;
    }
    
    set height(value) {
        // Text height is determined by content and font size, not directly settable
        // This is here for frame compatibility but doesn't change the text
    }
    
    get rotation() {
        return extractRotationFromTransform(this.group) || 0;
    }
    
    set rotation(value) {
        const currentTransform = this.group.transform.baseVal.consolidate();
        const currentX = currentTransform ? currentTransform.matrix.e : 0;
        const currentY = currentTransform ? currentTransform.matrix.f : 0;
        const textElement = this.group.querySelector('text');
        if (textElement) {
            const bbox = textElement.getBBox();
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
        if (isDragging && !this.isBeingMovedByFrame) {
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
        if (this.parentFrame && isDragging) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameText && hoveredFrameText !== targetFrame) {
            hoveredFrameText.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameText) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameText = targetFrame;
    }

    contains(x, y) {
        const textElement = this.group.querySelector('text');
        if (!textElement || typeof textElement.getBBox !== 'function') return false;

        let bbox;
        try { bbox = textElement.getBBox(); } catch { return false; }
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
        // Text doesn't need redrawing like other shapes, but we need this method for consistency
        if (selectedElement === this.group) {
            updateSelectionFeedback();
        }
    }

    // Add methods for frame compatibility
    removeSelection() {
        // Selection is owned by textTool (selectShape delegates to it below),
        // so deselection must go through the same controller. Updating this
        // module's fallback-only selectedElement left the real text handles
        // visible when another shape was selected without Ctrl/Meta.
        if (typeof window !== 'undefined' && window.__deselectTextElement) {
            window.__deselectTextElement();
        } else if (selectedElement === this.group) {
            deselectElement();
        }
    }

    selectShape() {
        // Use the real textTool selectElement (with selection feedback) if available
        if (typeof window !== 'undefined' && window.__selectTextElement) {
            window.__selectTextElement(this.group);
        } else {
            selectElement(this.group);
        }
    }
}

export { TextShape };
