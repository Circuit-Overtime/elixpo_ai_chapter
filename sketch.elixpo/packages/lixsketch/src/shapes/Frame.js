/* eslint-disable */
// Frame shape class - extracted from frameHolder.js
// Depends on globals: svg, shapes, currentShape, currentZoom

import { cleanupAttachments } from '../tools/arrowTool.js';
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';
import { captureFrameChildStates } from '../core/UndoRedo.js';

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

let dragOldPosFrame = null;

class Frame {
    constructor(x, y, width, height, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.rotation = options.rotation || 0;
        this.frameName = options.frameName || "Frame";
        this._frameType = options.frameType || null;
        this._webEmbedURL = options.webEmbedURL || null;
        this._webEmbedForeignObject = null;
        this._webEmbedElement = null;
        this.fillStyle = options.fillStyle || "transparent"; // 'transparent' | 'solid' | 'grid'
        this.fillColor = options.fillColor || "#1e1e28";
        this.gridSize = options.gridSize || 20;
        // Issue #38 follow-up: read the grid stroke from a CSS custom
        // property so the frame grid stays visible in both themes. The
        // var is defined in globals.css for both `body.canvas-mode`
        // (dark-on-light) and `body.canvas-mode.theme-dark` (light-on-dark).
        // The literal here is the dark-theme fallback for environments
        // (tests, embeds) without the canvas-mode CSS in scope.
        this.gridColor = options.gridColor || "var(--lixsketch-grid-fine, rgba(255,255,255,0.06))";
        this.options = {
            stroke: options.stroke || "#555",
            strokeWidth: options.strokeWidth || 1,
            fill: options.fill || "transparent",
            opacity: options.opacity || 1,
            ...options
        };

        this.element = null;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.isSelected = false;
        this.anchors = [];
        this.shapeName = "frame";
        this.shapeID = `frame-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);

        // Create clipping group for contained shapes
        this.clipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        this.clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        
        // Set up clipping
        this.clipId = `clip-${this.shapeID}`;
        this.clipPath.setAttribute('id', this.clipId);
        this.clipPath.appendChild(this.clipRect);
        this.clipGroup.setAttribute('clip-path', `url(#${this.clipId})`);
        
        // Add clip path to defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }
        defs.appendChild(this.clipPath);

        // Array to hold shapes inside this frame
        this.containedShapes = [];

        svg.appendChild(this.group);
        svg.appendChild(this.clipGroup);
        this.draw();
        this.updateClipPath();
    }

    draw() {
        // Clear previous elements
        Array.from(this.group.children).forEach((child) => {
            if (child !== this._webEmbedForeignObject) this.group.removeChild(child);
        });
        this.anchors = [];

        // Ensure defs exists for grid pattern
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }

        // Determine fill based on fillStyle
        let fillValue = "transparent";
        if (this.fillStyle === 'solid') {
            fillValue = this.fillColor;
        } else if (['hachure', 'cross-hatch', 'dots'].includes(this.fillStyle)) {
            const patternId = `frame-fill-${this.shapeID}`;
            let pattern = defs.querySelector(`#${patternId}`);
            if (!pattern) {
                pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
                pattern.setAttribute('id', patternId);
                pattern.setAttribute('patternUnits', 'userSpaceOnUse');
                defs.appendChild(pattern);
            }
            pattern.setAttribute('width', 10);
            pattern.setAttribute('height', 10);
            while (pattern.firstChild) pattern.removeChild(pattern.firstChild);
            if (this.fillStyle === 'dots') {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('cx', 5);
                dot.setAttribute('cy', 5);
                dot.setAttribute('r', 1.5);
                dot.setAttribute('fill', this.fillColor);
                pattern.appendChild(dot);
            } else {
                const hatch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                hatch.setAttribute('d', this.fillStyle === 'cross-hatch'
                    ? 'M-2 2L2-2M0 10L10 0M8 12L12 8M-2 8L2 12M0 0L10 10M8-2L12 2'
                    : 'M-2 2L2-2M0 10L10 0M8 12L12 8');
                hatch.setAttribute('fill', 'none');
                hatch.setAttribute('stroke', this.fillColor);
                hatch.setAttribute('stroke-width', 1.5);
                pattern.appendChild(hatch);
            }
            fillValue = `url(#${patternId})`;
        } else if (this.fillStyle === 'grid') {
            // Create or update a grid pattern unique to this frame
            const patternId = `frame-grid-${this.shapeID}`;
            let pattern = defs.querySelector(`#${patternId}`);
            if (!pattern) {
                pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
                pattern.setAttribute('id', patternId);
                pattern.setAttribute('patternUnits', 'userSpaceOnUse');
                defs.appendChild(pattern);
            }
            // Update pattern attributes
            pattern.setAttribute('x', this.x);
            pattern.setAttribute('y', this.y);
            pattern.setAttribute('width', this.gridSize);
            pattern.setAttribute('height', this.gridSize);
            // Clear and rebuild pattern content
            while (pattern.firstChild) pattern.removeChild(pattern.firstChild);
            // Background fill
            const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bgRect.setAttribute('width', this.gridSize);
            bgRect.setAttribute('height', this.gridSize);
            bgRect.setAttribute('fill', this.fillColor);
            pattern.appendChild(bgRect);
            // Grid lines
            const gridPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            gridPath.setAttribute('d', `M ${this.gridSize} 0 L 0 0 0 ${this.gridSize}`);
            gridPath.setAttribute('fill', 'none');
            gridPath.setAttribute('stroke', this.gridColor);
            gridPath.setAttribute('stroke-width', '0.5');
            pattern.appendChild(gridPath);
            fillValue = `url(#${patternId})`;
        }

        // Create the frame rectangle
        const frameRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        frameRect.setAttribute("x", this.x);
        frameRect.setAttribute("y", this.y);
        frameRect.setAttribute("width", this.width);
        frameRect.setAttribute("height", this.height);
        frameRect.setAttribute("stroke", this.options.stroke);
        frameRect.setAttribute("stroke-width", this.options.strokeWidth);
        frameRect.setAttribute("fill", fillValue);
        frameRect.setAttribute("opacity", this.options.opacity);
        frameRect.setAttribute("stroke-dasharray", "5,5");
        frameRect.classList.add("frame-rect");

        // Apply rotation
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            frameRect.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        }

        this.element = frameRect;
        this.group.appendChild(this.element);

        if (this._frameType === 'web-embed' && this._webEmbedURL) {
            this._updateWebEmbed();
            // Keep the frame outline above the embedded document so it remains selectable.
            this.group.appendChild(this.element);
        }

        // Add label
        this.addFrameLabel();

        // Re-attach frame image if present
        if (this._frameImageURL) {
            this.setImageFromURL(this._frameImageURL, this._frameImageFit || 'cover');
        }

        // Add selection anchors if selected
        if (this.isSelected) {
            this.addAnchors();
        }

        // Update clip path
        this.updateClipPath();
    }

    updateAttachedArrows() {
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(shape => {
            if (shape.shapeName === 'arrow') {
                let needsUpdate = false;
                
                // Check if arrow is attached to this frame
                if (shape.attachedToStart && shape.attachedToStart.shape === this) {
                    needsUpdate = true;
                }
                if (shape.attachedToEnd && shape.attachedToEnd.shape === this) {
                    needsUpdate = true;
                }
                
                if (needsUpdate) {
                    shape.updateAttachments();
                }
            }
        });
    }
    }

    updateClipPath() {
        // Update the clipping rectangle to match frame dimensions
        this.clipRect.setAttribute("x", this.x);
        this.clipRect.setAttribute("y", this.y);
        this.clipRect.setAttribute("width", this.width);
        this.clipRect.setAttribute("height", this.height);
        
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            this.clipRect.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        } else {
            this.clipRect.removeAttribute("transform");
        }
    }

    setWebEmbedURL(url) {
        this._webEmbedURL = url;
        this._frameType = 'web-embed';
        this._updateWebEmbed();
    }

    _updateWebEmbed() {
        if (!this._webEmbedURL) return;
        if (!this._webEmbedForeignObject) {
            const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
            const embed = document.createElementNS('http://www.w3.org/1999/xhtml', 'embed');
            host.style.cssText = 'width:100%;height:100%;overflow:hidden;background:#fff;border-radius:4px';
            embed.setAttribute('type', 'text/html'); embed.setAttribute('width', '100%'); embed.setAttribute('height', '100%');
            embed.setAttribute('src', this._webEmbedURL); embed.setAttribute('title', this.frameName || 'Web embed');
            host.appendChild(embed); foreign.appendChild(host);
            this._webEmbedForeignObject = foreign; this._webEmbedElement = embed;
            this.group.insertBefore(foreign, this.element || null);
        } else if (this._webEmbedElement?.getAttribute('src') !== this._webEmbedURL) {
            this._webEmbedElement.setAttribute('src', this._webEmbedURL);
        }
        const inset = 2;
        this._webEmbedForeignObject.setAttribute('x', this.x + inset);
        this._webEmbedForeignObject.setAttribute('y', this.y + inset);
        this._webEmbedForeignObject.setAttribute('width', Math.max(0, this.width - inset * 2));
        this._webEmbedForeignObject.setAttribute('height', Math.max(0, this.height - inset * 2));
        if (this.rotation) {
            this._webEmbedForeignObject.setAttribute('transform', `rotate(${this.rotation}, ${this.x + this.width / 2}, ${this.y + this.height / 2})`);
        } else this._webEmbedForeignObject.removeAttribute('transform');
    }

    addShapeToFrame(shape) {
    if (this._frameType === 'web-embed') return;
    if (shape && !this.containedShapes.includes(shape)) {
        const oldFrame = shape.parentFrame;

        // Remove from other frames first
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(otherFrame => {
                if (otherFrame.shapeName === 'frame' && otherFrame !== this) {
                    otherFrame.removeShapeFromFrame(shape);
                }
            });
        }

        this.containedShapes.push(shape);
        shape.parentFrame = this;

        // Only move to clipped group if not currently being dragged
        const el = shape.group || shape.element;
        if (el && el.parentNode && !shape.isDraggedOutTemporarily) {
            el.parentNode.removeChild(el);
            this.clipGroup.appendChild(el);
        }

        // For sub-frames, also move their clipGroup into our clipGroup
        if (shape.shapeName === 'frame' && shape.clipGroup) {
            if (shape.clipGroup.parentNode) {
                shape.clipGroup.parentNode.removeChild(shape.clipGroup);
            }
            this.clipGroup.appendChild(shape.clipGroup);
        }
    }
}

    removeShapeFromFrame(shape) {
    const index = this.containedShapes.indexOf(shape);
    if (index > -1) {
        this.containedShapes.splice(index, 1);
        if (shape.parentFrame === this) {
            shape.parentFrame = null;
        }

        // Move shape's group/element back to main SVG if it's in the clipped group
        const el = shape.group || shape.element;
        if (el && el.parentNode === this.clipGroup) {
            this.clipGroup.removeChild(el);
            svg.appendChild(el);
        }

        // For sub-frames, also move their clipGroup back to main SVG
        if (shape.shapeName === 'frame' && shape.clipGroup && shape.clipGroup.parentNode === this.clipGroup) {
            this.clipGroup.removeChild(shape.clipGroup);
            svg.appendChild(shape.clipGroup);
        }

        delete shape.isDraggedOutTemporarily;
    }
}

    // Check if a point is inside the frame bounds
    isPointInFrame(x, y) {
        // Simple bounding box check (can be enhanced for rotation)
        return x >= this.x && x <= this.x + this.width &&
               y >= this.y && y <= this.y + this.height;
    }

    // Check if a shape overlaps with this frame
    isShapeInFrame(shape) {
    if (this._frameType === 'web-embed' || !shape || shape === this) return false;
    
    const shapeX = shape.x || 0;
    const shapeY = shape.y || 0;
    const shapeWidth = shape.width || 0;
    const shapeHeight = shape.height || 0;
    
    // Check if the center of the shape is inside the frame (for better UX)
    const shapeCenterX = shapeX + shapeWidth / 2;
    const shapeCenterY = shapeY + shapeHeight / 2;
    
    return shapeCenterX >= this.x && shapeCenterX <= this.x + this.width &&
           shapeCenterY >= this.y && shapeCenterY <= this.y + this.height;
}

updateContainedShapes(applyClipping = true) {
    if (this._frameType === 'web-embed') return;
    // Check all shapes to see if they should be in this frame
    if (typeof shapes === 'undefined' || !Array.isArray(shapes)) return;
    shapes.forEach(shape => {
        if (shape !== this) {
            // Skip frames that are larger than or equal to this frame (prevent parent containing child loops)
            if (shape.shapeName === 'frame') {
                const shapeArea = (shape.width || 0) * (shape.height || 0);
                const thisArea = (this.width || 0) * (this.height || 0);
                if (shapeArea >= thisArea) return;
            }
            const isInFrame = this.isShapeInFrame(shape);
            const isAlreadyContained = this.containedShapes.includes(shape);

            if (isInFrame && !isAlreadyContained) {
                this.addShapeToFrame(shape);
                // Don't apply clipping if we're not supposed to
                if (!applyClipping) {
                    const el = shape.group || shape.element;
                    if (el && el.parentNode === this.clipGroup) {
                        this.clipGroup.removeChild(el);
                        svg.appendChild(el);
                        shape.isDraggedOutTemporarily = true;
                    }
                }
            } else if (!isInFrame && isAlreadyContained) {
                this.removeShapeFromFrame(shape);
            }
        }
    });
    
    // Update clip path
    this.updateClipPath();
}

highlightFrame() {
    if (this.element) {
        this.element.setAttribute('stroke', '#5B57D1');
        this.element.setAttribute('stroke-width', '3');
        this.element.setAttribute('opacity', '0.7');
    }
}

// Remove frame highlight
removeHighlight() {
    if (this.element) {
        this.element.setAttribute('stroke', this.options.stroke);
        this.element.setAttribute('stroke-width', this.options.strokeWidth);
        this.element.setAttribute('opacity', this.options.opacity);
    }
}
    

move(dx, dy) {
    this.x += dx;
    this.y += dy;

    // Move all contained shapes with the frame
    this.containedShapes.forEach(shape => {
        if (shape) {
            // Mark shape as being moved by frame to prevent frame containment updates
            shape.isBeingMovedByFrame = true;

            // Use shape's own move method for proper handling of all shape types
            if (typeof shape.move === 'function') {
                shape.move(dx, dy);
            } else {
                shape.x += dx;
                shape.y += dy;
            }

            // Line.move() batches its own render to one animation frame.
            // Calling draw() here would regenerate it immediately as well.
            if (shape.shapeName !== 'line' && typeof shape.draw === 'function') {
                shape.draw();
            }

            // Update bounding box for freehand strokes
            if (typeof shape.updateBoundingBox === 'function') {
                shape.updateBoundingBox();
            }

            // Remove the flag after movement
            delete shape.isBeingMovedByFrame;
        }
    });

    // Update arrows attached to this frame
    this.updateAttachedArrows();

    this.draw();
    this.updateClipPath();
}

finalizeMove() {
    this.containedShapes.forEach(shape => {
        if (shape && typeof shape.finalizeMove === 'function') {
            shape.finalizeMove();
        }
    });
}

    handleResizeLegacy(anchorIndex, currentPos, startPos, initialFrame) {
    // Legacy version - superseded by the handleResize below with contained shapes scaling
    const dx = currentPos.x - startPos.x;
    const dy = currentPos.y - startPos.y;

    switch (anchorIndex) {
        case 0: this.x = initialFrame.x + dx; this.y = initialFrame.y + dy; this.width = Math.max(10, initialFrame.width - dx); this.height = Math.max(10, initialFrame.height - dy); break;
        case 1: this.y = initialFrame.y + dy; this.height = Math.max(10, initialFrame.height - dy); break;
        case 2: this.y = initialFrame.y + dy; this.width = Math.max(10, initialFrame.width + dx); this.height = Math.max(10, initialFrame.height - dy); break;
        case 3: this.width = Math.max(10, initialFrame.width + dx); break;
        case 4: this.width = Math.max(10, initialFrame.width + dx); this.height = Math.max(10, initialFrame.height + dy); break;
        case 5: this.height = Math.max(10, initialFrame.height + dy); break;
        case 6: this.x = initialFrame.x + dx; this.width = Math.max(10, initialFrame.width - dx); this.height = Math.max(10, initialFrame.height + dy); break;
        case 7: this.x = initialFrame.x + dx; this.width = Math.max(10, initialFrame.width - dx); break;
    }
    this.updateAttachedArrows();
    this.updateContainedShapes();
}
    destroy() {
        const isDiagramFrame = !!this._diagramType;

        [...this.containedShapes].forEach(shape => {
            if (isDiagramFrame) {
                // Diagram/graph frame: destroy contained shapes with the frame
                if (typeof window.cleanupAttachments === 'function') {
                    window.cleanupAttachments(shape);
                }
                const el = shape.group || shape.element;
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
                if (shape.shapeName === 'frame') {
                    if (shape.clipGroup && shape.clipGroup.parentNode) {
                        shape.clipGroup.parentNode.removeChild(shape.clipGroup);
                    }
                    if (shape.clipPath && shape.clipPath.parentNode) {
                        shape.clipPath.parentNode.removeChild(shape.clipPath);
                    }
                }
                const idx = shapes.indexOf(shape);
                if (idx > -1) {
                    shapes.splice(idx, 1);
                }
            } else {
                // Regular frame: release contained shapes back to canvas
                const el = shape.group || shape.element;
                if (el) {
                    if (el.parentNode === this.clipGroup) {
                        this.clipGroup.removeChild(el);
                    }
                    svg.appendChild(el);
                }
                if (shape.shapeName === 'frame' && shape.clipGroup) {
                    if (shape.clipGroup.parentNode === this.clipGroup) {
                        this.clipGroup.removeChild(shape.clipGroup);
                    }
                    svg.appendChild(shape.clipGroup);
                }
            }
            shape.parentFrame = null;
            delete shape.isBeingMovedByFrame;
        });
        this.containedShapes = [];

        // Remove clip path
        if (this.clipPath && this.clipPath.parentNode) {
            this.clipPath.parentNode.removeChild(this.clipPath);
        }

        // Remove groups (clipGroup should be empty now)
        if (this.clipGroup && this.clipGroup.parentNode) {
            this.clipGroup.parentNode.removeChild(this.clipGroup);
        }

        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }

        const index = shapes.indexOf(this);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        if (currentShape === this) {
            currentShape = null;
        }
    }

    addFrameLabel() {
    const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelText.setAttribute("x", this.x + 5);
    labelText.setAttribute("y", this.y - 10);
    labelText.setAttribute("font-size", `${16 / currentZoom}px`);
    labelText.setAttribute("fill", this.options.labelColor || this.options.stroke);
    labelText.setAttribute("font-family", "lixFont");
    labelText.textContent = this.frameName || "Frame";
    labelText.style.cursor = "pointer";
    labelText.style.userSelect = "none";
    labelText.style.pointerEvents = "all";
    
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        labelText.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }
    
    // Do not let the first click select/redraw the frame: replacing the label
    // between clicks prevents the browser from ever emitting `dblclick`.
    labelText.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelText.addEventListener('click', (e) => e.stopPropagation());

    // Add double-click event for renaming
    labelText.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startLabelEdit(labelText);
    });
    
    this.group.appendChild(labelText);
    this.labelElement = labelText;
}

startLabelEdit(labelElement) {
    if (this._labelEditor) {
        this._labelEditor.querySelector('input')?.focus();
        return;
    }
    // Create a foreignObject to hold an HTML input
    const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    foreignObject.setAttribute("x", this.x + 5);
    foreignObject.setAttribute("y", this.y - 20);
    foreignObject.setAttribute("width", Math.max(100, this.width - 10));
    foreignObject.setAttribute("height", 20);
    
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        foreignObject.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }
    
    // Create input element
    const input = document.createElement("input");
    input.type = "text";
    input.value = this.frameName || "Frame";
    const oldName = this.frameName; // Store old name for undo
    
    input.style.cssText = `
        position: absolute;
        width: 100%;
        height: 20px;
        border: 1px solid #5B57D1;
        background: transparent;
        color: ${this.options.stroke};
        font-family: "lixFont";
        font-size: ${15 / currentZoom}px;
        padding: 2px 10px;
        margin: 0;
        outline: none;
        border-radius: 2px;
        box-sizing: border-box;
    `;
    
    foreignObject.appendChild(input);
    this.group.appendChild(foreignObject);
    this._labelEditor = foreignObject;
    
    // Hide the original label
    labelElement.style.display = "none";
    
    // Focus and select the text
    setTimeout(() => {
        input.focus();
        input.select();
    }, 10);
    
    let finished = false;
    const finishEdit = () => {
        if (finished) return;
        finished = true;
        const newName = input.value.trim() || "Frame";
        
        // Track name change in undo system if it actually changed
        if (newName !== oldName) {
            pushTransformAction(this, 
                { 
                    x: this.x, 
                    y: this.y, 
                    width: this.width, 
                    height: this.height, 
                    rotation: this.rotation,
                    frameName: oldName 
                },
                { 
                    x: this.x, 
                    y: this.y, 
                    width: this.width, 
                    height: this.height, 
                    rotation: this.rotation,
                    frameName: newName 
                }
            );
        }
        
        this.frameName = newName;
        
        // Remove the input
        foreignObject.remove();
        this._labelEditor = null;
        
        // Show and update the label
        labelElement.style.display = "block";
        labelElement.textContent = this.frameName;
        
        this.labelElement = labelElement;
    };
    
    // Handle input events
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finished = true;
            // Cancel edit - restore original name
            foreignObject.remove();
            this._labelEditor = null;
            labelElement.style.display = "block";
        }
    });
    
    // Prevent the input from interfering with other interactions
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('pointermove', (e) => e.stopPropagation());
    input.addEventListener('pointerup', (e) => e.stopPropagation());
}
    selectFrame() {
        this.isSelected = true;
        this.draw();
        this._showSidebar();
    }

    _showSidebar() {
        // React sidebar bridge
        if (window.__showSidebarForShape) {
            window.__showSidebarForShape('frame');
        }

        const sidebar = document.getElementById('frameSideBar');
        const renameInput = document.getElementById('frameRenameInput');
        const resizeBtn = document.getElementById('frameResizeToFit');
        if (!sidebar) return;

        sidebar.classList.remove('hidden');

        if (renameInput) {
            renameInput.value = this.frameName || 'Frame';
            // Replace old listener by cloning
            const newInput = renameInput.cloneNode(true);
            renameInput.parentNode.replaceChild(newInput, renameInput);
            newInput.addEventListener('input', () => {
                const val = newInput.value.trim() || 'Frame';
                this.frameName = val;
                if (this.labelElement) this.labelElement.textContent = val;
            });
            newInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') newInput.blur();
            });
            newInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        }

        if (resizeBtn) {
            const newBtn = resizeBtn.cloneNode(true);
            resizeBtn.parentNode.replaceChild(newBtn, resizeBtn);
            newBtn.addEventListener('click', () => this.resizeToFit());
        }
    }

    resizeToFit() {
        if (this.containedShapes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.containedShapes.forEach(shape => {
            if (shape.shapeName === 'arrow' || shape.shapeName === 'line') {
                [shape.startPoint, shape.endPoint].filter(Boolean).forEach(p => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
            } else if (typeof shape.x === 'number' && typeof shape.y === 'number') {
                const w = shape.width || 0;
                const h = shape.height || 0;
                minX = Math.min(minX, shape.x);
                minY = Math.min(minY, shape.y);
                maxX = Math.max(maxX, shape.x + w);
                maxY = Math.max(maxY, shape.y + h);
            }
        });

        if (!isFinite(minX)) return;

        const padding = 20;
        const oldState = { x: this.x, y: this.y, width: this.width, height: this.height, rotation: this.rotation };
        oldState.containedShapes = captureFrameChildStates(this);

        this.x = minX - padding;
        this.y = minY - padding;
        this.width = (maxX - minX) + padding * 2;
        this.height = (maxY - minY) + padding * 2;

        pushTransformAction(this, oldState, { x: this.x, y: this.y, width: this.width, height: this.height, rotation: this.rotation });
        this.draw();
        this.updateClipPath();
        this.updateContainedShapes();
    }

    removeSelection() {
        this.anchors.forEach(anchor => {
            if (anchor.parentNode) {
                anchor.parentNode.removeChild(anchor);
            }
        });
        this.anchors = [];
        this.isSelected = false;
        this.draw();
        const sidebar = document.getElementById('frameSideBar');
        if (sidebar) sidebar.classList.add('hidden');
    }

    addAnchors() {
    const anchorSize = 8 / currentZoom;
    const anchorStrokeWidth = 2;

    // Calculate anchor positions (corners + midpoints + rotation handle)
    const anchorPositions = [
        { x: this.x, y: this.y, cursor: 'nw-resize', type: 'corner' }, // Top-left
        { x: this.x + this.width / 2, y: this.y, cursor: 'n-resize', type: 'edge' }, // Top-middle
        { x: this.x + this.width, y: this.y, cursor: 'ne-resize', type: 'corner' }, // Top-right
        { x: this.x + this.width, y: this.y + this.height / 2, cursor: 'e-resize', type: 'edge' }, // Right-middle
        { x: this.x + this.width, y: this.y + this.height, cursor: 'se-resize', type: 'corner' }, // Bottom-right
        { x: this.x + this.width / 2, y: this.y + this.height, cursor: 's-resize', type: 'edge' }, // Bottom-middle
        { x: this.x, y: this.y + this.height, cursor: 'sw-resize', type: 'corner' }, // Bottom-left
        { x: this.x, y: this.y + this.height / 2, cursor: 'w-resize', type: 'edge' }, // Left-middle
    ];

    // Add rotation handle
    const rotationHandleDistance = 30 / currentZoom;
    const rotationHandle = {
        x: this.x + this.width / 2,
        y: this.y - rotationHandleDistance,
        cursor: 'grab',
        type: 'rotation'
    };
    anchorPositions.push(rotationHandle);

    // Create selection outline first (behind anchors)
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outline.setAttribute('class', 'selection-outline');
    outline.setAttribute('x', this.x);
    outline.setAttribute('y', this.y);
    outline.setAttribute('width', this.width);
    outline.setAttribute('height', this.height);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#5B57D1');
    outline.setAttribute('stroke-width', 1.5);
    outline.setAttribute('vector-effect', 'non-scaling-stroke');
    outline.setAttribute('stroke-dasharray', '4 2');
    outline.setAttribute('style', 'pointer-events: none;');

    // Apply rotation to outline if needed
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        outline.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }

    this.group.appendChild(outline);
    this.selectionOutline = outline;

    anchorPositions.forEach((position, index) => {
        let anchor;
        
        if (position.type === 'rotation') {
            // Create rotation handle (circle)
            anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            anchor.setAttribute("cx", position.x);
            anchor.setAttribute("cy", position.y);
            anchor.setAttribute("r", anchorSize);
            anchor.setAttribute("fill", "#121212");  
            anchor.setAttribute("stroke", "#5B57D1"); 
            anchor.setAttribute("stroke-width", anchorStrokeWidth);
            anchor.setAttribute("vector-effect", "non-scaling-stroke");
            anchor.setAttribute("class", "rotate-anchor");

            // Add rotation line
            const rotationLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            rotationLine.setAttribute("x1", this.x + this.width / 2);
            rotationLine.setAttribute("y1", this.y);
            rotationLine.setAttribute("x2", position.x);
            rotationLine.setAttribute("y2", position.y);
            rotationLine.setAttribute("stroke", "#5B57D1"); 
            rotationLine.setAttribute("stroke-width", anchorStrokeWidth);
            rotationLine.setAttribute("vector-effect", "non-scaling-stroke");

            // Apply rotation to rotation line if needed
            if (this.rotation !== 0) {
                const centerX = this.x + this.width / 2;
                const centerY = this.y + this.height / 2;
                rotationLine.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
            }
            
            this.group.appendChild(rotationLine);
            registerRotationAnchor(anchor, {
                radius: 8,
                edgeY: this.y,
                line: rotationLine,
                lineEnd: '2',
            });
        } else {
            // Create resize handle (rectangle)
            anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            anchor.setAttribute("x", position.x - anchorSize / 2);
            anchor.setAttribute("y", position.y - anchorSize / 2);
            anchor.setAttribute("width", anchorSize);
            anchor.setAttribute("height", anchorSize);
            anchor.setAttribute("fill", "#121212");  
            anchor.setAttribute("stroke", "#5B57D1"); 
            anchor.setAttribute("stroke-width", anchorStrokeWidth);
            anchor.setAttribute("vector-effect", "non-scaling-stroke");
            anchor.setAttribute("class", "anchor");
        }

        // Apply rotation to anchor if needed
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            anchor.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        }

        anchor.style.cursor = position.cursor;
        anchor.addEventListener('pointerdown', (e) => this.startAnchorDrag(e, index));
        
        this.anchors.push(anchor);
        this.group.appendChild(anchor);
    });
    }

    startAnchorDrag(e, index) {
        e.stopPropagation();
        e.preventDefault();

        // Store initial state for undo
        dragOldPosFrame = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotation: this.rotation,
            containedShapes: captureFrameChildStates(this),
        };

        const startMousePos = getSVGCoordsFromMouse(e);
        const initialFrame = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotation: this.rotation
        };

        const onPointerMove = (event) => {
            const currentMousePos = getSVGCoordsFromMouse(event);
            
            if (index === 8) { // Rotation handle
                this.handleRotation(currentMousePos, initialFrame);
            } else {
                this.handleResize(index, currentMousePos, startMousePos, initialFrame);
            }
            
            this.draw();
            this.updateContainedShapes();
        };

        const onPointerUp = () => {
            if (dragOldPosFrame) {
                const newPos = {
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    rotation: this.rotation
                };
                pushTransformAction(this, dragOldPosFrame, newPos);
                dragOldPosFrame = null;
            }
            
            svg.removeEventListener('pointermove', onPointerMove);
            svg.removeEventListener('pointerup', onPointerUp);
            svg.style.cursor = 'default';
        };

        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
    }

    handleRotation(mousePos, initialFrame) {
        const centerX = initialFrame.x + initialFrame.width / 2;
        const centerY = initialFrame.y + initialFrame.height / 2;
        
        const angle = Math.atan2(mousePos.y - centerY, mousePos.x - centerX);
        const newRotation = (angle * 180 / Math.PI + 90) % 360;
        const angleDiff = newRotation - this.rotation;
        const angleRad = angleDiff * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const sinAngle = Math.sin(angleRad);
        
        // Store the rotation center for contained shapes
        const rotationCenter = { x: centerX, y: centerY };
        
        // Rotate all contained shapes around the frame's center
        this.containedShapes.forEach(shape => {
            if (!shape) return;
            
            // Mark shape as being moved by frame to prevent frame containment updates
            shape.isBeingMovedByFrame = true;
            
            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                case 'image':
                case 'icon':
                    // Get shape's current center
                    const shapeCenterX = shape.x + shape.width / 2;
                    const shapeCenterY = shape.y + shape.height / 2;
                    
                    // Calculate relative position from rotation center
                    const relativeX = shapeCenterX - rotationCenter.x;
                    const relativeY = shapeCenterY - rotationCenter.y;
                    
                    // Apply rotation to get new center position
                    const newCenterX = rotationCenter.x + (relativeX * cosAngle - relativeY * sinAngle);
                    const newCenterY = rotationCenter.y + (relativeX * sinAngle + relativeY * cosAngle);
                    
                    // Update shape position
                    shape.x = newCenterX - shape.width / 2;
                    shape.y = newCenterY - shape.height / 2;
                    shape.rotation = (shape.rotation || 0) + angleDiff;
                    
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'circle':
                    // Get circle's center
                    const circleCenterX = shape.x;
                    const circleCenterY = shape.y;
                    
                    // Calculate relative position from rotation center
                    const relativeCircleX = circleCenterX - rotationCenter.x;
                    const relativeCircleY = circleCenterY - rotationCenter.y;
                    
                    // Apply rotation
                    const newCircleCenterX = rotationCenter.x + (relativeCircleX * cosAngle - relativeCircleY * sinAngle);
                    const newCircleCenterY = rotationCenter.y + (relativeCircleX * sinAngle + relativeCircleY * cosAngle);
                    
                    shape.x = newCircleCenterX;
                    shape.y = newCircleCenterY;
                    shape.rotation = (shape.rotation || 0) + angleDiff;
                    
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'line':
                case 'arrow':
                    // Calculate relative positions for start and end points
                    const relativeStartX = shape.startPoint.x - rotationCenter.x;
                    const relativeStartY = shape.startPoint.y - rotationCenter.y;
                    const relativeEndX = shape.endPoint.x - rotationCenter.x;
                    const relativeEndY = shape.endPoint.y - rotationCenter.y;
                    
                    // Apply rotation to both points
                    const newStartX = rotationCenter.x + (relativeStartX * cosAngle - relativeStartY * sinAngle);
                    const newStartY = rotationCenter.y + (relativeStartX * sinAngle + relativeStartY * cosAngle);
                    const newEndX = rotationCenter.x + (relativeEndX * cosAngle - relativeEndY * sinAngle);
                    const newEndY = rotationCenter.y + (relativeEndX * sinAngle + relativeEndY * cosAngle);
                    
                    shape.startPoint.x = newStartX;
                    shape.startPoint.y = newStartY;
                    shape.endPoint.x = newEndX;
                    shape.endPoint.y = newEndY;
                    
                    if (shape.shapeName === 'arrow' && shape.arrowCurved && typeof shape.initializeCurveControlPoints === 'function') {
                        shape.initializeCurveControlPoints();
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'text':
                case 'code':
                    // Get text/code bounds for center calculation
                    const textOrCodeEl = shape.group ? (shape.group.querySelector('text') || shape.group.querySelector('foreignObject')) : null;
                    if (textOrCodeEl) {
                        const bbox = textOrCodeEl.getBBox();
                        const transform = shape.group.transform.baseVal.consolidate();
                        const matrix = transform ? transform.matrix : { e: 0, f: 0 };

                        const textCenterX = bbox.x + matrix.e + bbox.width / 2;
                        const textCenterY = bbox.y + matrix.f + bbox.height / 2;

                        // Calculate relative position
                        const relativeTextX = textCenterX - rotationCenter.x;
                        const relativeTextY = textCenterY - rotationCenter.y;

                        // Apply rotation
                        const newTextCenterX = rotationCenter.x + (relativeTextX * cosAngle - relativeTextY * sinAngle);
                        const newTextCenterY = rotationCenter.y + (relativeTextX * sinAngle + relativeTextY * cosAngle);

                        // Update position
                        const newTransformX = newTextCenterX - bbox.width / 2;
                        const newTransformY = newTextCenterY - bbox.height / 2;
                        const newShapeRotation = (shape.rotation || 0) + angleDiff;

                        const textCenterRelativeX = bbox.width / 2;
                        const textCenterRelativeY = bbox.height / 2;

                        shape.group.setAttribute('transform',
                            `translate(${newTransformX}, ${newTransformY}) rotate(${newShapeRotation}, ${textCenterRelativeX}, ${textCenterRelativeY})`
                        );

                        shape.x = newTransformX;
                        shape.y = newTransformY;
                        shape.rotation = newShapeRotation;
                    }
                    break;
                    
                case 'freehandStroke':
                    if (shape.points && Array.isArray(shape.points)) {
                        // Rotate each point in the stroke
                        shape.points = shape.points.map(point => {
                            if (!Array.isArray(point) || point.length < 2) return point;
                            
                            const relativePointX = point[0] - rotationCenter.x;
                            const relativePointY = point[1] - rotationCenter.y;
                            
                            const newPointX = rotationCenter.x + (relativePointX * cosAngle - relativePointY * sinAngle);
                            const newPointY = rotationCenter.y + (relativePointX * sinAngle + relativePointY * cosAngle);
                            
                            return [newPointX, newPointY, point[2] || 0.5];
                        });
                        
                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }
                        if (typeof shape.draw === 'function') {
                            shape.draw();
                        }
                    }
                    break;
            }
            
            // Update arrows attached to the contained shape
            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
            
            // Remove the flag after rotation
            delete shape.isBeingMovedByFrame;
        });
        
        // Update the frame's rotation
        this.rotation = newRotation;
        
        // Update arrows attached to this frame
        this.updateAttachedArrows();
    }

    handleResize(anchorIndex, currentPos, startPos, initialFrame) {
        const rawDx = currentPos.x - startPos.x;
        const rawDy = currentPos.y - startPos.y;

        // Rotate delta to local (unrotated) space when frame is rotated
        const rad = (this.rotation || 0) * Math.PI / 180;
        const cosR = Math.cos(rad);
        const sinR = Math.sin(rad);
        const dx = rawDx * cosR + rawDy * sinR;
        const dy = -rawDx * sinR + rawDy * cosR;

        // Store old frame for scale calculation
        const oldX = this.x, oldY = this.y, oldW = this.width, oldH = this.height;

        // Compute new dimensions using local-space deltas
        let newW, newH;
        // Fixed corner relative to initial frame origin: (fixRelX, fixRelY)
        let fixRelX, fixRelY;

        switch (anchorIndex) {
            case 0: // Top-left
                newW = Math.max(10, initialFrame.width - dx);
                newH = Math.max(10, initialFrame.height - dy);
                fixRelX = initialFrame.width; fixRelY = initialFrame.height;
                break;
            case 1: // Top-middle
                newW = initialFrame.width;
                newH = Math.max(10, initialFrame.height - dy);
                fixRelX = 0; fixRelY = initialFrame.height;
                break;
            case 2: // Top-right
                newW = Math.max(10, initialFrame.width + dx);
                newH = Math.max(10, initialFrame.height - dy);
                fixRelX = 0; fixRelY = initialFrame.height;
                break;
            case 3: // Right-middle
                newW = Math.max(10, initialFrame.width + dx);
                newH = initialFrame.height;
                fixRelX = 0; fixRelY = 0;
                break;
            case 4: // Bottom-right
                newW = Math.max(10, initialFrame.width + dx);
                newH = Math.max(10, initialFrame.height + dy);
                fixRelX = 0; fixRelY = 0;
                break;
            case 5: // Bottom-middle
                newW = initialFrame.width;
                newH = Math.max(10, initialFrame.height + dy);
                fixRelX = 0; fixRelY = 0;
                break;
            case 6: // Bottom-left
                newW = Math.max(10, initialFrame.width - dx);
                newH = Math.max(10, initialFrame.height + dy);
                fixRelX = initialFrame.width; fixRelY = 0;
                break;
            case 7: // Left-middle
                newW = Math.max(10, initialFrame.width - dx);
                newH = initialFrame.height;
                fixRelX = initialFrame.width; fixRelY = 0;
                break;
        }

        // Compute new position using fixed-corner constraint
        if (this.rotation && this.rotation !== 0) {
            // Compute rotated world position of the fixed corner in the initial frame
            const iCX = initialFrame.x + initialFrame.width / 2;
            const iCY = initialFrame.y + initialFrame.height / 2;
            const odx = (initialFrame.x + fixRelX) - iCX;
            const ody = (initialFrame.y + fixRelY) - iCY;
            const fixedWorldX = iCX + odx * cosR - ody * sinR;
            const fixedWorldY = iCY + odx * sinR + ody * cosR;

            // Where the fixed corner sits in new rect (relative to new origin)
            const fixNewRelX = (fixRelX === 0) ? 0 : newW;
            const fixNewRelY = (fixRelY === 0) ? 0 : newH;

            // Solve for new origin
            const ncx = newW / 2;
            const ncy = newH / 2;
            const ndx = fixNewRelX - ncx;
            const ndy = fixNewRelY - ncy;
            const rotX = ncx + ndx * cosR - ndy * sinR;
            const rotY = ncy + ndx * sinR + ndy * cosR;

            this.x = fixedWorldX - rotX;
            this.y = fixedWorldY - rotY;
        } else {
            // No rotation - use simple axis-aligned position calculation
            switch (anchorIndex) {
                case 0: this.x = initialFrame.x + (initialFrame.width - newW); this.y = initialFrame.y + (initialFrame.height - newH); break;
                case 1: this.y = initialFrame.y + (initialFrame.height - newH); break;
                case 2: this.y = initialFrame.y + (initialFrame.height - newH); break;
                case 3: break;
                case 4: break;
                case 5: break;
                case 6: this.x = initialFrame.x + (initialFrame.width - newW); break;
                case 7: this.x = initialFrame.x + (initialFrame.width - newW); break;
            }
        }

        this.width = newW;
        this.height = newH;

        // Scale contained shapes proportionally so nothing falls out
        if (oldW > 0 && oldH > 0) {
            const scaleX = this.width / oldW;
            const scaleY = this.height / oldH;

            if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
                this.containedShapes.forEach(shape => {
                    if (!shape) return;
                    shape.isBeingMovedByFrame = true;

                    switch (shape.shapeName) {
                        case 'rectangle':
                        case 'image':
                        case 'icon':
                        case 'code': {
                            const relX = (shape.x - oldX) / oldW;
                            const relY = (shape.y - oldY) / oldH;
                            const relW = shape.width / oldW;
                            const relH = shape.height / oldH;
                            shape.x = this.x + relX * this.width;
                            shape.y = this.y + relY * this.height;
                            shape.width = relW * this.width;
                            shape.height = relH * this.height;
                            if (typeof shape.draw === 'function') shape.draw();
                            break;
                        }
                        case 'circle': {
                            const relCX = (shape.x - oldX) / oldW;
                            const relCY = (shape.y - oldY) / oldH;
                            shape.x = this.x + relCX * this.width;
                            shape.y = this.y + relCY * this.height;
                            shape.rx = (shape.rx / oldW) * this.width;
                            shape.ry = (shape.ry / oldH) * this.height;
                            shape.width = shape.rx * 2;
                            shape.height = shape.ry * 2;
                            if (typeof shape.draw === 'function') shape.draw();
                            break;
                        }
                        case 'arrow':
                        case 'line': {
                            const relSX = (shape.startPoint.x - oldX) / oldW;
                            const relSY = (shape.startPoint.y - oldY) / oldH;
                            const relEX = (shape.endPoint.x - oldX) / oldW;
                            const relEY = (shape.endPoint.y - oldY) / oldH;
                            shape.startPoint.x = this.x + relSX * this.width;
                            shape.startPoint.y = this.y + relSY * this.height;
                            shape.endPoint.x = this.x + relEX * this.width;
                            shape.endPoint.y = this.y + relEY * this.height;
                            if (shape.controlPoint1) {
                                const relC1X = (shape.controlPoint1.x - oldX) / oldW;
                                const relC1Y = (shape.controlPoint1.y - oldY) / oldH;
                                shape.controlPoint1.x = this.x + relC1X * this.width;
                                shape.controlPoint1.y = this.y + relC1Y * this.height;
                            }
                            if (shape.controlPoint2) {
                                const relC2X = (shape.controlPoint2.x - oldX) / oldW;
                                const relC2Y = (shape.controlPoint2.y - oldY) / oldH;
                                shape.controlPoint2.x = this.x + relC2X * this.width;
                                shape.controlPoint2.y = this.y + relC2Y * this.height;
                            }
                            if (typeof shape.draw === 'function') shape.draw();
                            break;
                        }
                        case 'text': {
                            const tx = shape.x || 0;
                            const ty = shape.y || 0;
                            const relTX = (tx - oldX) / oldW;
                            const relTY = (ty - oldY) / oldH;
                            shape.x = this.x + relTX * this.width;
                            shape.y = this.y + relTY * this.height;
                            break;
                        }
                        case 'freehandStroke': {
                            // Pie sectors are editable closed freehand polygons.
                            // Scale their source points with the frame so their
                            // geometry stays attached instead of being clipped
                            // at its previous canvas coordinates.
                            if (Array.isArray(shape.points)) {
                                shape.points = shape.points.map(point => {
                                    if (!Array.isArray(point) || point.length < 2) return point;
                                    const relPX = (point[0] - oldX) / oldW;
                                    const relPY = (point[1] - oldY) / oldH;
                                    return [
                                        this.x + relPX * this.width,
                                        this.y + relPY * this.height,
                                        point[2] || 0.5
                                    ];
                                });
                                shape._moveOffsetX = 0;
                                shape._moveOffsetY = 0;
                                if (typeof shape.draw === 'function') shape.draw();
                            }
                            break;
                        }
                    }

                    if (typeof shape.updateAttachedArrows === 'function') {
                        shape.updateAttachedArrows();
                    }
                    delete shape.isBeingMovedByFrame;
                });
            }
        }

        // Update contained shapes visibility
        this.updateContainedShapes();
    }
    
    temporarilyRemoveFromFrame(shape) {
    if (shape && shape.parentFrame === this) {
        // Move shape back to main SVG temporarily (without removing from containedShapes array)
        const el = shape.group || shape.element;
        if (el && el.parentNode === this.clipGroup) {
            this.clipGroup.removeChild(el);
            svg.appendChild(el);
        }
        shape.isDraggedOutTemporarily = true;
    }
}

// Add a method to restore clipping for a shape after drag
restoreToFrame(shape) {
    if (shape && shape.parentFrame === this && shape.isDraggedOutTemporarily) {
        // Move shape back to clipped group
        const el = shape.group || shape.element;
        if (el && el.parentNode === svg) {
            svg.removeChild(el);
            this.clipGroup.appendChild(el);
        }
        delete shape.isDraggedOutTemporarily;
    }
}


    contains(viewBoxX, viewBoxY) {
        // Simple point-in-rectangle test (without rotation for now)
        return viewBoxX >= this.x && viewBoxX <= this.x + this.width &&
               viewBoxY >= this.y && viewBoxY <= this.y + this.height;
    }

    // Arrow attachment support (similar to other shapes)
    getAttachmentPoint(point, tolerance = 20) {
        const rect = {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };

        const distances = {
            top: Math.abs(point.y - rect.top),
            bottom: Math.abs(point.y - rect.bottom),
            left: Math.abs(point.x - rect.left),
            right: Math.abs(point.x - rect.right)
        };

        let closestSide = null;
        let minDistance = tolerance;

        for (let side in distances) {
            if (distances[side] < minDistance &&
                ((side === 'top' || side === 'bottom') && point.x >= rect.left && point.x <= rect.right) ||
                ((side === 'left' || side === 'right') && point.y >= rect.top && point.y <= rect.bottom)) {
                minDistance = distances[side];
                closestSide = side;
            }
        }

        if (closestSide) {
            let attachPoint;
            const offset = { x: 0, y: 0 };

            switch (closestSide) {
                case 'top':
                    attachPoint = { x: point.x, y: rect.top };
                    offset.x = point.x - (rect.left + this.width / 2);
                    break;
                case 'bottom':
                    attachPoint = { x: point.x, y: rect.bottom };
                    offset.x = point.x - (rect.left + this.width / 2);
                    break;
                case 'left':
                    attachPoint = { x: rect.left, y: point.y };
                    offset.y = point.y - (rect.top + this.height / 2);
                    break;
                case 'right':
                    attachPoint = { x: rect.right, y: point.y };
                    offset.y = point.y - (rect.top + this.height / 2);
                    break;
            }

            return { point: attachPoint, side: closestSide, offset, shape: this };
        }

        return null;
    }

    updateStyle(newOptions) {
        Object.keys(newOptions).forEach(key => newOptions[key] === undefined && delete newOptions[key]);
        this.options = { ...this.options, ...newOptions };
        this.draw();
    }

    /**
     * Set a background image for this frame from a URL.
     * The image will fit/cover the frame dimensions.
     * @param {string} url - Image URL
     * @param {string} fit - 'cover' (default) | 'contain' | 'fill'
     */
    setImageFromURL(url, fit = 'cover') {
        if (!url) {
            // Remove existing frame image
            if (this._frameImage && this._frameImage.parentNode) {
                this._frameImage.parentNode.removeChild(this._frameImage);
                this._frameImage = null;
            }
            this._frameImageURL = null;
            return;
        }

        this._frameImageURL = url;
        this._frameImageFit = fit;

        if (!this._frameImage) {
            this._frameImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            this._frameImage.setAttribute('pointer-events', 'none');
        }
        // Always update preserveAspectRatio when fit changes
        this._frameImage.setAttribute('preserveAspectRatio',
            fit === 'cover' ? 'xMidYMid slice' :
            fit === 'contain' ? 'xMidYMid meet' :
            fit === 'center' ? 'xMidYMid meet' : 'none'
        );

        this._frameImage.setAttribute('href', url);
        this._frameImage.setAttribute('x', this.x);
        this._frameImage.setAttribute('y', this.y);
        this._frameImage.setAttribute('width', this.width);
        this._frameImage.setAttribute('height', this.height);

        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            this._frameImage.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        }

        // Insert image right after the frame rect (below contained shapes)
        if (this._frameImage.parentNode === this.group) {
            this.group.removeChild(this._frameImage);
        }
        if (this.element && this.element.nextSibling) {
            this.group.insertBefore(this._frameImage, this.element.nextSibling);
        } else {
            this.group.appendChild(this._frameImage);
        }
    }

    /**
     * Update frame image position/size (called during move/resize)
     */
    _updateFrameImage() {
        if (!this._frameImage) return;
        this._frameImage.setAttribute('x', this.x);
        this._frameImage.setAttribute('y', this.y);
        this._frameImage.setAttribute('width', this.width);
        this._frameImage.setAttribute('height', this.height);

        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            this._frameImage.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        } else {
            this._frameImage.removeAttribute('transform');
        }
    }
}

export { Frame };
