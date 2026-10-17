/* eslint-disable */
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';
import { canvasToLocal, localToCanvas } from '../core/CanvasSpace.js';
import { DEFAULT_SHAPE_LABEL_FONT_SIZE, measureShapeLabel } from '../core/ShapeLabelLayout.js';
import { resolveThemeLabelColor } from '../utils/themeColors.js';
// Rectangle shape class - extracted from drawSquare.js
// Depends on globals: svg, shapes, rough, currentShape, currentZoom, rc

// Create local rc from globals; tool-state vars default to false
const rc = rough.svg(svg);
let isDraggingShapeSquare = false;
let isResizingShapeSquare = false;
let isRotatingShapeSquare = false;
let hoveredFrame = null;
const SquarecolorOptions = document.querySelectorAll(".squareStrokeSpan");
const backgroundColorOptionsSquare = document.querySelectorAll(".squareBackgroundSpan");
const fillStyleOptions = document.querySelectorAll(".squareFillStyleSpan");
const squareStrokeThicknessValue = document.querySelectorAll(".squareStrokeThickSpan");
const squareOutlineStyleValue = document.querySelectorAll(".squareOutlineStyle");
// Depends on globals: squareStrokecolor, squareBackgroundColor, squareFillStyleValue, squareStrokeThicknes, squareOutlineStyle
// Depends on globals: isDraggingShapeSquare, isResizingShapeSquare, isRotatingShapeSquare
// Depends on globals: squareSideBar, disableAllSideBars
// Depends on DOM query: SquarecolorOptions, backgroundColorOptionsSquare, fillStyleOptions, squareStrokeThicknessValue, squareOutlineStyleValue

class Rectangle {
    constructor(x, y, width, height, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.options = {
            roughness: 1.5,
            stroke: "#fff",
            strokeWidth: 2,
            fill: "transparent",
            fillStyle: "none",
            strokeDasharray: "",
            ...options
        };
        this.element = null;
        this.isSelected = false;
        this.rotation = 0;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.anchors = [];
        this.rotationAnchor = null;
        this.selectionPadding = 8;
        this.selectionOutline = null;
        this.shapeName = 'rectangle';
        this.shapeID = `rectangle-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);

        // Embedded label support
        this.label = options.label || '';
        this.labelElement = null;
        this.labelColor = resolveThemeLabelColor(options.labelColor);
        this.labelFontSize = options.labelFontSize || DEFAULT_SHAPE_LABEL_FONT_SIZE;
        this.labelBg = options.labelBg !== false; // set labelBg:false to render plain text with no pill backdrop
        this._isEditingLabel = false;
        this._hitArea = null;
        this._labelBg = null;

        // Shading / gradient support for research paper style diagrams
        this.shadeColor = options.shadeColor || null;
        this.shadeOpacity = options.shadeOpacity !== undefined ? options.shadeOpacity : 0.15;
        this.shadeDirection = options.shadeDirection || 'bottom'; // 'top' | 'bottom' | 'left' | 'right'
        this._shadeRect = null;
        this._shadeGradient = null;

         if (!this.group.parentNode) {
             svg.appendChild(this.group);
         }
         this._lastDrawn = {
            width: null,
            height: null,
            options: null
        };
        this.isBeingDrawn = false;
        this._setupLabelDblClick();
        this.draw();
    }
    draw() {
        const labelLayout = this._ensureLabelFits();
        const childrenToRemove = [];
        const preserveSet = this._skipAnchors ? new Set([...this.anchors, this.selectionOutline, this.rotationAnchor].filter(Boolean)) : null;
        for (let i = 0; i < this.group.children.length; i++) {
            const child = this.group.children[i];
            if (child !== this.element && child !== this.labelElement && child !== this._hitArea && child !== this._labelBg && child !== this._shadeRect) {
                if (preserveSet && preserveSet.has(child)) continue;
                childrenToRemove.push(child);
            }
        }
        childrenToRemove.forEach(child => this.group.removeChild(child));

        const optionsString = JSON.stringify(this.options);
        const isInitialDraw = this.element === null;
        const optionsChanged = optionsString !== this._lastDrawn.options;
        const sizeChanged = this.width !== this._lastDrawn.width || this.height !== this._lastDrawn.height;

        // Only regenerate rough element if it's not being actively drawn OR if options changed OR initial draw
        if (isInitialDraw || optionsChanged || (!this.isBeingDrawn && sizeChanged)) {
            if (this.element && this.element.parentNode === this.group) {
                this.group.removeChild(this.element);
            }
            const roughRect = rc.rectangle(0, 0, this.width, this.height, this.options);
            this.element = roughRect;
            this.group.appendChild(roughRect);

            // Cache the values
            this._lastDrawn.width = this.width;
            this._lastDrawn.height = this.height;
            this._lastDrawn.options = optionsString;
        }

        // Hit area for dblclick detection (transparent rect that captures pointer events)
        if (!this._hitArea) {
            this._hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this._hitArea.setAttribute('fill', 'transparent');
            this._hitArea.setAttribute('stroke', 'none');
            this._hitArea.setAttribute('style', 'pointer-events: all;');
            this.group.insertBefore(this._hitArea, this.group.firstChild);
        }
        this._hitArea.setAttribute('x', 0);
        this._hitArea.setAttribute('y', 0);
        this._hitArea.setAttribute('width', this.width);
        this._hitArea.setAttribute('height', this.height);

        // Shading / gradient overlay
        this._updateShade();

        // Update embedded label
        this._updateLabelElement(labelLayout);

        const rotateCenterX = this.width / 2;
        const rotateCenterY = this.height / 2;
        this.group.setAttribute('transform', `translate(${this.x}, ${this.y}) rotate(${this.rotation}, ${rotateCenterX}, ${rotateCenterY})`);

        if (this.isSelected) {
            if (this._skipAnchors) {
                this.updateSelectionControls();
            } else {
                this.addAnchors();
            }
        }
        if (!this.group.parentNode) {
            this.updateAttachedArrows();
            svg.appendChild(this.group);
        }
    }

    _updateShade() {
        if (!this.shadeColor) {
            if (this._shadeRect && this._shadeRect.parentNode === this.group) {
                this.group.removeChild(this._shadeRect);
                this._shadeRect = null;
            }
            if (this._shadeGradient && this._shadeGradient.parentNode) {
                this._shadeGradient.parentNode.removeChild(this._shadeGradient);
                this._shadeGradient = null;
            }
            return;
        }

        // Create or update gradient in SVG defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }

        const gradId = `shade-${this.shapeID}`;
        if (!this._shadeGradient) {
            this._shadeGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            this._shadeGradient.setAttribute('id', gradId);
            defs.appendChild(this._shadeGradient);
        }

        // Direction mapping
        const dirs = {
            top:    { x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            bottom: { x1: '0%', y1: '100%', x2: '0%', y2: '0%' },
            left:   { x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            right:  { x1: '100%', y1: '0%', x2: '0%', y2: '0%' },
        };
        const d = dirs[this.shadeDirection] || dirs.bottom;
        this._shadeGradient.setAttribute('x1', d.x1);
        this._shadeGradient.setAttribute('y1', d.y1);
        this._shadeGradient.setAttribute('x2', d.x2);
        this._shadeGradient.setAttribute('y2', d.y2);

        // Rebuild stops
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

        // Create or update shade rect
        if (!this._shadeRect) {
            this._shadeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this._shadeRect.setAttribute('pointer-events', 'none');
        }
        this._shadeRect.setAttribute('x', 0);
        this._shadeRect.setAttribute('y', 0);
        this._shadeRect.setAttribute('width', this.width);
        this._shadeRect.setAttribute('height', this.height);
        this._shadeRect.setAttribute('fill', `url(#${gradId})`);
        this._shadeRect.setAttribute('rx', 2);

        // Insert after rough element
        if (this._shadeRect.parentNode === this.group) this.group.removeChild(this._shadeRect);
        if (this.element && this.element.nextSibling) {
            this.group.insertBefore(this._shadeRect, this.element.nextSibling);
        } else {
            this.group.appendChild(this._shadeRect);
        }
    }

    _ensureLabelFits() {
        if (!this.label) return null;
        const layout = measureShapeLabel(this.label, this.labelFontSize);
        // Dense diagram renderers opt out of the label backdrop and own their
        // geometry. Auto-fit is for interactive rectangle labels.
        if (this.isBeingDrawn || !this.labelBg) return layout;
        this.width = Math.max(this.width, layout.requiredWidth);
        this.height = Math.max(this.height, layout.requiredHeight);
        return layout;
    }

    _updateLabelElement(layout = null) {
        if (!this.label) {
            // Remove label element if label is empty
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

        const labelLayout = layout || measureShapeLabel(this.label, this.labelFontSize);
        const startY = (this.height - labelLayout.contentHeight) / 2;

        while (this.labelElement.firstChild) this.labelElement.removeChild(this.labelElement.firstChild);
        labelLayout.lines.forEach((line, index) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', this.width / 2);
            tspan.setAttribute('y', startY + index * labelLayout.lineHeight);
            tspan.setAttribute('dominant-baseline', 'hanging');
            tspan.textContent = line || ' ';
            this.labelElement.appendChild(tspan);
        });

        // Position at center of rectangle
        this.labelElement.setAttribute('x', this.width / 2);
        this.labelElement.setAttribute('text-anchor', 'middle');
        this.labelElement.setAttribute('fill', this.labelColor);
        this.labelElement.setAttribute('font-size', this.labelFontSize);
        this.labelElement.setAttribute('font-family', 'lixFont, sans-serif');

        // Background padding rect behind text (like arrows have) — skippable
        // via labelBg:false for dense multi-row content (e.g. mermaid ER
        // attribute rows) where a pill backdrop looks out of place and
        // doesn't match the SVG preview.
        if (!this.labelBg) {
            if (this._labelBg && this._labelBg.parentNode === this.group) {
                this.group.removeChild(this._labelBg);
                this._labelBg = null;
            }
            if (this.labelElement.parentNode === this.group) this.group.removeChild(this.labelElement);
            this.group.appendChild(this.labelElement);
            return;
        }
        const canvasBg = window.getComputedStyle(svg).backgroundColor || '#000';
        if (!this._labelBg) {
            this._labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this._labelBg.setAttribute('pointer-events', 'none');
        }
        this._labelBg.setAttribute('fill', canvasBg);
        const hPadding = 6;
        const vPadding = 2;
        const bgW = labelLayout.contentWidth + hPadding * 2;
        const bgH = labelLayout.contentHeight + vPadding * 2;
        this._labelBg.setAttribute('x', this.width / 2 - bgW / 2);
        this._labelBg.setAttribute('y', this.height / 2 - bgH / 2);
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

        // Hide label element during editing
        if (this.labelElement) {
            this.labelElement.setAttribute('visibility', 'hidden');
        }

        // Get shape's screen position via CTM
        const ctm = this.group.getScreenCTM();
        if (!ctm) { this._isEditingLabel = false; return; }

        // Map the shape corners to screen coords
        const pt1 = svg.createSVGPoint();
        pt1.x = 0; pt1.y = 0;
        const screenTL = pt1.matrixTransform(ctm);
        const pt2 = svg.createSVGPoint();
        pt2.x = this.width; pt2.y = this.height;
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
            color: ${this.labelColor}; font-size: ${Math.max(12, this.labelFontSize * (screenW / Math.max(this.width, 1)))}px;
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

        // Focus and select all text
        setTimeout(() => {
            input.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            sel.removeAllRanges();
            sel.addRange(range);
        }, 10);

        const finishEdit = () => {
            const newText = input.innerText.trim().replace(/\u00A0/g, '');
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

    setDrawingState(isDrawing) {
        this.isBeingDrawn = isDrawing;
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
        const expandedX = -this.selectionPadding; 
        const expandedY = -this.selectionPadding; 
        const expandedWidth = this.width + 2 * this.selectionPadding;
        const expandedHeight = this.height + 2 * this.selectionPadding;

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
                 if (!isResizingShapeSquare && !isDraggingShapeSquare && !isRotatingShapeSquare) {
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
             if (!isResizingShapeSquare && !isDraggingShapeSquare && !isRotatingShapeSquare) {
                 svg.style.cursor = 'grab';
             }
        });
        this.rotationAnchor.addEventListener('mouseout', function () {
            if (!isResizingShapeSquare && !isDraggingShapeSquare && !isRotatingShapeSquare) {
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
        outline.setAttribute('stroke-dasharray', '4 2');
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
        outline.setAttribute('style', 'pointer-events: none;');
        this.group.appendChild(outline);
        this.selectionOutline = outline;

        // Show relevant sidebar
        disableAllSideBars();
        squareSideBar.classList.remove("hidden");
        if (window.__showSidebarForShape) window.__showSidebarForShape('rectangle');
        this.updateSidebar();
    }

    updateSelectionControls() {
        if (!this.selectionOutline || this.anchors.length === 0) return;

        const zoom = window.currentZoom || 1;
        const anchorSize = 10 / zoom;
        const expandedX = -this.selectionPadding;
        const expandedY = -this.selectionPadding;
        const expandedWidth = this.width + 2 * this.selectionPadding;
        const expandedHeight = this.height + 2 * this.selectionPadding;

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

        // Update anchor positions
        positions.forEach((pos, i) => {
            if (this.anchors[i]) {
                this.anchors[i].setAttribute('x', pos.x - anchorSize / 2);
                this.anchors[i].setAttribute('y', pos.y - anchorSize / 2);
            }
        });

        // Update outline
        const outlinePoints = [
            [positions[0].x, positions[0].y],
            [positions[1].x, positions[1].y],
            [positions[3].x, positions[3].y],
            [positions[2].x, positions[2].y],
            [positions[0].x, positions[0].y]
        ];
        this.selectionOutline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));

        // Update rotation anchor
        if (this.rotationAnchor) {
            this.rotationAnchor.setAttribute('cx', expandedX + expandedWidth / 2);
            this.rotationAnchor.setAttribute('cy', expandedY - 30 / zoom);
        }
    }

    removeSelection() {
        // Remove selection elements (anchors, outline, rotation anchor) from the group
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
        if (!this.element) return false;
        // x/y are already canvas (viewBox) coordinates. getCTM() operates in
        // viewport coordinates and made hit testing drift after pan/zoom.
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const angle = -(this.rotation || 0) * Math.PI / 180;
        const translatedX = x - this.x;
        const translatedY = y - this.y;
        const dx = translatedX - centerX;
        const dy = translatedY - centerY;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + centerX;
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + centerY;
        const tolerance = 5;
        return localX >= -tolerance && localX <= this.width + tolerance &&
               localY >= -tolerance && localY <= this.height + tolerance;
    }

     // Helper to check if a point is near an anchor
     isNearAnchor(x, y) {
         if (!this.isSelected) return null;
         const zoom = window.currentZoom || 1;
         const buffer = 10 / zoom;
         const anchorSize = 10 / zoom;
         const transform = { x: this.x, y: this.y, rotation: this.rotation, centerX: this.width / 2, centerY: this.height / 2 };

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


move(dx, dy) {
    this.x += dx;
    this.y += dy;

    // Fast path: just update the transform — no need to rebuild RoughJS element
    const rotateCenterX = this.width / 2;
    const rotateCenterY = this.height / 2;
    this.group.setAttribute('transform', `translate(${this.x}, ${this.y}) rotate(${this.rotation}, ${rotateCenterX}, ${rotateCenterY})`);

    this.updateAttachedArrows();

    // Only update frame containment if we're actively dragging the shape itself
    // and not being moved by a parent frame
    if (isDraggingShapeSquare && !this.isBeingMovedByFrame) {
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
    if (this.parentFrame && isDraggingShapeSquare) {
        this.parentFrame.temporarilyRemoveFromFrame(this);
    }
    
    // Update frame highlighting
    if (hoveredFrame && hoveredFrame !== targetFrame) {
        hoveredFrame.removeHighlight();
    }
    
    if (targetFrame && targetFrame !== hoveredFrame) {
        targetFrame.highlightFrame();
    }
    
    hoveredFrame = targetFrame;
}

    updatePosition(anchorIndex, newMouseX, newMouseY) {
        const oldW = this.width;
        const oldH = this.height;
        const transform = { x: this.x, y: this.y, rotation: this.rotation, centerX: oldW / 2, centerY: oldH / 2 };
        const localMouse = canvasToLocal({ x: newMouseX, y: newMouseY }, transform);

        // Determine fixed point in old local coords and compute raw new dimensions
        let fixedOldX, fixedOldY, rawW, rawH;
        switch (anchorIndex) {
            case 0: fixedOldX = oldW; fixedOldY = oldH; rawW = oldW - localMouse.x; rawH = oldH - localMouse.y; break;
            case 1: fixedOldX = 0;    fixedOldY = oldH; rawW = localMouse.x;        rawH = oldH - localMouse.y; break;
            case 2: fixedOldX = oldW; fixedOldY = 0;    rawW = oldW - localMouse.x; rawH = localMouse.y;        break;
            case 3: fixedOldX = 0;    fixedOldY = 0;    rawW = localMouse.x;        rawH = localMouse.y;        break;
            case 4: fixedOldX = 0;    fixedOldY = oldH; rawW = oldW;                rawH = oldH - localMouse.y; break;
            case 5: fixedOldX = 0;    fixedOldY = 0;    rawW = oldW;                rawH = localMouse.y;        break;
            case 6: fixedOldX = oldW; fixedOldY = 0;    rawW = oldW - localMouse.x; rawH = oldH;               break;
            case 7: fixedOldX = 0;    fixedOldY = 0;    rawW = localMouse.x;        rawH = oldH;               break;
        }

        // Get world position of the fixed point using current CTM
        const fixedWorld = localToCanvas({ x: fixedOldX, y: fixedOldY }, transform);

        // Handle negative dimensions (dragged past opposite edge)
        const newW = Math.abs(rawW);
        const newH = Math.abs(rawH);

        // Fixed point in new local coords (flips if dimension went negative)
        const fixedNewX = fixedOldX === 0 ? (rawW >= 0 ? 0 : newW) : (rawW >= 0 ? newW : 0);
        const fixedNewY = fixedOldY === 0 ? (rawH >= 0 ? 0 : newH) : (rawH >= 0 ? newH : 0);

        // Solve for new x, y so the fixed corner stays in place
        // Transform: translate(x, y) rotate(θ, newW/2, newH/2)
        const rad = this.rotation * Math.PI / 180;
        const cosR = Math.cos(rad);
        const sinR = Math.sin(rad);
        const ncx = newW / 2;
        const ncy = newH / 2;
        const dx = fixedNewX - ncx;
        const dy = fixedNewY - ncy;
        const rotX = ncx + dx * cosR - dy * sinR;
        const rotY = ncy + dx * sinR + dy * cosR;

        this.x = fixedWorld.x - rotX;
        this.y = fixedWorld.y - rotY;
        this.width = newW;
        this.height = newH;

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

    rotate(angle) {
        angle = angle % 360;
        if (angle < 0) angle += 360;
        this.rotation = angle;
    }

     // Method to update the sidebar based on the shape's current options
    // No-op: React sidebar handles UI updates via Zustand store
    updateSidebar() {}
}

export { Rectangle };
