/* eslint-disable */
// Line shape class - extracted from lineTool.js
// Depends on globals: svg, shapes, rough, currentShape, currentZoom
import { updateAttachedArrows as updateArrowsForShape } from '../tools/arrowTool.js';
import { DEFAULT_SHAPE_LABEL_FONT_SIZE } from '../core/ShapeLabelLayout.js';
import { resolveThemeLabelColor } from '../utils/themeColors.js';

const rc = rough.svg(svg);
// Issue #38 follow-up: read the default stroke from the active theme
// instead of pinning to a single colour. White was invisible on the new
// light canvas, black is invisible if the user toggles dark.
function getThemeStroke() {
    if (typeof document === 'undefined') return '#fff';
    return document.body && document.body.classList.contains('theme-dark') ? '#fff' : '#000000';
}
const lineStrokeWidth = 2;
let hoveredFrameLine = null;

class Line {
    constructor(startPoint, endPoint, options = {}) {
        this.startPoint = startPoint;
        this.endPoint = endPoint;
        this.options = { ...options };
        // RoughJS otherwise chooses a fresh random stroke on every redraw.
        // A stable per-line seed keeps the hand-drawn contour visually fixed
        // while its endpoints move.
        if (!Number.isInteger(this.options.seed) || this.options.seed <= 0) {
            this.options.seed = Math.floor(Math.random() * 0x7fffffff) + 1;
        }
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.isSelected = false;
        this.anchors = [];
        this.selectionOutline = null;
        this.shapeName = "line"; 
        this.shapeID = `line-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`; 
        this.group.setAttribute('id', this.shapeID);
        
        // Curve properties
        this.isCurved = false;
        this.controlPoint = null;
        
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
        this._dragRenderFrame = null;

        svg.appendChild(this.group);
        this._setupLabelDblClick();
        this.draw();
    }

    // Add position and dimension properties for frame compatibility
    get x() {
        return Math.min(this.startPoint.x, this.endPoint.x);
    }
    
    set x(value) {
        const currentX = this.x;
        const dx = value - currentX;
        this.startPoint.x += dx;
        this.endPoint.x += dx;
        if (this.controlPoint) {
            this.controlPoint.x += dx;
        }
    }
    
    get y() {
        return Math.min(this.startPoint.y, this.endPoint.y);
    }
    
    set y(value) {
        const currentY = this.y;
        const dy = value - currentY;
        this.startPoint.y += dy;
        this.endPoint.y += dy;
        if (this.controlPoint) {
            this.controlPoint.y += dy;
        }
    }
    
    get width() {
        return Math.abs(this.endPoint.x - this.startPoint.x);
    }
    
    set width(value) {
        const centerX = (this.startPoint.x + this.endPoint.x) / 2;
        this.startPoint.x = centerX - value / 2;
        this.endPoint.x = centerX + value / 2;
    }
    
    get height() {
        return Math.abs(this.endPoint.y - this.startPoint.y);
    }
    
    set height(value) {
        const centerY = (this.startPoint.y + this.endPoint.y) / 2;
        this.startPoint.y = centerY - value / 2;
        this.endPoint.y = centerY + value / 2;
    }

    initializeCurveControlPoint() {
        const midX = (this.startPoint.x + this.endPoint.x) / 2;
        const midY = (this.startPoint.y + this.endPoint.y) / 2;
        
        // Calculate perpendicular offset for curve
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) {
            this.controlPoint = { x: midX, y: midY - 20 };
            return;
        }
        
        // Perpendicular vector
        const perpX = -dy / length;
        const perpY = dx / length;
        const curveOffset = 30; // Default curve amount
        
        this.controlPoint = {
            x: midX + perpX * curveOffset,
            y: midY + perpY * curveOffset
        };
    }

    draw() {
        // Clear existing elements but preserve label, hit area, and anchors during active resize
        const childrenToRemove = [];
        const preserveSet = this._skipAnchors ? new Set([...this.anchors, this.selectionOutline].filter(Boolean)) : null;
        for (let i = 0; i < this.group.children.length; i++) {
            const child = this.group.children[i];
            if (child !== this.labelElement && child !== this._hitArea && child !== this._labelBg) {
                if (preserveSet && preserveSet.has(child)) continue;
                childrenToRemove.push(child);
            }
        }
        childrenToRemove.forEach(child => this.group.removeChild(child));

        const rc = rough.svg(svg);
        let lineElement;

        if (this.isCurved && this.controlPoint) {
            const pathData = `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`;
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineElement.setAttribute('d', pathData);
            lineElement.setAttribute('stroke', this.options.stroke || getThemeStroke());
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('fill', 'none');
            lineElement.setAttribute('stroke-linecap', 'round');
            if (this.options.strokeDasharray) {
                lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
            }
        } else if (this.isBeingDrawn || this.options.strokeDasharray) {
            // Use plain SVG for lines being drawn OR dashed/dotted lines
            // (RoughJS ignores strokeDasharray, so dashed styles must bypass it)
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineElement.setAttribute('x1', this.startPoint.x);
            lineElement.setAttribute('y1', this.startPoint.y);
            lineElement.setAttribute('x2', this.endPoint.x);
            lineElement.setAttribute('y2', this.endPoint.y);
            lineElement.setAttribute('stroke', this.options.stroke || getThemeStroke());
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('stroke-linecap', 'round');
            if (this.options.strokeDasharray) {
                lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
            }
        } else {
            lineElement = rc.line(
                this.startPoint.x, this.startPoint.y,
                this.endPoint.x, this.endPoint.y,
                this.options
            );
        }

        this.element = lineElement;
        this.group.appendChild(lineElement);

        // Hit area - thicker invisible path for dblclick detection
        if (!this._hitArea) {
            this._hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this._hitArea.setAttribute('fill', 'none');
            this._hitArea.setAttribute('stroke', 'transparent');
            this._hitArea.setAttribute('stroke-width', '20');
            this._hitArea.setAttribute('style', 'pointer-events: stroke;');
            this.group.appendChild(this._hitArea);
        }
        if (this.isCurved && this.controlPoint) {
            this._hitArea.setAttribute('d', `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`);
        } else {
            this._hitArea.setAttribute('d', `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`);
        }

        // Update embedded label at midpoint
        this._updateLabelElement();

        if (this.isSelected) {
            if (this._skipAnchors) {
                this.updateSelectionControls();
            } else {
                this.addAnchors();
            }
        }
    }

    _getMidpoint() {
        if (this.isCurved && this.controlPoint) {
            // Quadratic bezier midpoint at t=0.5
            const t = 0.5;
            const mx = (1 - t) * (1 - t) * this.startPoint.x + 2 * (1 - t) * t * this.controlPoint.x + t * t * this.endPoint.x;
            const my = (1 - t) * (1 - t) * this.startPoint.y + 2 * (1 - t) * t * this.controlPoint.y + t * t * this.endPoint.y;
            return { x: mx, y: my };
        }
        return {
            x: (this.startPoint.x + this.endPoint.x) / 2,
            y: (this.startPoint.y + this.endPoint.y) / 2
        };
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

        const mid = this._getMidpoint();
        this.labelElement.setAttribute('x', mid.x);
        this.labelElement.setAttribute('y', mid.y);
        this.labelElement.setAttribute('text-anchor', 'middle');
        this.labelElement.setAttribute('dominant-baseline', 'central');
        this.labelElement.setAttribute('fill', this.labelColor);
        this.labelElement.setAttribute('font-size', this.labelFontSize);
        this.labelElement.setAttribute('font-family', 'lixFont, sans-serif');
        this.labelElement.textContent = this.label;

        // Background knockout rect - hides the line behind the text
        const canvasBg = window.getComputedStyle(svg).backgroundColor || '#000';
        if (!this._labelBg) {
            this._labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this._labelBg.setAttribute('pointer-events', 'none');
        }
        this._labelBg.setAttribute('fill', canvasBg);
        const hPadding = 4;
        const vPadding = 1;
        const charWidth = this.labelFontSize * 0.6;
        const bgW = this.label.length * charWidth + hPadding * 2;
        const bgH = this.labelFontSize + vPadding * 2;
        this._labelBg.setAttribute('x', mid.x - bgW / 2);
        this._labelBg.setAttribute('y', mid.y - bgH / 2);
        this._labelBg.setAttribute('width', bgW);
        this._labelBg.setAttribute('height', bgH);
        this._labelBg.setAttribute('rx', 2);

        // Re-append bg then text at end so they render ON TOP of the line path
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
        if (this._labelBg) {
            this._labelBg.setAttribute('visibility', 'hidden');
        }

        // Get midpoint in screen coords via CTM
        const mid = this._getMidpoint();
        const ctm = this.group.getScreenCTM();
        if (!ctm) { this._isEditingLabel = false; return; }

        const pt = svg.createSVGPoint();
        pt.x = mid.x; pt.y = mid.y;
        const screenMid = pt.matrixTransform(ctm);

        const editW = 160;
        const editH = 28;

        // Create HTML overlay centered on the midpoint
        const overlay = document.createElement('div');
        overlay.className = 'shape-label-editor';
        overlay.style.cssText = `
            position: fixed; z-index: 10000;
            left: ${screenMid.x - editW / 2}px; top: ${screenMid.y - editH / 2}px;
            width: ${editW}px; height: ${editH}px;
            display: flex; align-items: center; justify-content: center;
            pointer-events: auto;
        `;

        const canvasBg = window.getComputedStyle(svg).backgroundColor || '#000';
        const input = document.createElement('div');
        input.setAttribute('contenteditable', 'true');
        input.style.cssText = `
            width: 100%; height: 100%;
            background: ${canvasBg}; border: none;
            outline: none; padding: 2px 6px;
            color: ${this.labelColor}; font-size: ${this.labelFontSize}px;
            font-family: lixFont, sans-serif; text-align: center;
            display: flex; align-items: center; justify-content: center;
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
            if (this.labelElement) this.labelElement.removeAttribute('visibility');
            if (this._labelBg) this._labelBg.removeAttribute('visibility');
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

    updateSelectionControls() {
        if (this.anchors.length === 0) return;

        // Update start anchor
        if (this.anchors[0]) {
            this.anchors[0].setAttribute('cx', this.startPoint.x);
            this.anchors[0].setAttribute('cy', this.startPoint.y);
        }

        // Update end anchor
        if (this.anchors[1]) {
            this.anchors[1].setAttribute('cx', this.endPoint.x);
            this.anchors[1].setAttribute('cy', this.endPoint.y);
        }

        // Update middle anchor
        if (this.anchors[2]) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            let anchorMidX = midX, anchorMidY = midY;
            if (this.isCurved && this.controlPoint) {
                anchorMidX = 0.25 * this.startPoint.x + 0.5 * this.controlPoint.x + 0.25 * this.endPoint.x;
                anchorMidY = 0.25 * this.startPoint.y + 0.5 * this.controlPoint.y + 0.25 * this.endPoint.y;
            }
            this.anchors[2].setAttribute('cx', anchorMidX);
            this.anchors[2].setAttribute('cy', anchorMidY);
        }
    }

    selectLine() {
    this.isSelected = true;
    this.addAnchors();
}

deselectLine() {
    this.isSelected = false;
    this.removeSelection();
}

// Update the complete removeSelection method
removeSelection() {
    // Remove anchors
    this.anchors.forEach(anchor => {
        if (anchor && anchor.parentNode === this.group) {
            this.group.removeChild(anchor);
        }
    });
    this.anchors = [];
    this.isSelected = false; // Only set to false when actually deselecting
}

    addAnchors() {
    // Only remove existing anchors if they exist, don't call full removeSelection
    this.anchors.forEach(anchor => {
        if (anchor && anchor.parentNode === this.group) {
            this.group.removeChild(anchor);
        }
    });
    this.anchors = [];
    
    const anchorSize = 10 / (currentZoom || 1);
    const anchorStrokeWidth = 2;
    
    // Start point anchor
    const startAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startAnchor.setAttribute('cx', this.startPoint.x);
    startAnchor.setAttribute('cy', this.startPoint.y);
    startAnchor.setAttribute('r', anchorSize / 2);
    startAnchor.setAttribute('fill', '#121212');
    startAnchor.setAttribute('stroke', '#5B57D1');
    startAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    startAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    startAnchor.setAttribute('class', 'anchor line-anchor');
    startAnchor.style.cursor = 'grab';
    startAnchor.style.pointerEvents = 'all';
    startAnchor.dataset.index = 0;
    this.group.appendChild(startAnchor);
    this.anchors[0] = startAnchor;

    // End point anchor
    const endAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    endAnchor.setAttribute('cx', this.endPoint.x);
    endAnchor.setAttribute('cy', this.endPoint.y);
    endAnchor.setAttribute('r', anchorSize / 2);
    endAnchor.setAttribute('fill', '#121212');
    endAnchor.setAttribute('stroke', '#5B57D1');
    endAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    endAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    endAnchor.setAttribute('class', 'anchor line-anchor');
    endAnchor.style.cursor = 'grab';
    endAnchor.style.pointerEvents = 'all';
    endAnchor.dataset.index = 1;
    this.group.appendChild(endAnchor);
    this.anchors[1] = endAnchor;

    // Middle anchor for curving - positioned ON the bezier curve at t=0.5
    const midX = (this.startPoint.x + this.endPoint.x) / 2;
    const midY = (this.startPoint.y + this.endPoint.y) / 2;
    let anchorMidX = midX, anchorMidY = midY;
    if (this.isCurved && this.controlPoint) {
        // Bezier point at t=0.5: 0.25*P0 + 0.5*CP + 0.25*P1
        anchorMidX = 0.25 * this.startPoint.x + 0.5 * this.controlPoint.x + 0.25 * this.endPoint.x;
        anchorMidY = 0.25 * this.startPoint.y + 0.5 * this.controlPoint.y + 0.25 * this.endPoint.y;
    }

    const middleAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    middleAnchor.setAttribute('cx', anchorMidX);
    middleAnchor.setAttribute('cy', anchorMidY);
    middleAnchor.setAttribute('r', anchorSize / 2);
    middleAnchor.setAttribute('fill', this.isCurved ? '#5B57D1' : '#121212');
    middleAnchor.setAttribute('stroke', '#5B57D1');
    middleAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    middleAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    middleAnchor.setAttribute('class', 'anchor line-middle-anchor');
    middleAnchor.style.cursor = 'grab';
    middleAnchor.style.pointerEvents = 'all';
    middleAnchor.dataset.index = 2;
    this.group.appendChild(middleAnchor);
    this.anchors[2] = middleAnchor;

    // Show line sidebar
    disableAllSideBars();
    lineSideBar.classList.remove("hidden");
    if (window.__showSidebarForShape) window.__showSidebarForShape('line');
    this.updateSidebar();
    }

    isNearAnchor(x, y) {
        if (!this.isSelected) return null;
        const buffer = 15; // Increased buffer for easier selection
        const anchorSize = 10 / (currentZoom || 1);

        // Check anchors
        for (let i = 0; i < this.anchors.length; i++) {
            const anchor = this.anchors[i];
            if (anchor) {
                const anchorX = parseFloat(anchor.getAttribute('cx'));
                const anchorY = parseFloat(anchor.getAttribute('cy'));
                const distance = Math.sqrt(Math.pow(x - anchorX, 2) + Math.pow(y - anchorY, 2));
                if (distance <= anchorSize / 2 + buffer) {
                    return { type: 'anchor', index: i };
                }
            }
        }
        
        return null;
    }

    updatePosition(anchorIndex, newX, newY) {
        if (anchorIndex === 0) {
            this.startPoint.x = newX;
            this.startPoint.y = newY;
        } else if (anchorIndex === 1) {
            this.endPoint.x = newX;
            this.endPoint.y = newY;
        } else if (anchorIndex === 2) {
            // Middle anchor - dragged position is ON the curve (bezier t=0.5)
            if (!this.isCurved) {
                this.isCurved = true;
            }
            // Invert bezier formula: CP = 2*M - 0.5*(P0+P1)
            this.controlPoint = {
                x: 2 * newX - 0.5 * (this.startPoint.x + this.endPoint.x),
                y: 2 * newY - 0.5 * (this.startPoint.y + this.endPoint.y)
            };
        }

        this.scheduleDragRender();
    }

    scheduleDragRender() {
        if (this._dragRenderFrame !== null) return;
        if (typeof requestAnimationFrame !== 'function') {
            this.renderDragGeometry();
            return;
        }
        this._dragRenderFrame = requestAnimationFrame(() => {
            this._dragRenderFrame = null;
            this.renderDragGeometry();
        });
    }

    renderDragGeometry() {
        this.updateLineElement();
        this.updateAnchorPositions();
        if (this._hitArea) {
            const path = this.isCurved && this.controlPoint
                ? `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`
                : `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
            this._hitArea.setAttribute('d', path);
        }
        this._updateLabelElement();
    }

    finalizeMove() {
        if (this._dragRenderFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._dragRenderFrame);
        }
        this._dragRenderFrame = null;
        this.draw();
    }

    updateLineElement() {
        // Update just the line element without rebuilding entire structure
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        const rc = rough.svg(svg);
        let lineElement;

        if (this.isCurved && this.controlPoint) {
            const pathData = `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`;
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineElement.setAttribute('d', pathData);
            lineElement.setAttribute('stroke', this.options.stroke || getThemeStroke());
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('fill', 'none');
            lineElement.setAttribute('stroke-linecap', 'round');
            if (this.options.strokeDasharray) {
                lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
            }
        } else if (this.options.strokeDasharray) {
            // Dashed/dotted lines must use plain SVG (RoughJS ignores strokeDasharray)
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineElement.setAttribute('x1', this.startPoint.x);
            lineElement.setAttribute('y1', this.startPoint.y);
            lineElement.setAttribute('x2', this.endPoint.x);
            lineElement.setAttribute('y2', this.endPoint.y);
            lineElement.setAttribute('stroke', this.options.stroke || getThemeStroke());
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('stroke-linecap', 'round');
            lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
        } else {
            lineElement = rc.line(
                this.startPoint.x, this.startPoint.y,
                this.endPoint.x, this.endPoint.y,
                this.options
            );
        }

        this.element = lineElement;
        this.group.insertBefore(lineElement, this.group.firstChild);
    }

    updateAnchorPositions() {
        // Update anchor positions without rebuilding them
        if (this.anchors[0]) {
            this.anchors[0].setAttribute('cx', this.startPoint.x);
            this.anchors[0].setAttribute('cy', this.startPoint.y);
        }
        if (this.anchors[1]) {
            this.anchors[1].setAttribute('cx', this.endPoint.x);
            this.anchors[1].setAttribute('cy', this.endPoint.y);
        }
        if (this.anchors[2]) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            let anchorMidX = midX, anchorMidY = midY;
            if (this.isCurved && this.controlPoint) {
                // Bezier point at t=0.5: 0.25*P0 + 0.5*CP + 0.25*P1
                anchorMidX = 0.25 * this.startPoint.x + 0.5 * this.controlPoint.x + 0.25 * this.endPoint.x;
                anchorMidY = 0.25 * this.startPoint.y + 0.5 * this.controlPoint.y + 0.25 * this.endPoint.y;
            }
            this.anchors[2].setAttribute('cx', anchorMidX);
            this.anchors[2].setAttribute('cy', anchorMidY);
            this.anchors[2].setAttribute('fill', this.isCurved ? '#5B57D1' : '#121212');
        }
    }

    // Add move method for dragging the entire line
    move(dx, dy) {
        this.startPoint.x += dx;
        this.startPoint.y += dy;
        this.endPoint.x += dx;
        this.endPoint.y += dy;
        if (this.controlPoint) {
            this.controlPoint.x += dx;
            this.controlPoint.y += dy;
        }

        // Multiple pointer/snap updates in one browser frame collapse into a
        // single DOM + RoughJS update.
        this.scheduleDragRender();

        // Only update frame containment if not being moved by a parent frame
        if (!this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }

        this.updateAttachedArrows();
    }

    updateAttachedArrows() {
        updateArrowsForShape(this);
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
        if (this.parentFrame) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameLine && hoveredFrameLine !== targetFrame) {
            hoveredFrameLine.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameLine) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameLine = targetFrame;
    }

    contains(x, y) {
        const tolerance = 8 / (currentZoom || 1); // Slightly larger tolerance for easier selection
        
        if (this.isCurved && this.controlPoint) {
            return this.pointToQuadraticBezierDistance(x, y) <= tolerance;
        } else {
            return this.pointToLineDistance(x, y, this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y) <= tolerance;
        }
    }

    pointToQuadraticBezierDistance(x, y) {
        let minDistance = Infinity;
        const steps = 50; // Reduced steps for better performance

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.getQuadraticBezierPoint(t);
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            minDistance = Math.min(minDistance, distance);
        }

        return minDistance;
    }

    getQuadraticBezierPoint(t) {
        if (!this.controlPoint) return this.startPoint;
        
        const mt = 1 - t;
        return {
            x: mt * mt * this.startPoint.x + 2 * mt * t * this.controlPoint.x + t * t * this.endPoint.x,
            y: mt * mt * this.startPoint.y + 2 * mt * t * this.controlPoint.y + t * t * this.endPoint.y
        };
    }

    pointToLineDistance(x, y, x1, y1, x2, y2) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // No-op: React sidebar handles UI updates via Zustand store
    updateSidebar() {}
}

export { Line };
