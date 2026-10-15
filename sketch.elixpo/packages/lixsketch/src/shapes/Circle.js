/* eslint-disable */
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';
import { canvasToLocal, localToCanvas } from '../core/CanvasSpace.js';
import { DEFAULT_SHAPE_LABEL_FONT_SIZE } from '../core/ShapeLabelLayout.js';
import { resolveThemeLabelColor } from '../utils/themeColors.js';
// Circle shape class - extracted from drawCircle.js
// Depends on globals: svg, shapes, rough, currentShape, currentZoom, rc

const rc = rough.svg(svg);
let isDraggingShapeCircle = false;
let isResizingShapeCircle = false;
let isRotatingShapeCircle = false;
let hoveredFrameCircle = null;
const colorOptionsCircle = document.querySelectorAll(".circleStrokeSpan");
const backgroundColorOptionsCircle = document.querySelectorAll(".circleBackgroundSpan");
const fillStyleOptionsCircle = document.querySelectorAll(".circleFillStyleSpan");
const strokeThicknessValueCircle = document.querySelectorAll(".circleStrokeThickSpan");
const outlineStyleValueCircle = document.querySelectorAll(".circleOutlineStyle");

class Circle {
    constructor(x, y, rx, ry, options = {}) {
        this.x = x; 
        this.y = y; 
        this.rx = rx; 
        this.ry = ry; 
        this.options = {
            roughness: 1.5,
            stroke: "#fff",
            strokeWidth: 2,
            fill: "transparent",
            fillStyle: "none",
            strokeDasharray: "",
            ...options
        };
        // RoughJS otherwise generates a different contour on every redraw.
        // Keep a stable contour for later edits and the final drawing render.
        if (!Number.isInteger(this.options.seed) || this.options.seed <= 0) {
            this.options.seed = Math.floor(Math.random() * 0x7fffffff) + 1;
        }
        this.element = null;
        this.isSelected = false;
        this.rotation = 0;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.anchors = [];
        this.rotationAnchor = null;
        this.selectionPadding = 8;
        this.selectionOutline = null;
        this.shapeName = "circle";
        this.shapeID = `circle-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);

        // Frame attachment properties
        this.parentFrame = null;

        // Embedded label support
        this.label = options.label || '';
        this.labelElement = null;
        this.labelColor = resolveThemeLabelColor(options.labelColor);
        this.labelFontSize = options.labelFontSize || DEFAULT_SHAPE_LABEL_FONT_SIZE;
        this._isEditingLabel = false;
        this._hitArea = null;
        this._labelBg = null;

        // Shading / gradient support for research paper style diagrams
        this.shadeColor = options.shadeColor || null;
        this.shadeOpacity = options.shadeOpacity !== undefined ? options.shadeOpacity : 0.15;
        this.shadeDirection = options.shadeDirection || 'bottom';
        this._shadeEllipse = null;
        this._shadeGradient = null;
        this.isBeingDrawn = false;
        this._drawingRenderFrame = null;
        this._isLivePreviewElement = false;

        if(!this.group.parentNode) {
            svg.appendChild(this.group);
        }
        this._lastDrawn = {
            width: null,
            height: null,
            options: null
        };
        this._setupLabelDblClick();
        this.draw();
    }

    // Add width and height properties for frame compatibility
    get width() {
        return this.rx * 2;
    }
    
    set width(value) {
        this.rx = value / 2;
    }
    
    get height() {
        return this.ry * 2;
    }
    
    set height(value) {
        this.ry = value / 2;
    }

    draw() {
        const childrenToRemove = [];
        const preserveSet = this._skipAnchors ? new Set([...this.anchors, this.selectionOutline, this.rotationAnchor].filter(Boolean)) : null;
        for (let i = 0; i < this.group.children.length; i++) {
            const child = this.group.children[i];
            if (child !== this.element && child !== this.labelElement && child !== this._hitArea && child !== this._labelBg && child !== this._shadeEllipse) {
                if (preserveSet && preserveSet.has(child)) continue;
                childrenToRemove.push(child);
            }
        }
        childrenToRemove.forEach(child => this.group.removeChild(child));
        const optionsString = JSON.stringify(this.options);
        const isInitialDraw = this.element === null;
        const sizeChanged = this.rx !== this._lastDrawn.rx || this.ry !== this._lastDrawn.ry;
        const optionsChanged = optionsString !== this._lastDrawn.options;
        if (this.isBeingDrawn) {
            if (!this._isLivePreviewElement) {
                if (this.element && this.element.parentNode === this.group) {
                    this.group.removeChild(this.element);
                }
                this.element = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                this.element.setAttribute('class', 'circle-drawing-preview');
                this.element.setAttribute('pointer-events', 'none');
                this.group.appendChild(this.element);
                this._isLivePreviewElement = true;
            }

            this.element.setAttribute('cx', 0);
            this.element.setAttribute('cy', 0);
            this.element.setAttribute('rx', this.rx);
            this.element.setAttribute('ry', this.ry);
            this.element.setAttribute('fill', this.options.fill || 'transparent');
            this.element.setAttribute('stroke', this.options.stroke || '#fff');
            this.element.setAttribute('stroke-width', this.options.strokeWidth || 2);
            this.element.setAttribute('stroke-dasharray', this.options.strokeDasharray || '');
        } else if (isInitialDraw || optionsChanged || sizeChanged || this._isLivePreviewElement) {
            if (this.element && this.element.parentNode === this.group) {
                this.group.removeChild(this.element);
            }

            const roughEllipse = rc.ellipse(0, 0, this.rx * 2, this.ry * 2, this.options);
            this.element = roughEllipse;
            this.group.appendChild(roughEllipse);
            this._isLivePreviewElement = false;

            this._lastDrawn.rx = this.rx;
            this._lastDrawn.ry = this.ry;
            this._lastDrawn.options = optionsString;
        }

        // Hit area for dblclick detection
        if (!this._hitArea) {
            this._hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            this._hitArea.setAttribute('fill', 'transparent');
            this._hitArea.setAttribute('stroke', 'none');
            this._hitArea.setAttribute('style', 'pointer-events: all;');
            this.group.insertBefore(this._hitArea, this.group.firstChild);
        }
        this._hitArea.setAttribute('cx', 0);
        this._hitArea.setAttribute('cy', 0);
        this._hitArea.setAttribute('rx', this.rx);
        this._hitArea.setAttribute('ry', this.ry);

        // Shading / gradient overlay
        this._updateShade();

        // Update embedded label
        this._updateLabelElement();

        this.group.setAttribute('transform', `translate(${this.x}, ${this.y}) rotate(${this.rotation}, 0, 0)`);
        if (this.isSelected) {
            if (this._skipAnchors) {
                this.updateSelectionControls();
            } else {
                this.addAnchors();
            }
        }
        if (!this.group.parentNode) {
            svg.appendChild(this.group);
        }
    }

    scheduleDrawingRender() {
        if (this._drawingRenderFrame !== null) return;
        if (typeof requestAnimationFrame !== 'function') {
            this.draw();
            return;
        }
        this._drawingRenderFrame = requestAnimationFrame(() => {
            this._drawingRenderFrame = null;
            this.draw();
        });
    }

    cancelDrawingRender() {
        if (this._drawingRenderFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._drawingRenderFrame);
        }
        this._drawingRenderFrame = null;
        this.isBeingDrawn = false;
    }

    finalizeDrawing() {
        this.cancelDrawingRender();
        this.draw();
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;

        // Fast path: just update the transform — no need to rebuild RoughJS element
        this.group.setAttribute('transform', `translate(${this.x}, ${this.y}) rotate(${this.rotation}, 0, 0)`);

        this.updateAttachedArrows();

        // Only update frame containment if we're actively dragging the shape itself
        // and not being moved by a parent frame
        if (isDraggingShapeCircle && !this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }
    }

    updateFrameContainment() {
        // Don't update if we're being moved by a frame
        if (this.isBeingMovedByFrame) return;
        
        let targetFrame = null;
        
        // Find which frame this shape is over
        shapes.forEach(shape => {
            if (shape.shapeName === 'frame' && shape.isShapeInFrame(this)) {
                targetFrame = shape;
            }
        });
        
        // If we have a parent frame and we're being dragged, temporarily remove clipping
        if (this.parentFrame && isDraggingShapeCircle) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameCircle && hoveredFrameCircle !== targetFrame) {
            hoveredFrameCircle.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameCircle) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameCircle = targetFrame;
    }

    getRotatedCursor(direction, angle) {
        const directions = ['ns', 'nesw', 'ew', 'nwse'];
        angle = angle % 360;
        if (angle < 0) angle += 360;

        const baseDirectionMap = {
            '0': 'nwse', '1': 'nesw', 
            '2': 'nesw', '3': 'nwse', 
            '4': 'ns',   '5': 'ns',     
            '6': 'ew',   '7': 'ew'      
        };
        const baseDirection = baseDirectionMap[direction];
        let effectiveAngle = angle; 
        if (baseDirection === 'nesw') {
            effectiveAngle += 45;
        } else if (baseDirection === 'ew') {
            effectiveAngle += 90;
        } else if (baseDirection === 'nwse') {
            effectiveAngle += 135;
        }
        effectiveAngle = effectiveAngle % 360;
        if (effectiveAngle < 0) effectiveAngle += 360;
        const index = Math.round(effectiveAngle / 45) % 4; 
         let finalIndex;
         if (effectiveAngle >= 337.5 || effectiveAngle < 22.5) finalIndex = 0; 
         else if (effectiveAngle >= 22.5 && effectiveAngle < 67.5) finalIndex = 1; 
         else if (effectiveAngle >= 67.5 && effectiveAngle < 112.5) finalIndex = 2; 
         else if (effectiveAngle >= 112.5 && effectiveAngle < 157.5) finalIndex = 3;
         else if (effectiveAngle >= 157.5 && effectiveAngle < 202.5) finalIndex = 0; 
         else if (effectiveAngle >= 202.5 && effectiveAngle < 247.5) finalIndex = 1; 
         else if (effectiveAngle >= 247.5 && effectiveAngle < 292.5) finalIndex = 2; 
         else if (effectiveAngle >= 292.5 && effectiveAngle < 337.5) finalIndex = 3; 
         else finalIndex = 0; 
        return directions[finalIndex];
    }
    addAnchors() {
        const zoom = window.currentZoom || 1;
        const anchorSize = 10 / zoom;
        const anchorStrokeWidth = 2;
        const self = this;
        const expandedX = -this.rx - this.selectionPadding;
        const expandedY = -this.ry - this.selectionPadding; 
        const expandedWidth = this.rx * 2 + 2 * this.selectionPadding;
        const expandedHeight = this.ry * 2 + 2 * this.selectionPadding;

        const positions = [
        { x: expandedX, y: expandedY }, 
        { x: expandedX + expandedWidth, y: expandedY }, 
        { x: expandedX, y: expandedY + expandedHeight }, 
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight }, 
        { x: expandedX + expandedWidth / 2, y: expandedY }, 
        { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight }, 
        { x: expandedX, y: expandedHeight / 2 + expandedY }, 
        { x: expandedX + expandedWidth, y: expandedHeight / 2 + expandedY } 
        ];

        const outlinePoints = [
            [positions[0].x, positions[0].y],
            [positions[1].x, positions[1].y],
            [positions[3].x, positions[3].y],
            [positions[2].x, positions[2].y],
            [positions[0].x, positions[0].y]
        ];

        this.anchors.forEach(anchor => {
             if (anchor.parentNode === this.group) {
                 this.group.removeChild(anchor);
             }
         });
          if (this.rotationAnchor && this.rotationAnchor.parentNode === this.group) {
             this.group.removeChild(this.rotationAnchor);
         }
          if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
             this.group.removeChild(this.selectionOutline);
         }

        this.anchors = [];
        const anchorDirections = {
            0: 'nwse', 
            1: 'nesw', 
            2: 'nesw', 
            3: 'nwse', 
            4: 'ns',   
            5: 'ns',   
            6: 'ew',   
            7: 'ew'    
        };

        positions.forEach((pos, i) => {
            const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            anchor.setAttribute('x', pos.x - anchorSize / 2);
            anchor.setAttribute('y', pos.y - anchorSize / 2);
            anchor.setAttribute('width', anchorSize);
            anchor.setAttribute('height', anchorSize);
            anchor.setAttribute('class', 'anchor');
            anchor.setAttribute('data-index', i);
            anchor.setAttribute('fill', '#121212');
            anchor.setAttribute('stroke', '#5B57D1');
            anchor.setAttribute('stroke-width', anchorStrokeWidth);
            anchor.setAttribute('vector-effect', 'non-scaling-stroke');
            anchor.setAttribute('style', 'pointer-events: all;');

            anchor.addEventListener('mouseover', function () {
                const index = this.getAttribute('data-index');
                const baseDirection = anchorDirections[index];
                const rotatedCursor = self.getRotatedCursor(index, self.rotation); 
                svg.style.cursor = rotatedCursor + '-resize';
            });

            anchor.addEventListener('mouseout', function () {
                 if (!isResizingShapeCircle && !isDraggingShapeCircle && !isRotatingShapeCircle) {
                     svg.style.cursor = 'default';
                 }
            });

            this.group.appendChild(anchor);
            this.anchors[i] = anchor;
        });
        const rotationAnchorPos = { x: expandedX + expandedWidth / 2, y: expandedY - 30 / zoom };
        this.rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
        this.rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
        this.rotationAnchor.setAttribute('r', 8 / zoom);
        this.rotationAnchor.setAttribute('class', 'rotate-anchor');
        this.rotationAnchor.setAttribute('fill', '#121212');
        this.rotationAnchor.setAttribute('stroke', '#5B57D1');
        this.rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
        this.rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
        this.rotationAnchor.setAttribute('style', 'pointer-events: all;');
        this.group.appendChild(this.rotationAnchor);
        registerRotationAnchor(this.rotationAnchor, { radius: 8, edgeY: expandedY });

        this.rotationAnchor.addEventListener('mouseover', function () {
             if (!isResizingShapeCircle && !isDraggingShapeCircle && !isRotatingShapeCircle) {
                 svg.style.cursor = 'grab';
             }
        });
        this.rotationAnchor.addEventListener('mouseout', function () {
            if (!isResizingShapeCircle && !isDraggingShapeCircle && !isRotatingShapeCircle) {
                svg.style.cursor = 'default';
            }
        });

        const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        outline.setAttribute('points', pointsAttr);
        outline.setAttribute('class', 'selection-outline');
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', '#5B57D1');
        outline.setAttribute('stroke-width', 1.5);
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
        outline.setAttribute('stroke-dasharray', '4 2');
        outline.setAttribute('style', 'pointer-events: none;');
        this.group.appendChild(outline);
        this.selectionOutline = outline;

        disableAllSideBars();
        circleSideBar.classList.remove("hidden");
        if (window.__showSidebarForShape) window.__showSidebarForShape('circle');
        this.updateSidebar();
    }

    updateSelectionControls() {
        if (!this.selectionOutline || this.anchors.length === 0) return;

        const zoom = window.currentZoom || 1;
        const anchorSize = 10 / zoom;
        const expandedX = -this.rx - this.selectionPadding;
        const expandedY = -this.ry - this.selectionPadding;
        const expandedWidth = this.rx * 2 + 2 * this.selectionPadding;
        const expandedHeight = this.ry * 2 + 2 * this.selectionPadding;

        const positions = [
            { x: expandedX, y: expandedY },
            { x: expandedX + expandedWidth, y: expandedY },
            { x: expandedX, y: expandedY + expandedHeight },
            { x: expandedX + expandedWidth, y: expandedY + expandedHeight },
            { x: expandedX + expandedWidth / 2, y: expandedY },
            { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight },
            { x: expandedX, y: expandedHeight / 2 + expandedY },
            { x: expandedX + expandedWidth, y: expandedHeight / 2 + expandedY }
        ];

        positions.forEach((pos, i) => {
            if (this.anchors[i]) {
                this.anchors[i].setAttribute('x', pos.x - anchorSize / 2);
                this.anchors[i].setAttribute('y', pos.y - anchorSize / 2);
            }
        });

        const outlinePoints = [
            [positions[0].x, positions[0].y],
            [positions[1].x, positions[1].y],
            [positions[3].x, positions[3].y],
            [positions[2].x, positions[2].y],
            [positions[0].x, positions[0].y]
        ];
        this.selectionOutline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));

        if (this.rotationAnchor) {
            this.rotationAnchor.setAttribute('cx', expandedX + expandedWidth / 2);
            this.rotationAnchor.setAttribute('cy', expandedY - 30 / zoom);
        }
    }

        removeSelection() {
        this.anchors.forEach(anchor => {
             if (anchor.parentNode === this.group) {
                 this.group.removeChild(anchor);
             }
         });
         if (this.rotationAnchor && this.rotationAnchor.parentNode === this.group) {
            this.group.removeChild(this.rotationAnchor);
         }
         if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
            this.group.removeChild(this.selectionOutline);
         }
        this.anchors = [];
        this.rotationAnchor = null;
        this.selectionOutline = null;
        this.isSelected = false;
    }
    contains(x, y) {
        if (!this.element || !this.rx || !this.ry) return false;
        // Mouse coordinates are in canvas space; invert the circle's own
        // translation/rotation without mixing in the viewport CTM.
        const angle = -(this.rotation || 0) * Math.PI / 180;
        const translatedX = x - this.x;
        const translatedY = y - this.y;
        const dx = translatedX * Math.cos(angle) - translatedY * Math.sin(angle);
        const dy = translatedX * Math.sin(angle) + translatedY * Math.cos(angle);
        const rx = this.rx;
        const ry = this.ry;
        return ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) <= 1.05; 
    }
    isNearAnchor(x, y) {
        if (!this.isSelected) return null;
        const zoom = window.currentZoom || 1;
        const buffer = 10 / zoom; // Scale buffer by zoom level
        const anchorSize = 10 / zoom; // Scale anchor size by zoom level
        const transform = { x: this.x, y: this.y, rotation: this.rotation, centerX: 0, centerY: 0 };

        // Iterate through anchors
        for (let i = 0; i < this.anchors.length; i++) {
            const anchor = this.anchors[i];
            const anchorLocalX = parseFloat(anchor.getAttribute('x')) + anchorSize / 2;
            const anchorLocalY = parseFloat(anchor.getAttribute('y')) + anchorSize / 2;
            const transformedPoint = localToCanvas({ x: anchorLocalX, y: anchorLocalY }, transform);
            
            const anchorLeft = transformedPoint.x - anchorSize/2 - buffer;
            const anchorRight = transformedPoint.x + anchorSize/2 + buffer;
            const anchorTop = transformedPoint.y - anchorSize/2 - buffer;
            const anchorBottom = transformedPoint.y + anchorSize/2 + buffer;
            
            if (x >= anchorLeft && x <= anchorRight && y >= anchorTop && y <= anchorBottom) {
                return { type: 'resize', index: i };
            }
        }

        // Check rotation anchor
        if (this.rotationAnchor) {
            const rotateAnchorLocalX = parseFloat(this.rotationAnchor.getAttribute('cx'));
            const rotateAnchorLocalY = parseFloat(this.rotationAnchor.getAttribute('cy'));
            const transformedPoint = localToCanvas({ x: rotateAnchorLocalX, y: rotateAnchorLocalY }, transform);
            
            const rotateAnchorRadius = parseFloat(this.rotationAnchor.getAttribute('r'));
            const distSq = (x - transformedPoint.x)**2 + (y - transformedPoint.y)**2;
            if (distSq <= (rotateAnchorRadius + buffer)**2) {
                return { type: 'rotate' };
            }
        }

        return null;
    }

    updatePosition(anchorIndex, newMouseX, newMouseY) {
        const transformedPoint = canvasToLocal(
            { x: newMouseX, y: newMouseY },
            { x: this.x, y: this.y, rotation: this.rotation, centerX: 0, centerY: 0 },
        );
    
        const dx = transformedPoint.x;
        const dy = transformedPoint.y;
    
        const MIN_RADIUS = 10;
    
        switch (anchorIndex) {
            case 0: // top-left
            case 1: // top-right
            case 2: // bottom-left
            case 3: // bottom-right
                this.rx = Math.max(Math.abs(dx), MIN_RADIUS);
                this.ry = Math.max(Math.abs(dy), MIN_RADIUS);
                break;
    
            case 4: // top-center
            case 5: // bottom-center
                this.ry = Math.max(Math.abs(dy), MIN_RADIUS);
                break;
    
            case 6: // left-center
            case 7: // right-center
                this.rx = Math.max(Math.abs(dx), MIN_RADIUS);
                break;
        }
        this.updateAttachedArrows();
    }
    updateAttachedArrows() {
        shapes.forEach(shape => {
            if (shape && shape.shapeName === 'arrow' && typeof shape.updateAttachments === 'function') {
                if ((shape.attachedToStart && shape.attachedToStart.shape === this) ||
                    (shape.attachedToEnd && shape.attachedToEnd.shape === this)) {
                    shape.updateAttachments();
                }
            }
        });
    }
    _updateShade() {
        if (!this.shadeColor) {
            if (this._shadeEllipse && this._shadeEllipse.parentNode === this.group) {
                this.group.removeChild(this._shadeEllipse);
                this._shadeEllipse = null;
            }
            if (this._shadeGradient && this._shadeGradient.parentNode) {
                this._shadeGradient.parentNode.removeChild(this._shadeGradient);
                this._shadeGradient = null;
            }
            return;
        }

        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }

        const gradId = `shade-${this.shapeID}`;
        if (!this._shadeGradient) {
            this._shadeGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
            this._shadeGradient.setAttribute('id', gradId);
            defs.appendChild(this._shadeGradient);
        }

        // Radial gradient for circles - center to edge fade
        this._shadeGradient.setAttribute('cx', '50%');
        this._shadeGradient.setAttribute('cy', '50%');
        this._shadeGradient.setAttribute('r', '50%');

        while (this._shadeGradient.firstChild) this._shadeGradient.removeChild(this._shadeGradient.firstChild);
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', this.shadeColor);
        stop1.setAttribute('stop-opacity', this.shadeOpacity);
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', this.shadeColor);
        stop2.setAttribute('stop-opacity', '0');
        this._shadeGradient.appendChild(stop1);
        this._shadeGradient.appendChild(stop2);

        if (!this._shadeEllipse) {
            this._shadeEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            this._shadeEllipse.setAttribute('pointer-events', 'none');
        }
        this._shadeEllipse.setAttribute('cx', 0);
        this._shadeEllipse.setAttribute('cy', 0);
        this._shadeEllipse.setAttribute('rx', this.rx);
        this._shadeEllipse.setAttribute('ry', this.ry);
        this._shadeEllipse.setAttribute('fill', `url(#${gradId})`);

        if (this._shadeEllipse.parentNode === this.group) this.group.removeChild(this._shadeEllipse);
        if (this.element && this.element.nextSibling) {
            this.group.insertBefore(this._shadeEllipse, this.element.nextSibling);
        } else {
            this.group.appendChild(this._shadeEllipse);
        }
    }

    _updateLabelElement() {
        if (!this.label) {
            if (this.labelElement && this.labelElement.parentNode === this.group) {
                this.group.removeChild(this.labelElement);
                this.labelElement = null;
            }
            if (this._labelBg && this._labelBg.parentNode === this.group) {
                this.group.removeChild(this._labelBg);
                this._labelBg = null;
            }
            return;
        }

        if (!this.labelElement) {
            this.labelElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            this.labelElement.setAttribute('class', 'shape-label');
            this.labelElement.setAttribute('pointer-events', 'none');
        }

        // Circle center is at (0, 0) in local coords
        this.labelElement.setAttribute('x', 0);
        this.labelElement.setAttribute('y', 0);
        this.labelElement.setAttribute('text-anchor', 'middle');
        this.labelElement.setAttribute('dominant-baseline', 'central');
        this.labelElement.setAttribute('fill', this.labelColor);
        this.labelElement.setAttribute('font-size', this.labelFontSize);
        this.labelElement.setAttribute('font-family', 'lixFont, sans-serif');
        this.labelElement.textContent = this.label;

        // Background padding rect behind text (like arrows have)
        const canvasBg = window.getComputedStyle(svg).backgroundColor || '#000';
        if (!this._labelBg) {
            this._labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this._labelBg.setAttribute('pointer-events', 'none');
        }
        this._labelBg.setAttribute('fill', canvasBg);
        const hPadding = 6;
        const vPadding = 2;
        const charWidth = this.labelFontSize * 0.6;
        const bgW = this.label.length * charWidth + hPadding * 2;
        const bgH = this.labelFontSize + vPadding * 2;
        this._labelBg.setAttribute('x', -bgW / 2);
        this._labelBg.setAttribute('y', -bgH / 2);
        this._labelBg.setAttribute('width', bgW);
        this._labelBg.setAttribute('height', bgH);
        this._labelBg.setAttribute('rx', 3);

        // Re-append bg then text on top
        if (this._labelBg.parentNode === this.group) this.group.removeChild(this._labelBg);
        if (this.labelElement.parentNode === this.group) this.group.removeChild(this.labelElement);
        this.group.appendChild(this._labelBg);
        this.group.appendChild(this.labelElement);
    }

    _setupLabelDblClick() {
        this.group.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.startLabelEdit();
        });
    }

    startLabelEdit() {
        if (this._isEditingLabel) return;
        this._isEditingLabel = true;

        if (this.labelElement) {
            this.labelElement.setAttribute('visibility', 'hidden');
        }

        // Get shape's screen position via CTM
        const ctm = this.group.getScreenCTM();
        if (!ctm) { this._isEditingLabel = false; return; }

        // Map the ellipse bounding box to screen coords
        const pt1 = svg.createSVGPoint();
        pt1.x = -this.rx; pt1.y = -this.ry;
        const screenTL = pt1.matrixTransform(ctm);
        const pt2 = svg.createSVGPoint();
        pt2.x = this.rx; pt2.y = this.ry;
        const screenBR = pt2.matrixTransform(ctm);

        const screenW = Math.abs(screenBR.x - screenTL.x);
        const screenH = Math.abs(screenBR.y - screenTL.y);
        const screenX = Math.min(screenTL.x, screenBR.x);
        const screenY = Math.min(screenTL.y, screenBR.y);

        // Create HTML overlay
        const overlay = document.createElement('div');
        overlay.className = 'shape-label-editor';
        overlay.style.cssText = `
            position: fixed; z-index: 10000;
            left: ${screenX}px; top: ${screenY}px;
            width: ${screenW}px; height: ${screenH}px;
            display: flex; align-items: center; justify-content: center;
            pointer-events: auto;
        `;

        const canvasBg = window.getComputedStyle(svg).backgroundColor || '#000';
        const input = document.createElement('div');
        input.setAttribute('contenteditable', 'true');
        input.style.cssText = `
            max-width: ${screenW - 8}px; min-width: 30px; min-height: 20px;
            background: ${canvasBg}; border: none;
            outline: none; padding: 2px 6px;
            color: ${this.labelColor}; font-size: ${Math.max(12, this.labelFontSize * (screenW / Math.max(this.rx * 2, 1)))}px;
            font-family: lixFont, sans-serif; text-align: center;
            white-space: pre-wrap; word-break: break-word;
            cursor: text;
        `;
        if (this.label) {
            input.textContent = this.label;
        } else {
            input.innerHTML = '&nbsp;';
        }

        overlay.appendChild(input);
        document.body.appendChild(overlay);

        setTimeout(() => {
            input.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            sel.removeAllRanges();
            sel.addRange(range);
        }, 10);

        const finishEdit = () => {
            const newText = input.textContent.trim().replace(/\u00A0/g, '');
            this.label = newText;
            this._isEditingLabel = false;

            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (this.labelElement) this.labelElement.setAttribute('visibility', 'visible');
            this.draw();
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.textContent = this.label; input.blur(); }
        });
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('pointermove', (e) => e.stopPropagation());
        input.addEventListener('pointerup', (e) => e.stopPropagation());
    }

    setLabel(text, color, fontSize) {
        this.label = text || '';
        if (color) this.labelColor = color;
        if (fontSize) this.labelFontSize = fontSize;
        this.draw();
    }

    rotate(angle) {
        angle = angle % 360;
        if (angle < 0) angle += 360;
        this.rotation = angle;
    }
    // No-op: React sidebar handles UI updates via Zustand store
    updateSidebar() {}

}

export { Circle };
