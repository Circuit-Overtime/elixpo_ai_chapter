/* eslint-disable */
import { resolveThemeLabelColor } from '../utils/themeColors.js';
// Arrow shape class - extracted from drawArrow.js
// Depends on globals: svg, shapes, rough, currentShape, currentZoom
import { DEFAULT_SHAPE_LABEL_FONT_SIZE } from '../core/ShapeLabelLayout.js';

let isDragging = false;
let hoveredFrameArrow = null;
let dragOldPosArrow = null;

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

class Arrow {
    constructor(startPoint, endPoint, options = {}) {
        this.startPoint = startPoint;
        this.endPoint = endPoint;
        this.options = {
            stroke: options.stroke || "#fff",
            strokeWidth: options.strokeWidth || 2,
            strokeDasharray: options.arrowOutlineStyle === "dashed" ? "10,10" : (options.arrowOutlineStyle === "dotted" ? "2,8" : ""),
            fill: 'none',
            ...options
        };
        this.arrowOutlineStyle = options.arrowOutlineStyle || "solid";
        this.arrowHeadStyle = options.arrowHeadStyle || "default";
        this.arrowHeadLength = parseFloat(options.arrowHeadLength || 15);
        this.arrowHeadAngleDeg = parseFloat(options.arrowHeadAngleDeg || 30);
        this.arrowCurved = options.arrowCurved !== undefined ? options.arrowCurved : "straight";
        this.arrowCurveAmount = options.arrowCurveAmount || 50;

        // Control points for curved arrows
        this.controlPoint1 = options.controlPoint1 || null;
        this.controlPoint2 = options.controlPoint2 || null;


        this.attachedToStart = null;
        this.attachedToEnd = null;
        this.parentFrame = null;
        this.element = null;
        this.elbowX = options.elbowX !== undefined ? options.elbowX : null;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.isSelected = false;
        this.anchors = [];
        this.shapeName = "arrow";
        this.shapeID = `arrow-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);

        // Embedded label support
        this.label = options.label || '';
        this.labelElement = null;
        this.labelColor = resolveThemeLabelColor(options.labelColor);
        this.labelFontSize = options.labelFontSize || DEFAULT_SHAPE_LABEL_FONT_SIZE;
        this.labelBg = options.labelBg !== false; // labelBg:false → no knockout rect behind label
        this.labelOffsetY = options.labelOffsetY || 0; // shift label along the perpendicular of the line, e.g. lift it clear of the stroke
        this._isEditingLabel = false;
        this._hitArea = null;
        this._labelBg = null;

        // Initialize control points if curved
        if (this.arrowCurved === "curved" && !this.controlPoint1 && !this.controlPoint2) {
            this.initializeCurveControlPoints();
        }

        svg.appendChild(this.group);
        this._setupLabelDblClick();
        this.draw();
    }

    get x() {
    return Math.min(this.startPoint.x, this.endPoint.x);
    }

    set x(value) {
        const currentX = this.x;
        const dx = value - currentX;
        this.startPoint.x += dx;
        this.endPoint.x += dx;
        if (this.controlPoint1) this.controlPoint1.x += dx;
        if (this.controlPoint2) this.controlPoint2.x += dx;
    }

    get y() {
        return Math.min(this.startPoint.y, this.endPoint.y);
    }

    set y(value) {
        const currentY = this.y;
        const dy = value - currentY;
        this.startPoint.y += dy;
        this.endPoint.y += dy;
        if (this.controlPoint1) this.controlPoint1.y += dy;
        if (this.controlPoint2) this.controlPoint2.y += dy;
    }

    get width() {
        return Math.abs(this.endPoint.x - this.startPoint.x);
    }

    set width(value) {
        const centerX = (this.startPoint.x + this.endPoint.x) / 2;
        const halfWidth = value / 2;
        this.startPoint.x = centerX - halfWidth;
        this.endPoint.x = centerX + halfWidth;
    }

    get height() {
        return Math.abs(this.endPoint.y - this.startPoint.y);
    }

    set height(value) {
        const centerY = (this.startPoint.y + this.endPoint.y) / 2;
        const halfHeight = value / 2;
        this.startPoint.y = centerY - halfHeight;
        this.endPoint.y = centerY + halfHeight;
    }

    initializeCurveControlPoints() {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0 || isNaN(distance)) {
            this.controlPoint1 = { x: this.startPoint.x + 20, y: this.startPoint.y };
            this.controlPoint2 = { x: this.endPoint.x - 20, y: this.endPoint.y };
            return;
        }

        const perpX = -dy / distance;
        const perpY = dx / distance;
        const curveOffset = this.arrowCurveAmount;

        const t1 = 0.33;
        const point1X = this.startPoint.x + t1 * dx;
        const point1Y = this.startPoint.y + t1 * dy;
        this.controlPoint1 = {
            x: point1X + perpX * curveOffset,
            y: point1Y + perpY * curveOffset
        };

        const t2 = 0.67;
        const point2X = this.startPoint.x + t2 * dx;
        const point2Y = this.startPoint.y + t2 * dy;
        this.controlPoint2 = {
            x: point2X - perpX * curveOffset,
            y: point2Y - perpY * curveOffset
        };
    }

    _buildElbowPath(elbowX, shortenEnd) {
        const x1 = this.startPoint.x, y1 = this.startPoint.y;
        const x2 = this.endPoint.x,   y2 = this.endPoint.y;
        const r = Math.min(
            Math.abs(this.arrowCurveAmount),
            Math.abs(elbowX - x1) / 2,
            Math.abs(x2 - elbowX) / 2,
            Math.abs(y2 - y1) / 2
        );
        const dx = elbowX >= x1 ? 1 : -1;
        const ex = x2 >= elbowX ? 1 : -1;
        const dy = y2 >= y1 ? 1 : -1;
        let endX = x2;
        if (shortenEnd) {
            endX = x2 - ex * (this.arrowHeadLength * 0.3);
        }
        if (r > 2 && Math.abs(elbowX - x1) > r * 2 && Math.abs(x2 - elbowX) > r * 2 && Math.abs(y2 - y1) > r * 2) {
            return `M ${x1} ${y1}` +
                   ` H ${elbowX - dx * r}` +
                   ` Q ${elbowX} ${y1} ${elbowX} ${y1 + dy * r}` +
                   ` V ${y2 - dy * r}` +
                   ` Q ${elbowX} ${y2} ${elbowX + ex * r} ${y2}` +
                   ` H ${endX}`;
        }
        return `M ${x1} ${y1} H ${elbowX} V ${y2} H ${endX}`;
    }

    selectArrow() {
        this.isSelected = true;
        disableAllSideBars();
        arrowSideBar.classList.remove("hidden");
        if (window.__showSidebarForShape) window.__showSidebarForShape('arrow');
        this.updateSidebar();
        this.draw();
    }

    removeSelection() {
        this.anchors.forEach(anchor => {
             if (anchor.parentNode === this.group) {
                 this.group.removeChild(anchor);
             }
         });
        this.anchors = [];
        this.isSelected = false;
    }

    attachToShape(isStartPoint, shape, attachment) {
        if (isStartPoint) {
            this.attachedToStart = {
                shape: shape,
                side: attachment.side,
                offset: attachment.offset
            };
            this.startPoint = attachment.point;
        } else {
            this.attachedToEnd = {
                shape: shape,
                side: attachment.side,
                offset: attachment.offset
            };
            this.endPoint = attachment.point;
        }

        // Update control points if curved
        if (this.arrowCurved === "curved") {
            this.initializeCurveControlPoints();
        }

        this.draw();
    }

    draw() {
        // Clean up existing arrowhead element before redraw
        if (this._arrowHeadEl) {
            this._arrowHeadEl.remove();
            this._arrowHeadEl = null;
        }

        const childrenToRemove = [];
        const anchorSet = this._skipAnchors ? new Set(this.anchors) : null;
        for (let i = 0; i < this.group.children.length; i++) {
            const child = this.group.children[i];
            if (child !== this.labelElement && child !== this._hitArea && child !== this._labelBg) {
                if (anchorSet && anchorSet.has(child)) continue;
                childrenToRemove.push(child);
            }
        }
        childrenToRemove.forEach(child => this.group.removeChild(child));
        if (!this._skipAnchors) this.anchors = [];

        let pathData;
        let arrowEndPoint = this.endPoint;

        const elbowX = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            if (isNaN(this.controlPoint1.x) || isNaN(this.controlPoint1.y) ||
                isNaN(this.controlPoint2.x) || isNaN(this.controlPoint2.y)) {
                this.initializeCurveControlPoints();
            }

            pathData = `M ${this.startPoint.x} ${this.startPoint.y} ` +
                      `C ${this.controlPoint1.x} ${this.controlPoint1.y}, ` +
                      `${this.controlPoint2.x} ${this.controlPoint2.y}, ` +
                      `${this.endPoint.x} ${this.endPoint.y}`;

            // Shorten curve endpoint so arrowhead sits cleanly at the tip
            const t = 0.95;
            const tangent = this.getCubicBezierTangent(t);
            const curveAngle = Math.atan2(tangent.y, tangent.x);

            if (this.arrowHeadStyle && this.arrowHeadStyle !== 'none') {
                arrowEndPoint = {
                    x: this.endPoint.x - (this.arrowHeadLength * 0.3) * Math.cos(curveAngle),
                    y: this.endPoint.y - (this.arrowHeadLength * 0.3) * Math.sin(curveAngle)
                };

                pathData = `M ${this.startPoint.x} ${this.startPoint.y} ` +
                          `C ${this.controlPoint1.x} ${this.controlPoint1.y}, ` +
                          `${this.controlPoint2.x} ${this.controlPoint2.y}, ` +
                          `${arrowEndPoint.x} ${arrowEndPoint.y}`;
            }
        } else if (this.arrowCurved === "elbow") {
            pathData = this._buildElbowPath(elbowX, false);
        } else {
            pathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
        }

        // Render arrowhead
        const headAngle = this._getArrowAngle(elbowX);
        if (this.arrowHeadStyle === "default") {
            const pts = this._getArrowHeadPoints(headAngle);
            pathData += ` M ${pts.x3} ${pts.y3} L ${this.endPoint.x} ${this.endPoint.y} L ${pts.x4} ${pts.y4}`;
        } else {
            this._renderArrowHead(headAngle);
        }

        const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowPath.setAttribute("d", pathData);
        arrowPath.setAttribute("stroke", this.options.stroke);
        arrowPath.setAttribute("stroke-width", this.options.strokeWidth);
        arrowPath.setAttribute("fill", this.options.fill);

        if (this.options.strokeDasharray) {
             arrowPath.setAttribute("stroke-dasharray", this.options.strokeDasharray);
        } else {
             arrowPath.removeAttribute("stroke-dasharray");
        }

        arrowPath.setAttribute("stroke-linecap", "round");
        arrowPath.setAttribute("stroke-linejoin", "round");
        arrowPath.classList.add("arrow-path");

        this.element = arrowPath;
        this.group.appendChild(this.element);

        // Hit area - thicker invisible path for dblclick detection
        {
            let hitPathData;
            if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
                hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} C ${this.controlPoint1.x} ${this.controlPoint1.y}, ${this.controlPoint2.x} ${this.controlPoint2.y}, ${this.endPoint.x} ${this.endPoint.y}`;
            } else if (this.arrowCurved === "elbow") {
                const ex = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
                hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${ex} ${this.startPoint.y} L ${ex} ${this.endPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
            } else {
                hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
            }
            if (!this._hitArea) {
                this._hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this._hitArea.setAttribute('fill', 'none');
                this._hitArea.setAttribute('stroke', 'transparent');
                this._hitArea.setAttribute('stroke-width', '20');
                this._hitArea.setAttribute('style', 'pointer-events: stroke;');
                this.group.appendChild(this._hitArea);
            }
            this._hitArea.setAttribute('d', hitPathData);
        }

        // Update embedded label at midpoint
        this._updateLabelElement();

        if (this.isSelected) {
            if (this._skipAnchors) {
                this.updateSelectionControls();
            } else {
                this.addAnchors();
                this.addAttachmentIndicators();
            }
        }
    }

    _buildFullPathData() {
        let pathData;
        const elbowX = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            if (isNaN(this.controlPoint1.x) || isNaN(this.controlPoint1.y) ||
                isNaN(this.controlPoint2.x) || isNaN(this.controlPoint2.y)) {
                this.initializeCurveControlPoints();
            }
            pathData = `M ${this.startPoint.x} ${this.startPoint.y} ` +
                      `C ${this.controlPoint1.x} ${this.controlPoint1.y}, ` +
                      `${this.controlPoint2.x} ${this.controlPoint2.y}, ` +
                      `${this.endPoint.x} ${this.endPoint.y}`;

            if (this.arrowHeadStyle && this.arrowHeadStyle !== 'none') {
                const t = 0.95;
                const tangent = this.getCubicBezierTangent(t);
                const angle = Math.atan2(tangent.y, tangent.x);
                const arrowEndPoint = {
                    x: this.endPoint.x - (this.arrowHeadLength * 0.3) * Math.cos(angle),
                    y: this.endPoint.y - (this.arrowHeadLength * 0.3) * Math.sin(angle)
                };
                pathData = `M ${this.startPoint.x} ${this.startPoint.y} ` +
                          `C ${this.controlPoint1.x} ${this.controlPoint1.y}, ` +
                          `${this.controlPoint2.x} ${this.controlPoint2.y}, ` +
                          `${arrowEndPoint.x} ${arrowEndPoint.y}`;
            }
        } else if (this.arrowCurved === "elbow") {
            pathData = this._buildElbowPath(elbowX, false);
        } else {
            pathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
        }

        // Only include arrowhead in path string for default style
        if (this.arrowHeadStyle === "default") {
            const angle = this._getArrowAngle(elbowX);
            const pts = this._getArrowHeadPoints(angle);
            pathData += ` M ${pts.x3} ${pts.y3} L ${this.endPoint.x} ${this.endPoint.y} L ${pts.x4} ${pts.y4}`;
        }
        return pathData;
    }

    _updatePathElement() {
        if (!this.element) return;
        this.element.setAttribute("d", this._buildFullPathData());
        this._updateArrowHead();
    }

    _updateHitArea() {
        if (!this._hitArea) return;
        let hitPathData;
        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} C ${this.controlPoint1.x} ${this.controlPoint1.y}, ${this.controlPoint2.x} ${this.controlPoint2.y}, ${this.endPoint.x} ${this.endPoint.y}`;
        } else if (this.arrowCurved === "elbow") {
            const ex = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${ex} ${this.startPoint.y} L ${ex} ${this.endPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
        } else {
            hitPathData = `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
        }
        this._hitArea.setAttribute('d', hitPathData);
    }

    _getMidpoint() {
        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            const p = this.getCubicBezierPoint(0.5);
            return { x: p.x, y: p.y };
        }
        if (this.arrowCurved === "elbow") {
            const ex = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            return { x: ex, y: (this.startPoint.y + this.endPoint.y) / 2 };
        }
        return {
            x: (this.startPoint.x + this.endPoint.x) / 2,
            y: (this.startPoint.y + this.endPoint.y) / 2
        };
    }

    _updateAnchorPositions() {
        if (!this.anchors || this.anchors.length === 0) return;

        const anchorSize = 5 / currentZoom;
        let anchorPositions = [this.startPoint, this.endPoint];

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            const midOnCurve = this.getCubicBezierPoint(0.5);
            anchorPositions.push(midOnCurve);
        } else if (this.arrowCurved === "elbow") {
            const elbowXVal = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            anchorPositions.push({ x: elbowXVal, y: midY });
        } else {
            // straight — offset end anchor past arrowhead
            const arrowAngle = Math.atan2(this.endPoint.y - this.startPoint.y, this.endPoint.x - this.startPoint.x);
            const arrowHeadClearance = this.arrowHeadLength + anchorSize - 10;
            anchorPositions[1] = {
                x: this.endPoint.x + arrowHeadClearance * Math.cos(arrowAngle),
                y: this.endPoint.y + arrowHeadClearance * Math.sin(arrowAngle)
            };
        }

        anchorPositions.forEach((point, index) => {
            if (this.anchors[index]) {
                this.anchors[index].setAttribute('cx', point.x);
                this.anchors[index].setAttribute('cy', point.y);
            }
        });
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
        let lx = mid.x, ly = mid.y;
        if (this.labelOffsetY) {
            // Offset perpendicular to the line direction so the label lifts
            // clear of the stroke instead of sitting centered on top of it.
            const dx = this.endPoint.x - this.startPoint.x;
            const dy = this.endPoint.y - this.startPoint.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            lx += (-dy / len) * this.labelOffsetY;
            ly += (dx / len) * this.labelOffsetY;
        }
        this.labelElement.setAttribute('x', lx);
        this.labelElement.setAttribute('y', ly);
        this.labelElement.setAttribute('text-anchor', 'middle');
        this.labelElement.setAttribute('dominant-baseline', 'central');
        this.labelElement.setAttribute('fill', this.labelColor);
        this.labelElement.setAttribute('font-size', this.labelFontSize);
        this.labelElement.setAttribute('font-family', 'lixFont, sans-serif');
        this.labelElement.textContent = this.label;

        if (!this.labelBg) {
            if (this._labelBg && this._labelBg.parentNode === this.group) {
                this.group.removeChild(this._labelBg);
                this._labelBg = null;
            }
            if (this.labelElement.parentNode === this.group) this.group.removeChild(this.labelElement);
            this.group.appendChild(this.labelElement);
            return;
        }

        // Background knockout rect - hides the arrow behind the text
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
        this._labelBg.setAttribute('x', lx - bgW / 2);
        this._labelBg.setAttribute('y', ly - bgH / 2);
        this._labelBg.setAttribute('width', bgW);
        this._labelBg.setAttribute('height', bgH);
        this._labelBg.setAttribute('rx', 2);

        // Re-append bg then text at end so they render ON TOP of the arrow path
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

    getCubicBezierPoint(t) {
        if (!this.controlPoint1 || !this.controlPoint2) return this.startPoint;

        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x: mt3 * this.startPoint.x + 3 * mt2 * t * this.controlPoint1.x +
               3 * mt * t2 * this.controlPoint2.x + t3 * this.endPoint.x,
            y: mt3 * this.startPoint.y + 3 * mt2 * t * this.controlPoint1.y +
               3 * mt * t2 * this.controlPoint2.y + t3 * this.endPoint.y
        };
    }

    getCubicBezierTangent(t) {
        if (!this.controlPoint1 || !this.controlPoint2) {
            return { x: this.endPoint.x - this.startPoint.x, y: this.endPoint.y - this.startPoint.y };
        }

        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;

        return {
            x: 3 * mt2 * (this.controlPoint1.x - this.startPoint.x) +
               6 * mt * t * (this.controlPoint2.x - this.controlPoint1.x) +
               3 * t2 * (this.endPoint.x - this.controlPoint2.x),
            y: 3 * mt2 * (this.controlPoint1.y - this.startPoint.y) +
               6 * mt * t * (this.controlPoint2.y - this.controlPoint1.y) +
               3 * t2 * (this.endPoint.y - this.controlPoint2.y)
        };
    }

    _getArrowAngle(elbowX) {
        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            const tangent = this.getCubicBezierTangent(1.0);
            return Math.atan2(tangent.y, tangent.x);
        } else if (this.arrowCurved === "elbow") {
            const ex = elbowX !== undefined ? elbowX : (this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2);
            return Math.atan2(0, this.endPoint.x - ex);
        } else {
            const dx = this.endPoint.x - this.startPoint.x;
            const dy = this.endPoint.y - this.startPoint.y;
            return Math.atan2(dy, dx);
        }
    }

    _getArrowHeadPoints(angle) {
        const rad = (this.arrowHeadAngleDeg * Math.PI) / 180;
        return {
            x3: this.endPoint.x - this.arrowHeadLength * Math.cos(angle - rad),
            y3: this.endPoint.y - this.arrowHeadLength * Math.sin(angle - rad),
            x4: this.endPoint.x - this.arrowHeadLength * Math.cos(angle + rad),
            y4: this.endPoint.y - this.arrowHeadLength * Math.sin(angle + rad)
        };
    }

    _renderArrowHead(angle) {
        if (this._arrowHeadEl) {
            this._arrowHeadEl.remove();
            this._arrowHeadEl = null;
        }

        const style = this.arrowHeadStyle;
        if (!style || style === 'default') return; // default is handled inline in pathData

        const pts = this._getArrowHeadPoints(angle);
        const tip = this.endPoint;
        let el;

        if (style === 'square') {
            const size = this.arrowHeadLength * 0.7;
            const perpX = -Math.sin(angle), perpY = Math.cos(angle);
            const backX = -Math.cos(angle), backY = -Math.sin(angle);
            const p1x = tip.x + perpX * size / 2, p1y = tip.y + perpY * size / 2;
            const p2x = tip.x - perpX * size / 2, p2y = tip.y - perpY * size / 2;
            const p3x = p2x + backX * size, p3y = p2y + backY * size;
            const p4x = p1x + backX * size, p4y = p1y + backY * size;
            el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            el.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`);
            el.setAttribute("fill", "none");
        } else {
            // outline or solid - triangle
            el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            el.setAttribute("points", `${pts.x3},${pts.y3} ${tip.x},${tip.y} ${pts.x4},${pts.y4}`);
            el.setAttribute("fill", style === 'solid' ? this.options.stroke : "none");
        }

        el.setAttribute("stroke", this.options.stroke);
        el.setAttribute("stroke-width", this.options.strokeWidth);
        el.setAttribute("stroke-linejoin", "round");
        el.classList.add("arrow-head");
        this._arrowHeadEl = el;
        this.group.appendChild(el);
    }

    _updateArrowHead() {
        if (!this._arrowHeadEl) return;
        const style = this.arrowHeadStyle;
        if (style === 'default' || !style) return;

        const elbowX = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
        const angle = this._getArrowAngle(elbowX);
        const pts = this._getArrowHeadPoints(angle);
        const tip = this.endPoint;

        if (style === 'square') {
            const size = this.arrowHeadLength * 0.7;
            const perpX = -Math.sin(angle), perpY = Math.cos(angle);
            const backX = -Math.cos(angle), backY = -Math.sin(angle);
            const p1x = tip.x + perpX * size / 2, p1y = tip.y + perpY * size / 2;
            const p2x = tip.x - perpX * size / 2, p2y = tip.y - perpY * size / 2;
            const p3x = p2x + backX * size, p3y = p2y + backY * size;
            const p4x = p1x + backX * size, p4y = p1y + backY * size;
            this._arrowHeadEl.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`);
        } else {
            this._arrowHeadEl.setAttribute("points", `${pts.x3},${pts.y3} ${tip.x},${tip.y} ${pts.x4},${pts.y4}`);
        }
    }

    updateSelectionControls() {
        if (!this.anchors || this.anchors.length === 0) return;

        const anchorSize = 5 / currentZoom;

        let anchorPositions = [this.startPoint, this.endPoint];

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            const midOnCurve = this.getCubicBezierPoint(0.5);
            anchorPositions.push(midOnCurve);
        } else if (this.arrowCurved === "elbow") {
            const elbowXVal = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            anchorPositions.push({ x: elbowXVal, y: midY });
        } else {
            // straight — offset end anchor past arrowhead
            const arrowAngle = Math.atan2(this.endPoint.y - this.startPoint.y, this.endPoint.x - this.startPoint.x);
            const arrowHeadClearance = this.arrowHeadLength + anchorSize - 10;
            anchorPositions[1] = {
                x: this.endPoint.x + arrowHeadClearance * Math.cos(arrowAngle),
                y: this.endPoint.y + arrowHeadClearance * Math.sin(arrowAngle)
            };
        }

        anchorPositions.forEach((point, index) => {
            if (this.anchors[index]) {
                this.anchors[index].setAttribute("cx", point.x);
                this.anchors[index].setAttribute("cy", point.y);
                this.anchors[index].setAttribute("r", anchorSize);
            }
        });
    }

    addAnchors() {
        const anchorSize = 5 / currentZoom;
        const anchorStrokeWidth = 2;

        let anchorPositions = [this.startPoint, this.endPoint];

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            // Show a single on-curve anchor at t=0.5 for intuitive dragging
            const midOnCurve = this.getCubicBezierPoint(0.5);
            anchorPositions.push(midOnCurve);
        } else if (this.arrowCurved === "elbow") {
            const elbowXVal = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            anchorPositions.push({ x: elbowXVal, y: midY });
        } else {
            // straight — offset end anchor past arrowhead
            const arrowAngle = Math.atan2(this.endPoint.y - this.startPoint.y, this.endPoint.x - this.startPoint.x);
            const arrowHeadClearance = this.arrowHeadLength + anchorSize - 10;
            anchorPositions[1] = {
                x: this.endPoint.x + arrowHeadClearance * Math.cos(arrowAngle),
                y: this.endPoint.y + arrowHeadClearance * Math.sin(arrowAngle)
            };
        }

        // Show sidebar
        disableAllSideBars();
        arrowSideBar.classList.remove("hidden");
        if (window.__showSidebarForShape) window.__showSidebarForShape('arrow');
        this.updateSidebar();

        anchorPositions.forEach((point, index) => {
            const anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            anchor.setAttribute("cx", point.x);
            anchor.setAttribute("cy", point.y);
            anchor.setAttribute("r", anchorSize);

            if (this.arrowCurved && index >= 2) {
                anchor.setAttribute("fill", "#121212");
                anchor.setAttribute("stroke", "#5B57D1");
            } else {
                anchor.setAttribute("fill", "#121212");
                anchor.setAttribute("stroke", "#5B57D1");
            }

            anchor.setAttribute("stroke-width", anchorStrokeWidth);
            anchor.setAttribute("vector-effect", "non-scaling-stroke");
            anchor.setAttribute("class", "anchor arrow-anchor");
            anchor.setAttribute("data-index", index);
            anchor.style.cursor = "grab";
            anchor.style.pointerEvents = "all";
            anchor.addEventListener('pointerdown', (e) => this.startAnchorDrag(e, index));

            this.group.appendChild(anchor);
            this.anchors[index] = anchor;
        });
    }

    addAttachmentIndicators() {
        if (this.attachedToStart) {
            const attachPoint = this.calculateAttachedPoint(this.attachedToStart);
            const indicator = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            indicator.setAttribute("cx", attachPoint.x);
            indicator.setAttribute("cy", attachPoint.y);
            indicator.setAttribute("r", 4);
            indicator.setAttribute("fill", "#5B57D1");
            indicator.setAttribute("stroke", "#121212");
            indicator.setAttribute("stroke-width", 1);
            indicator.setAttribute("class", "attachment-indicator");
            this.group.appendChild(indicator);
        }

        if (this.attachedToEnd) {
            const attachPoint = this.calculateAttachedPoint(this.attachedToEnd);
            const indicator = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            indicator.setAttribute("cx", attachPoint.x);
            indicator.setAttribute("cy", attachPoint.y);
            indicator.setAttribute("r", 4);
            indicator.setAttribute("fill", "#5B57D1");
            indicator.setAttribute("stroke", "#121212");
            indicator.setAttribute("stroke-width", 1);
            indicator.setAttribute("class", "attachment-indicator");
            this.group.appendChild(indicator);
        }
    }

    getAttachmentState() {
        return {
            attachedToStart: this.attachedToStart ? {
                shapeId: this.attachedToStart.shape.shapeID,
                side: this.attachedToStart.side,
                offset: { ...this.attachedToStart.offset }
            } : null,
            attachedToEnd: this.attachedToEnd ? {
                shapeId: this.attachedToEnd.shape.shapeID,
                side: this.attachedToEnd.side,
                offset: { ...this.attachedToEnd.offset }
            } : null
        };
    }

    restoreAttachmentState(attachmentState) {
        this.attachedToStart = null;
        this.attachedToEnd = null;

        if (attachmentState.attachedToStart) {
            const shape = shapes.find(s => s.shapeID === attachmentState.attachedToStart.shapeId);
            if (shape) {
                this.attachedToStart = {
                    shape: shape,
                    side: attachmentState.attachedToStart.side,
                    offset: { ...attachmentState.attachedToStart.offset }
                };
                this.startPoint = this.calculateAttachedPoint(this.attachedToStart);
            }
        }

        if (attachmentState.attachedToEnd) {
            const shape = shapes.find(s => s.shapeID === attachmentState.attachedToEnd.shapeId);
            if (shape) {
                this.attachedToEnd = {
                    shape: shape,
                    side: attachmentState.attachedToEnd.side,
                    offset: { ...attachmentState.attachedToEnd.offset }
                };
                this.endPoint = this.calculateAttachedPoint(this.attachedToEnd);
            }
        }

        if (this.arrowCurved === "curved") {
            this.initializeCurveControlPoints();
        }

        this.draw();
    }

    static getEllipsePerimeterPoint(circle, angle) {
        // Calculate point on ellipse perimeter at given angle
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        const a = circle.rx;
        const b = circle.ry;

        const t = Math.atan2(a * sinAngle, b * cosAngle);

        return {
            x: circle.x + a * Math.cos(t),
            y: circle.y + b * Math.sin(t)
        };
    }


    static findNearbyShape(point, tolerance = 20) {
    for (let shape of shapes) {
        // Can't attach to other arrows or lines
        if (shape.shapeName === 'arrow' || shape.shapeName === 'line') continue;

        let attachment = null;

        switch (shape.shapeName) {
            case 'rectangle':
                attachment = Arrow.getRectangleAttachmentPoint(point, shape, tolerance);
                break;
            case 'circle':
                attachment = Arrow.getCircleAttachmentPoint(point, shape, tolerance);
                break;
            case 'frame':
                attachment = Arrow.getFrameAttachmentPoint(point, shape, tolerance);
                break;
            case 'text':
            case 'code':
                // Text and code shapes wrap a group element
                if (shape.group) {
                    attachment = Arrow.getTextAttachmentPoint(point, shape.group, tolerance);
                }
                break;
            case 'image':
                // Image shapes wrap an element
                if (shape.element) {
                    attachment = Arrow.getImageAttachmentPoint(point, shape.element, tolerance);
                }
                break;
            case 'icon':
                if (shape.element) {
                    attachment = Arrow.getIconAttachmentPoint(point, shape.element, tolerance);
                }
                break;
            case 'freehandStroke':
                attachment = Arrow.getBoundingBoxAttachmentPoint(point, shape, tolerance);
                break;
            case 'line':
                attachment = Arrow.getLineAttachmentPoint(point, shape, tolerance);
                break;
        }

        if (attachment) {
            return { shape, attachment };
        }
    }
    return null;
}

    static getBoundingBoxAttachmentPoint(point, shape, tolerance = 20) {
        const bounds = shape.boundingBox || { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        if (!bounds || bounds.width === 0 || bounds.height === 0) return null;

        const sides = [
            { name: 'top', start: { x: bounds.x, y: bounds.y }, end: { x: bounds.x + bounds.width, y: bounds.y } },
            { name: 'right', start: { x: bounds.x + bounds.width, y: bounds.y }, end: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
            { name: 'bottom', start: { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, end: { x: bounds.x, y: bounds.y + bounds.height } },
            { name: 'left', start: { x: bounds.x, y: bounds.y + bounds.height }, end: { x: bounds.x, y: bounds.y } }
        ];

        let closestSide = null;
        let minDistance = tolerance;
        let attachPoint = null;

        sides.forEach(side => {
            const distance = Arrow.pointToLineSegmentDistance(point, side.start, side.end);
            if (distance < minDistance) {
                minDistance = distance;
                closestSide = side.name;
                attachPoint = Arrow.closestPointOnLineSegment(point, side.start, side.end);
            }
        });

        if (closestSide && attachPoint) {
            const offset = {
                x: attachPoint.x - bounds.x,
                y: attachPoint.y - bounds.y,
                side: closestSide
            };
            return { side: closestSide, point: attachPoint, offset };
        }
        return null;
    }

    static getLineAttachmentPoint(point, line, tolerance = 20) {
        const start = line.startPoint;
        const end = line.endPoint;
        if (!start || !end) return null;

        const distance = Arrow.pointToLineSegmentDistance(point, start, end);
        if (distance >= tolerance) return null;

        const attachPoint = Arrow.closestPointOnLineSegment(point, start, end);
        // Store as a parametric t value along the line
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? ((attachPoint.x - start.x) * dx + (attachPoint.y - start.y) * dy) / lenSq : 0;

        return {
            side: 'line',
            point: attachPoint,
            offset: { t: Math.max(0, Math.min(1, t)), side: 'line' }
        };
    }

static getIconAttachmentPoint(point, iconElement, tolerance = 20) {
    // Check if it's an SVG icon element (group)
    if (!iconElement || (iconElement.tagName !== 'g' && (!iconElement.getAttribute || iconElement.getAttribute('type') !== 'icon'))) {
        console.warn('Invalid icon element for attachment:', iconElement);
        return null;
    }

    // Get icon position and dimensions from data attributes
    const iconX = parseFloat(iconElement.getAttribute('data-shape-x') || iconElement.getAttribute('x'));
    const iconY = parseFloat(iconElement.getAttribute('data-shape-y') || iconElement.getAttribute('y'));
    const iconWidth = parseFloat(iconElement.getAttribute('data-shape-width') || iconElement.getAttribute('width'));
    const iconHeight = parseFloat(iconElement.getAttribute('data-shape-height') || iconElement.getAttribute('height'));

    // Get rotation from data attribute or transform attribute
    let rotation = 0;
    const dataRotation = iconElement.getAttribute('data-shape-rotation');
    if (dataRotation) {
        rotation = parseFloat(dataRotation) * Math.PI / 180; // Convert to radians
    } else {
        const transform = iconElement.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,]+)/);
            if (rotateMatch) {
                rotation = parseFloat(rotateMatch[1]) * Math.PI / 180; // Convert to radians
            }
        }
    }

    const centerX = iconX + iconWidth / 2;
    const centerY = iconY + iconHeight / 2;

    // Transform the bounding box corners to world coordinates
    const corners = [
        { x: iconX, y: iconY }, // top-left
        { x: iconX + iconWidth, y: iconY }, // top-right
        { x: iconX + iconWidth, y: iconY + iconHeight }, // bottom-right
        { x: iconX, y: iconY + iconHeight } // bottom-left
    ];

    // Apply rotation to corners
    const transformedCorners = corners.map(corner => {
        if (rotation === 0) return corner;

        const dx = corner.x - centerX;
        const dy = corner.y - centerY;

        return {
            x: centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
            y: centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation)
        };
    });

    // Calculate sides of the transformed rectangle
    const sides = [
        { name: 'top', start: transformedCorners[0], end: transformedCorners[1] },
        { name: 'right', start: transformedCorners[1], end: transformedCorners[2] },
        { name: 'bottom', start: transformedCorners[2], end: transformedCorners[3] },
        { name: 'left', start: transformedCorners[3], end: transformedCorners[0] }
    ];

    let closestSide = null;
    let minDistance = tolerance;
    let attachPoint = null;

    sides.forEach(side => {
        const distance = Arrow.pointToLineSegmentDistance(point, side.start, side.end);
        if (distance < minDistance) {
            minDistance = distance;
            closestSide = side.name;

            // Calculate the closest point on the line segment
            attachPoint = Arrow.closestPointOnLineSegment(point, side.start, side.end);
        }
    });

    if (closestSide && attachPoint) {
        // Calculate offset relative to the original icon rectangle
        // Transform the attach point back to local coordinates
        let localPoint = attachPoint;
        if (rotation !== 0) {
            const dx = attachPoint.x - centerX;
            const dy = attachPoint.y - centerY;

            localPoint = {
                x: centerX + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
                y: centerY + dx * Math.sin(-rotation) + dy * Math.cos(-rotation)
            };
        }

        // Calculate offset relative to the icon rectangle
        const offset = {
            x: localPoint.x - iconX,
            y: localPoint.y - iconY,
            side: closestSide
        };

        return { side: closestSide, point: attachPoint, offset };
    }

    return null;
}


    static getImageAttachmentPoint(point, imageElement, tolerance = 20) {
    // Check if it's an SVG image element
    if (!imageElement || (imageElement.tagName !== 'image' && (!imageElement.getAttribute || imageElement.getAttribute('type') !== 'image'))) {
        console.warn('Invalid image element for attachment:', imageElement);
        return null;
    }

    // Get image position and dimensions from data attributes
    const imgX = parseFloat(imageElement.getAttribute('data-shape-x') || imageElement.getAttribute('x'));
    const imgY = parseFloat(imageElement.getAttribute('data-shape-y') || imageElement.getAttribute('y'));
    const imgWidth = parseFloat(imageElement.getAttribute('data-shape-width') || imageElement.getAttribute('width'));
    const imgHeight = parseFloat(imageElement.getAttribute('data-shape-height') || imageElement.getAttribute('height'));

    // Get rotation from data attribute or transform attribute
    let rotation = 0;
    const dataRotation = imageElement.getAttribute('data-shape-rotation');
    if (dataRotation) {
        rotation = parseFloat(dataRotation) * Math.PI / 180; // Convert to radians
    } else {
        const transform = imageElement.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,]+)/);
            if (rotateMatch) {
                rotation = parseFloat(rotateMatch[1]) * Math.PI / 180; // Convert to radians
            }
        }
    }

    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Transform the bounding box corners to world coordinates
    const corners = [
        { x: imgX, y: imgY }, // top-left
        { x: imgX + imgWidth, y: imgY }, // top-right
        { x: imgX + imgWidth, y: imgY + imgHeight }, // bottom-right
        { x: imgX, y: imgY + imgHeight } // bottom-left
    ];

    // Apply rotation to corners
    const transformedCorners = corners.map(corner => {
        if (rotation === 0) return corner;

        const dx = corner.x - centerX;
        const dy = corner.y - centerY;

        return {
            x: centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
            y: centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation)
        };
    });

    // Calculate sides of the transformed rectangle
    const sides = [
        { name: 'top', start: transformedCorners[0], end: transformedCorners[1] },
        { name: 'right', start: transformedCorners[1], end: transformedCorners[2] },
        { name: 'bottom', start: transformedCorners[2], end: transformedCorners[3] },
        { name: 'left', start: transformedCorners[3], end: transformedCorners[0] }
    ];

    let closestSide = null;
    let minDistance = tolerance;
    let attachPoint = null;

    sides.forEach(side => {
        const distance = Arrow.pointToLineSegmentDistance(point, side.start, side.end);
        if (distance < minDistance) {
            minDistance = distance;
            closestSide = side.name;

            // Calculate the closest point on the line segment
            attachPoint = Arrow.closestPointOnLineSegment(point, side.start, side.end);
        }
    });

    if (closestSide && attachPoint) {
        // Calculate offset relative to the original image rectangle
        // Transform the attach point back to local coordinates
        let localPoint = attachPoint;
        if (rotation !== 0) {
            const dx = attachPoint.x - centerX;
            const dy = attachPoint.y - centerY;

            localPoint = {
                x: centerX + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
                y: centerY + dx * Math.sin(-rotation) + dy * Math.cos(-rotation)
            };
        }

        // Calculate offset relative to the image rectangle
        const offset = {
            x: localPoint.x - imgX,
            y: localPoint.y - imgY,
            side: closestSide
        };

        return { side: closestSide, point: attachPoint, offset };
    }

    return null;
}

static getFrameAttachmentPoint(point, frame, tolerance = 20) {
    const rect = {
        left: frame.x,
        right: frame.x + frame.width,
        top: frame.y,
        bottom: frame.y + frame.height
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
        if (distances[side] < minDistance) {
            if ((side === 'top' || side === 'bottom') &&
                point.x >= rect.left - tolerance && point.x <= rect.right + tolerance) {
                closestSide = side;
                minDistance = distances[side];
            } else if ((side === 'left' || side === 'right') &&
                       point.y >= rect.top - tolerance && point.y <= rect.bottom + tolerance) {
                closestSide = side;
                minDistance = distances[side];
            }
        }
    }

    if (closestSide) {
        let attachPoint, offset;

        switch (closestSide) {
            case 'top':
                attachPoint = { x: Math.max(rect.left, Math.min(rect.right, point.x)), y: rect.top };
                offset = { x: attachPoint.x - frame.x, y: 0 };
                break;
            case 'bottom':
                attachPoint = { x: Math.max(rect.left, Math.min(rect.right, point.x)), y: rect.bottom };
                offset = { x: attachPoint.x - frame.x, y: frame.height };
                break;
            case 'left':
                attachPoint = { x: rect.left, y: Math.max(rect.top, Math.min(rect.bottom, point.y)) };
                offset = { x: 0, y: attachPoint.y - frame.y };
                break;
            case 'right':
                attachPoint = { x: rect.right, y: Math.max(rect.top, Math.min(rect.bottom, point.y)) };
                offset = { x: frame.width, y: attachPoint.y - frame.y };
                break;
        }

        return { side: closestSide, point: attachPoint, offset };
    }

    return null;
}

    static getRectangleAttachmentPoint(point, rectangle, tolerance = 20) {
        const rect = {
            left: rectangle.x,
            right: rectangle.x + rectangle.width,
            top: rectangle.y,
            bottom: rectangle.y + rectangle.height
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
            if (distances[side] < minDistance) {
                if ((side === 'top' || side === 'bottom') &&
                    point.x >= rect.left - tolerance && point.x <= rect.right + tolerance) {
                    closestSide = side;
                    minDistance = distances[side];
                } else if ((side === 'left' || side === 'right') &&
                           point.y >= rect.top - tolerance && point.y <= rect.bottom + tolerance) {
                    closestSide = side;
                    minDistance = distances[side];
                }
            }
        }

        if (closestSide) {
            let attachPoint, offset;

            switch (closestSide) {
                case 'top':
                    attachPoint = { x: Math.max(rect.left, Math.min(rect.right, point.x)), y: rect.top };
                    offset = { x: attachPoint.x - rectangle.x, y: 0 };
                    break;
                case 'bottom':
                    attachPoint = { x: Math.max(rect.left, Math.min(rect.right, point.x)), y: rect.bottom };
                    offset = { x: attachPoint.x - rectangle.x, y: rectangle.height };
                    break;
                case 'left':
                    attachPoint = { x: rect.left, y: Math.max(rect.top, Math.min(rect.bottom, point.y)) };
                    offset = { x: 0, y: attachPoint.y - rectangle.y };
                    break;
                case 'right':
                    attachPoint = { x: rect.right, y: Math.max(rect.top, Math.min(rect.bottom, point.y)) };
                    offset = { x: rectangle.width, y: attachPoint.y - rectangle.y };
                    break;
            }

            return { side: closestSide, point: attachPoint, offset };
        }

        return null;
    }

    static getCircleAttachmentPoint(point, circle, tolerance = 20) {
        // Calculate distance from point to circle center
        const dx = point.x - circle.x;
        const dy = point.y - circle.y;
        const distanceToCenter = Math.sqrt(dx * dx + dy * dy);

        const averageRadius = (circle.rx + circle.ry) / 2;
        const distanceToPerimeter = Math.abs(distanceToCenter - averageRadius);

        if (distanceToPerimeter <= tolerance) {

            const angle = Math.atan2(dy, dx);


            const attachPoint = this.getEllipsePerimeterPoint(circle, angle);


            const offset = {
                angle: angle,
                radiusRatioX: (attachPoint.x - circle.x) / circle.rx,
                radiusRatioY: (attachPoint.y - circle.y) / circle.ry
            };

            return {
                side: 'perimeter',
                point: attachPoint,
                offset: offset
            };
        }

        return null;
    }

    static getTextAttachmentPoint(point, textGroup, tolerance = 20) {
        if (!textGroup) return null;
        // Accept groups with type='text' or type='code'
        const groupType = textGroup.getAttribute ? textGroup.getAttribute('type') : textGroup.type;
        if (groupType !== 'text' && groupType !== 'code') return null;

        const textElement = textGroup.querySelector('text');
        if (!textElement) return null;

        // Get the text bounding box
        const bbox = textElement.getBBox();

        // Get the group's transform
        const groupTransform = textGroup.transform.baseVal.consolidate();
        const matrix = groupTransform ? groupTransform.matrix : { e: 0, f: 0, a: 1, b: 0, c: 0, d: 1 };

        // Transform the bounding box corners to world coordinates
        const corners = [
            { x: bbox.x, y: bbox.y }, // top-left
            { x: bbox.x + bbox.width, y: bbox.y }, // top-right
            { x: bbox.x + bbox.width, y: bbox.y + bbox.height }, // bottom-right
            { x: bbox.x, y: bbox.y + bbox.height } // bottom-left
        ];

        // Transform corners using the group's transform matrix
        const transformedCorners = corners.map(corner => ({
            x: corner.x * matrix.a + corner.y * matrix.c + matrix.e,
            y: corner.x * matrix.b + corner.y * matrix.d + matrix.f
        }));

        // Calculate sides of the transformed rectangle
        const sides = [
            { name: 'top', start: transformedCorners[0], end: transformedCorners[1] },
            { name: 'right', start: transformedCorners[1], end: transformedCorners[2] },
            { name: 'bottom', start: transformedCorners[2], end: transformedCorners[3] },
            { name: 'left', start: transformedCorners[3], end: transformedCorners[0] }
        ];

        let closestSide = null;
        let minDistance = tolerance;
        let attachPoint = null;

        sides.forEach(side => {
            const distance = Arrow.pointToLineSegmentDistance(point, side.start, side.end);
            if (distance < minDistance) {
                minDistance = distance;
                closestSide = side.name;

                // Calculate the closest point on the line segment
                attachPoint = Arrow.closestPointOnLineSegment(point, side.start, side.end);
            }
        });

        if (closestSide && attachPoint) {
            // Calculate offset relative to the original bounding box
            // Transform the attach point back to local coordinates
            const det = matrix.a * matrix.d - matrix.b * matrix.c;
            if (det === 0) return null;

            const invMatrix = {
                a: matrix.d / det,
                b: -matrix.b / det,
                c: -matrix.c / det,
                d: matrix.a / det,
                e: (matrix.c * matrix.f - matrix.d * matrix.e) / det,
                f: (matrix.b * matrix.e - matrix.a * matrix.f) / det
            };

            const localPoint = {
                x: attachPoint.x * invMatrix.a + attachPoint.y * invMatrix.c + invMatrix.e,
                y: attachPoint.x * invMatrix.b + attachPoint.y * invMatrix.d + invMatrix.f
            };

            // Calculate offset relative to the bounding box
            const offset = {
                x: localPoint.x - bbox.x,
                y: localPoint.y - bbox.y,
                side: closestSide
            };

            return { side: closestSide, point: attachPoint, offset };
        }

        return null;
    }

    static pointToLineSegmentDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            // Line segment is a point
            return Math.sqrt(A * A + B * B);
        }

        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param)); // Clamp to [0,1]

        const xx = lineStart.x + param * C;
        const yy = lineStart.y + param * D;

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    static closestPointOnLineSegment(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            return { x: lineStart.x, y: lineStart.y };
        }

        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param));

        return {
            x: lineStart.x + param * C,
            y: lineStart.y + param * D
        };
    }

    calculateAttachedPoint(attachment) {
    const shape = attachment.shape;
    const side = attachment.side;
    const offset = attachment.offset;

    if (shape.shapeName === 'rectangle') {
        return Arrow._calcRectAttachedPoint(shape.x, shape.y, shape.width, shape.height, shape.rotation, side, offset);
    }

    if (shape.shapeName === 'circle') {
        if (side === 'perimeter') {
            return Arrow.getEllipsePerimeterPoint(shape, offset.angle);
        }
    }

    if (shape.shapeName === 'text' || shape.shapeName === 'code') {
        // Text/code shapes use their group's transform
        const groupEl = shape.group;
        if (!groupEl) return { x: shape.x || 0, y: shape.y || 0 };
        const textElement = groupEl.querySelector('text') || groupEl.querySelector('foreignObject');
        if (!textElement) return { x: shape.x || 0, y: shape.y || 0 };

        const bbox = textElement.getBBox();
        const groupTransform = groupEl.transform.baseVal.consolidate();
        const matrix = groupTransform ? groupTransform.matrix : { e: 0, f: 0, a: 1, b: 0, c: 0, d: 1 };

        let localPoint = { x: bbox.x + offset.x, y: bbox.y + offset.y };
        return {
            x: localPoint.x * matrix.a + localPoint.y * matrix.c + matrix.e,
            y: localPoint.x * matrix.b + localPoint.y * matrix.d + matrix.f
        };
    }

    if (shape.shapeName === 'image') {
        return Arrow._calcRectAttachedPoint(shape.x, shape.y, shape.width, shape.height, shape.rotation, side, offset);
    }

    if (shape.shapeName === 'icon') {
        return Arrow._calcRectAttachedPoint(shape.x, shape.y, shape.width, shape.height, shape.rotation, side, offset);
    }

    if (shape.shapeName === 'frame') {
        return Arrow._calcRectAttachedPoint(shape.x, shape.y, shape.width, shape.height, 0, side, offset);
    }

    if (shape.shapeName === 'freehandStroke') {
        const bounds = shape.boundingBox || { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        return Arrow._calcRectAttachedPoint(bounds.x, bounds.y, bounds.width, bounds.height, 0, side, offset);
    }

    if (shape.shapeName === 'line') {
        if (side === 'line' && offset.t !== undefined) {
            const t = offset.t;
            return {
                x: shape.startPoint.x + t * (shape.endPoint.x - shape.startPoint.x),
                y: shape.startPoint.y + t * (shape.endPoint.y - shape.startPoint.y)
            };
        }
    }

    return { x: shape.x || 0, y: shape.y || 0 };
}

    static _calcRectAttachedPoint(rx, ry, rw, rh, rotation, side, offset) {
        let localPoint;
        switch (side) {
            case 'top':
                localPoint = { x: rx + offset.x, y: ry };
                break;
            case 'bottom':
                localPoint = { x: rx + offset.x, y: ry + rh };
                break;
            case 'left':
                localPoint = { x: rx, y: ry + offset.y };
                break;
            case 'right':
                localPoint = { x: rx + rw, y: ry + offset.y };
                break;
            default:
                localPoint = { x: rx + offset.x, y: ry + offset.y };
        }

        if (rotation) {
            const rad = rotation * Math.PI / 180;
            const cx = rx + rw / 2;
            const cy = ry + rh / 2;
            const dx = localPoint.x - cx;
            const dy = localPoint.y - cy;
            return {
                x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
                y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
            };
        }
        return localPoint;
    }

    detachFromShape(isStartPoint) {
        if (isStartPoint) {
            this.attachedToStart = null;
        } else {
            this.attachedToEnd = null;
        }
    }

    updateAttachments() {
        let needsRedraw = false;

        if (this.attachedToStart && this.attachedToStart.shape) {
            const newPoint = this.calculateAttachedPoint(this.attachedToStart);
            if (newPoint.x !== this.startPoint.x || newPoint.y !== this.startPoint.y) {
                this.startPoint = newPoint;
                needsRedraw = true;
            }
        }

        if (this.attachedToEnd && this.attachedToEnd.shape) {
            const newPoint = this.calculateAttachedPoint(this.attachedToEnd);
            if (newPoint.x !== this.endPoint.x || newPoint.y !== this.endPoint.y) {
                this.endPoint = newPoint;
                needsRedraw = true;
            }
        }

        if (needsRedraw) {
            if (this.arrowCurved) {
                this.initializeCurveControlPoints();
            }
            this.draw();
        }
    }

    move(dx, dy) {
    if (!this.attachedToStart) {
        this.startPoint.x += dx;
        this.startPoint.y += dy;
    }
    if (!this.attachedToEnd) {
        this.endPoint.x += dx;
        this.endPoint.y += dy;
    }

    if (this.controlPoint1 && (!this.attachedToStart && !this.attachedToEnd)) {
        this.controlPoint1.x += dx;
        this.controlPoint1.y += dy;
    }
    if (this.controlPoint2 && (!this.attachedToStart && !this.attachedToEnd)) {
        this.controlPoint2.x += dx;
        this.controlPoint2.y += dy;
    }

    // Lightweight update — rebuild the path element without full draw/anchor rebuild
    this._updatePathElement();
    this._updateHitArea();
    this._updateLabelElement();
    this._updateAnchorPositions();

    // Only update frame containment if we're actively dragging the shape itself
    // and not being moved by a parent frame
    if (isDragging && !this.isBeingMovedByFrame) {
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
    if (this.parentFrame && isDragging) {
        this.parentFrame.temporarilyRemoveFromFrame(this);
    }
    
    // Update frame highlighting
    if (hoveredFrameArrow && hoveredFrameArrow !== targetFrame) {
        hoveredFrameArrow.removeHighlight();
    }
    
    if (targetFrame && targetFrame !== hoveredFrameArrow) {
        targetFrame.highlightFrame();
    }
    
    hoveredFrameArrow = targetFrame;
}

    isNearAnchor(x, y) {
        const anchorSize = 10 / currentZoom;

        for (let i = 0; i < this.anchors.length; i++) {
            const anchor = this.anchors[i];
            if (anchor) {
                const anchorX = parseFloat(anchor.getAttribute('cx'));
                const anchorY = parseFloat(anchor.getAttribute('cy'));
                const distance = Math.sqrt(Math.pow(x - anchorX, 2) + Math.pow(y - anchorY, 2));
                if (distance <= anchorSize) {
                    return { type: 'anchor', index: i };
                }
            }
        }

        return null;
    }

    startAnchorDrag(e, index) {
        e.stopPropagation();
        e.preventDefault();

        // Store initial state including attachments
        dragOldPosArrow = {
            startPoint: { x: this.startPoint.x, y: this.startPoint.y },
            endPoint: { x: this.endPoint.x, y: this.endPoint.y },
            controlPoint1: this.controlPoint1 ? { x: this.controlPoint1.x, y: this.controlPoint1.y } : null,
            controlPoint2: this.controlPoint2 ? { x: this.controlPoint2.x, y: this.controlPoint2.y } : null,
            attachments: this.getAttachmentState()
        };

        const onPointerMove = (event) => {
            const { x, y } = getSVGCoordsFromMouse(event);

            // Check for potential attachment when dragging start or end anchors
            if (index === 0 || index === 1) {
                const nearbyShape = Arrow.findNearbyShape({ x, y });
                if (nearbyShape) {
                    // Show preview while dragging
                    const existingPreview = svg.querySelector('.attachment-preview');
                    if (existingPreview) existingPreview.remove();

                    const preview = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    preview.setAttribute("cx", nearbyShape.attachment.point.x);
                    preview.setAttribute("cy", nearbyShape.attachment.point.y);
                    preview.setAttribute("r", 6);
                    preview.setAttribute("fill", "none");
                    preview.setAttribute("stroke", "#5B57D1");
                    preview.setAttribute("stroke-width", 2);
                    preview.setAttribute("class", "attachment-preview");
                    preview.setAttribute("opacity", "0.7");
                    svg.appendChild(preview);

                    // Snap to attachment point
                    this.updatePosition(index, nearbyShape.attachment.point.x, nearbyShape.attachment.point.y);
                } else {

                    const existingPreview = svg.querySelector('.attachment-preview');
                    if (existingPreview) existingPreview.remove();

                    this.updatePosition(index, x, y);
                }
            } else {
                this.updatePosition(index, x, y);
            }
        };

        const onPointerUp = () => {

            const existingPreview = svg.querySelector('.attachment-preview');
            if (existingPreview) existingPreview.remove();

            if (index === 0) {
                // Check for start point attachment
                const startAttachment = Arrow.findNearbyShape(this.startPoint);
                if (startAttachment) {

                    if (this.attachedToStart && this.attachedToStart.shape !== startAttachment.shape) {
                        this.detachFromShape(true);
                    }
                    this.attachToShape(true, startAttachment.shape, startAttachment.attachment);
                } else {
                    // Detach if moved away from shape
                    if (this.attachedToStart) {
                        this.detachFromShape(true);
                    }
                }
            } else if (index === 1) {
                // Check for end point attachment
                const endAttachment = Arrow.findNearbyShape(this.endPoint);
                if (endAttachment) {
                    // Detach if previously attached to different shape
                    if (this.attachedToEnd && this.attachedToEnd.shape !== endAttachment.shape) {
                        this.detachFromShape(false);
                    }
                    this.attachToShape(false, endAttachment.shape, endAttachment.attachment);
                } else {
                    // Detach if moved away from shape
                    if (this.attachedToEnd) {
                        this.detachFromShape(false);
                    }
                }
            }

            if (dragOldPosArrow) {
                const newPos = {
                    startPoint: { x: this.startPoint.x, y: this.startPoint.y },
                    endPoint: { x: this.endPoint.x, y: this.endPoint.y },
                    controlPoint1: this.controlPoint1 ? { x: this.controlPoint1.x, y: this.controlPoint1.y } : null,
                    controlPoint2: this.controlPoint2 ? { x: this.controlPoint2.x, y: this.controlPoint2.y } : null,
                    attachments: this.getAttachmentState()
                };

                // Check if anything actually changed (position or attachments)
                const stateChanged =
                    dragOldPosArrow.startPoint.x !== newPos.startPoint.x ||
                    dragOldPosArrow.startPoint.y !== newPos.startPoint.y ||
                    dragOldPosArrow.endPoint.x !== newPos.endPoint.x ||
                    dragOldPosArrow.endPoint.y !== newPos.endPoint.y ||
                    JSON.stringify(dragOldPosArrow.attachments) !== JSON.stringify(newPos.attachments);

                if (stateChanged) {
                    pushTransformAction(this, dragOldPosArrow, newPos);
                }
                dragOldPosArrow = null;
            }

            svg.removeEventListener('pointermove', onPointerMove);
            svg.removeEventListener('pointerup', onPointerUp);
        };

        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
    }

    updatePosition(anchorIndex, newViewBoxX, newViewBoxY) {
        if (anchorIndex === 0) {
            this.startPoint.x = newViewBoxX;
            this.startPoint.y = newViewBoxY;
        } else if (anchorIndex === 1) {
            this.endPoint.x = newViewBoxX;
            this.endPoint.y = newViewBoxY;
        } else if (anchorIndex === 2 && this.arrowCurved === "elbow") {
            this.elbowX = newViewBoxX;
        } else if (anchorIndex === 2 && this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            // On-curve midpoint anchor dragged — inversely compute control points
            // B(0.5) = 0.125*P0 + 0.375*CP1 + 0.375*CP2 + 0.125*P3
            // Keep curve symmetric: offset both control points equally from the line
            const dx = this.endPoint.x - this.startPoint.x;
            const dy = this.endPoint.y - this.startPoint.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const perpX = -dy / dist;
            const perpY = dx / dist;

            // Desired midpoint offset from line midpoint
            const lineMidX = (this.startPoint.x + this.endPoint.x) / 2;
            const lineMidY = (this.startPoint.y + this.endPoint.y) / 2;
            const offsetX = newViewBoxX - lineMidX;
            const offsetY = newViewBoxY - lineMidY;
            // Project offset onto perpendicular to get curve amount
            const curveAmount = offsetX * perpX + offsetY * perpY;

            // Recompute control points with this curve amount
            const t1 = 0.33, t2 = 0.67;
            this.controlPoint1 = {
                x: this.startPoint.x + t1 * dx + perpX * curveAmount * (4 / 3),
                y: this.startPoint.y + t1 * dy + perpY * curveAmount * (4 / 3)
            };
            this.controlPoint2 = {
                x: this.startPoint.x + t2 * dx + perpX * curveAmount * (4 / 3),
                y: this.startPoint.y + t2 * dy + perpY * curveAmount * (4 / 3)
            };
        }
        this.draw();
    }

    contains(viewBoxX, viewBoxY) {
        const tolerance = Math.max(5, this.options.strokeWidth * 2) / currentZoom;

        if (this.arrowCurved === "curved" && this.controlPoint1 && this.controlPoint2) {
            return this.pointToCubicBezierDistance(viewBoxX, viewBoxY) <= tolerance;
        } else if (this.arrowCurved === "elbow") {
            const ex = this.elbowX !== null ? this.elbowX : (this.startPoint.x + this.endPoint.x) / 2;
            const d1 = this.pointToLineDistance(viewBoxX, viewBoxY, this.startPoint.x, this.startPoint.y, ex, this.startPoint.y);
            const d2 = this.pointToLineDistance(viewBoxX, viewBoxY, ex, this.startPoint.y, ex, this.endPoint.y);
            const d3 = this.pointToLineDistance(viewBoxX, viewBoxY, ex, this.endPoint.y, this.endPoint.x, this.endPoint.y);
            return Math.min(d1, d2, d3) <= tolerance;
        } else {
            return this.pointToLineDistance(viewBoxX, viewBoxY, this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y) <= tolerance;
        }
    }

    pointToCubicBezierDistance(x, y) {
        let minDistance = Infinity;
        const steps = 100;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.getCubicBezierPoint(t);
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            minDistance = Math.min(minDistance, distance);
        }

        return minDistance;
    }

    pointToLineDistance(x, y, x1, y1, x2, y2) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

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

    updateStyle(newOptions) {
        if (newOptions.arrowOutlineStyle !== undefined) {
            this.arrowOutlineStyle = newOptions.arrowOutlineStyle;
            const style = this.arrowOutlineStyle;
            this.options.strokeDasharray = style === "dashed" ? "10,10" : (style === "dotted" ? "2,8" : "");
        }
        if (newOptions.arrowHeadStyle !== undefined) {
            this.arrowHeadStyle = newOptions.arrowHeadStyle;
        }
        if (newOptions.arrowCurved !== undefined) {
            const wasCurved = this.arrowCurved;
            this.arrowCurved = newOptions.arrowCurved;

            if (this.arrowCurved === "curved" && wasCurved !== "curved") {
                this.initializeCurveControlPoints();
            } else if (this.arrowCurved !== "curved") {
                this.controlPoint1 = null;
                this.controlPoint2 = null;
            }
            if (this.arrowCurved !== "elbow") {
                this.elbowX = null;
            }
        }
        if (newOptions.elbowX !== undefined) {
            this.elbowX = newOptions.elbowX;
        }
        if (newOptions.stroke !== undefined) {
            this.options.stroke = newOptions.stroke;
        }
        if (newOptions.strokeWidth !== undefined) {
            this.options.strokeWidth = parseFloat(newOptions.strokeWidth);
        }
        if (newOptions.arrowCurveAmount !== undefined) {
            this.arrowCurveAmount = newOptions.arrowCurveAmount;
            if (this.arrowCurved) {
                this.initializeCurveControlPoints();
            }
        }

        Object.keys(newOptions).forEach(key => newOptions[key] === undefined && delete newOptions[key]);
        this.options = { ...this.options, ...newOptions };

        if (this.arrowOutlineStyle === 'solid' && this.options.strokeDasharray) {
             delete this.options.strokeDasharray;
        }

        this.draw();
    }

    updateSidebar() {
        // No-op: React sidebar handles UI updates via Zustand store
    }

    destroy() {
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
}

export { Arrow };
