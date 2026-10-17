/* eslint-disable */
import { getStroke } from "perfect-freehand";
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';
// FreehandStroke shape class - extracted from canvasStroke.js
// Depends on globals: svg, shapes, currentShape, currentZoom, currentViewBox

function getSvgCoordinates(event) {
    const rect = svg.getBoundingClientRect();
    const scaleX = currentViewBox.width / rect.width;
    const scaleY = currentViewBox.height / rect.height;

    const svgX = currentViewBox.x + (event.clientX - rect.left) * scaleX;
    const svgY = currentViewBox.y + (event.clientY - rect.top) * scaleY;

    return { x: svgX, y: svgY };
}

function getSvgPathFromStroke(stroke) {
    if (!stroke.length) return '';
    
    // Use more sophisticated curve fitting
    const pathData = [];
    pathData.push('M', stroke[0][0], stroke[0][1]);
    
    for (let i = 1; i < stroke.length - 1; i++) {
        const curr = stroke[i];
        const next = stroke[i + 1];
        
        // Calculate control points for smoother curves
        const cpX = curr[0] + (next[0] - curr[0]) * 0.5;
        const cpY = curr[1] + (next[1] - curr[1]) * 0.5;
        
        pathData.push('Q', curr[0], curr[1], cpX, cpY);
    }
    
    // Add final point
    if (stroke.length > 1) {
        const lastPoint = stroke[stroke.length - 1];
        pathData.push('L', lastPoint[0], lastPoint[1]);
    }
    
    return pathData.join(' ');
}

class FreehandStroke {
    constructor(points = [], options = {}) {
        this.points = points;
        this.rawPoints = []; 
        this.options = {
            stroke: "#fff",
            strokeWidth: 3,
            fill: "none",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeOpacity: 1,
            thinning: 0.5,
            roughness: 0,
            strokeStyle: "solid",
            ...options
        };
        this.element = null;
        this.isSelected = false;
        this.rotation = 0;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.anchors = [];
        this.rotationAnchor = null;
        this.rotationLine = null;
        this.selectionPadding = 8;
        this.selectionOutline = null;
        this.boundingBox = { x: 0, y: 0, width: 0, height: 0 };
        this.shapeName = "freehandStroke";
        this.shapeID = `freehand-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);
        this._moveOffsetX = 0;
        this._moveOffsetY = 0;

        // Frame attachment properties
        this.parentFrame = null;
        
        svg.appendChild(this.group);
        this.draw();
    }

    // Add position and dimension properties for frame compatibility
    // Getters include pending move offset so callers see the visual position
    get x() {
        return this.boundingBox.x + (this._moveOffsetX || 0);
    }

    set x(value) {
        const dx = value - this.boundingBox.x - (this._moveOffsetX || 0);
        this.points = this.points.map(point => [point[0] + dx, point[1], point[2] || 0.5]);
        this.boundingBox.x = value - (this._moveOffsetX || 0);
    }

    get y() {
        return this.boundingBox.y + (this._moveOffsetY || 0);
    }

    set y(value) {
        const dy = value - this.boundingBox.y - (this._moveOffsetY || 0);
        this.points = this.points.map(point => [point[0], point[1] + dy, point[2] || 0.5]);
        this.boundingBox.y = value - (this._moveOffsetY || 0);
    }
    
    get width() {
        return this.boundingBox.width;
    }
    
    set width(value) {
        if (this.boundingBox.width === 0) return;
        const scaleX = value / this.boundingBox.width;
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        this.points = this.points.map(point => [
            centerX + (point[0] - centerX) * scaleX,
            point[1],
            point[2] || 0.5
        ]);
        this.boundingBox.width = value;
    }
    
    get height() {
        return this.boundingBox.height;
    }
    
    set height(value) {
        if (this.boundingBox.height === 0) return;
        const scaleY = value / this.boundingBox.height;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;
        this.points = this.points.map(point => [
            point[0],
            centerY + (point[1] - centerY) * scaleY,
            point[2] || 0.5
        ]);
        this.boundingBox.height = value;
    }

    // Enhanced smoothing algorithm
    smoothPoints(points, factor = 0.8) {
        if (points.length < 3) return points;
        
        const smoothed = [points[0]]; // Keep first point
        
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            
            // Apply weighted average smoothing
            const smoothedX = curr[0] * (1 - factor) + (prev[0] + next[0]) * factor * 0.5;
            const smoothedY = curr[1] * (1 - factor) + (prev[1] + next[1]) * factor * 0.5;
            const pressure = curr[2] || 0.5;
            
            smoothed.push([smoothedX, smoothedY, pressure]);
        }
        
        smoothed.push(points[points.length - 1]); // Keep last point
        return smoothed;
    }

    // Interpolate points for smoother curves
    interpolatePoints(points, steps = 2) {
        if (points.length < 2) return points;
        
        const interpolated = [points[0]];
        
        for (let i = 0; i < points.length - 1; i++) {
            const curr = points[i];
            const next = points[i + 1];
            
            for (let j = 1; j <= steps; j++) {
                const t = j / (steps + 1);
                const x = curr[0] + (next[0] - curr[0]) * t;
                const y = curr[1] + (next[1] - curr[1]) * t;
                const pressure = curr[2] + (next[2] - curr[2]) * t;
                interpolated.push([x, y, pressure]);
            }
            
            if (i < points.length - 2) {
                interpolated.push(next);
            }
        }
        
        interpolated.push(points[points.length - 1]);
        return interpolated;
    }

    // Enhanced path generation with better curve fitting
    getPathData() {
        if (this.points.length < 2) return '';

        if (this.options.closedFill) {
            const [first, ...rest] = this.points;
            return [`M ${first[0]} ${first[1]}`, ...rest.map(point => `L ${point[0]} ${point[1]}`), 'Z'].join(' ');
        }

        const isRough = this.options.roughness === "rough";
        const isMedium = this.options.roughness === "medium";

        // Roughness: jitter points before smoothing
        let pts = this.points;
        if (isRough || isMedium) {
            const jitter = isRough ? 3.5 : 1.5;
            pts = pts.map((p, i) => {
                if (i === 0 || i === pts.length - 1) return p;
                return [
                    p[0] + (Math.random() - 0.5) * jitter,
                    p[1] + (Math.random() - 0.5) * jitter,
                    p[2] || 0.5
                ];
            });
        }

        let smoothedPoints = this.interpolatePoints(pts, 1);
        if (!isRough) {
            smoothedPoints = this.smoothPoints(smoothedPoints, 0.6);
            smoothedPoints = this.smoothPoints(smoothedPoints, 0.4);
        }

        const thinning = this.options.thinning !== undefined ? this.options.thinning : 0;
        const smoothing = isRough ? 0.3 : isMedium ? 0.6 : 0.9;
        const streamline = isRough ? 0.1 : isMedium ? 0.25 : 0.4;

        const stroke = getStroke(smoothedPoints, {
            size: this.options.strokeWidth,
            thinning: thinning,
            smoothing: smoothing,
            streamline: streamline,
            easing: (t) => Math.sin(t * Math.PI * 0.5),
            start: {
                taper: thinning > 0 ? this.options.strokeWidth * 2 : 0,
                easing: (t) => t * t,
                cap: thinning === 0
            },
            end: {
                taper: thinning > 0 ? this.options.strokeWidth * 2 : 0,
                easing: (t) => --t * t * t + 1,
                cap: thinning === 0
            },
            simulatePressure: thinning > 0
        });

        return getSvgPathFromStroke(stroke);
    }

    // Simple centerline path used for dashed/dotted overlays
    getCenterlinePathData() {
        if (this.points.length < 2) return '';
        const d = [`M ${this.points[0][0]} ${this.points[0][1]}`];
        for (let i = 1; i < this.points.length - 1; i++) {
            const curr = this.points[i];
            const next = this.points[i + 1];
            const cpX = curr[0] + (next[0] - curr[0]) * 0.5;
            const cpY = curr[1] + (next[1] - curr[1]) * 0.5;
            d.push(`Q ${curr[0]} ${curr[1]} ${cpX} ${cpY}`);
        }
        const last = this.points[this.points.length - 1];
        d.push(`L ${last[0]} ${last[1]}`);
        return d.join(' ');
    }

    // Calculate the bounding box of the stroke
    calculateBoundingBox() {
        if (this.points.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.points.forEach(point => {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        });
        
        // Ensure we have valid dimensions
        if (minX === Infinity || minY === Infinity) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        
        // Add padding for stroke width
        const padding = this.options.strokeWidth / 2;
        return {
            x: minX - padding,
            y: minY - padding,
            width: Math.max(0, (maxX - minX) + padding * 2),
            height: Math.max(0, (maxY - minY) + padding * 2)
        };
    }

    draw() {
        while (this.group.firstChild) {
            this.group.removeChild(this.group.firstChild);
        }

        if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
            this.group.removeChild(this.selectionOutline);
            this.selectionOutline = null;
        }

        // Normal freehand paths use the filled outline from perfect-freehand.
        // Closed-fill paths (pie sectors, polygons) use their actual polygon
        // geometry with a separate outline, preserving sharp radial edges.
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const pathData = this.getPathData();
        path.setAttribute('d', pathData);
        const closedFillStyle = this.options.fillStyle || 'solid';
        const closedFill = closedFillStyle === 'none'
            ? 'transparent'
            : (this.options.fill || this.options.stroke);
        const patternedFill = this.options.closedFill
            && !['none', 'solid'].includes(closedFillStyle)
            && typeof rough !== 'undefined';
        path.setAttribute('fill', this.options.closedFill
            ? (patternedFill ? 'transparent' : closedFill)
            : this.options.stroke);
        path.setAttribute('fill-opacity', this.options.strokeOpacity);
        path.setAttribute('stroke', this.options.closedFill ? (this.options.outlineStroke || 'none') : 'none');
        if (this.options.closedFill) {
            path.setAttribute('stroke-width', this.options.outlineWidth || this.options.strokeWidth || 1);
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
        }

        // Overlay a dashed/dotted centerline if needed
        if (this.options.strokeStyle === "dashed" || this.options.strokeStyle === "dotted") {
            const dashArray = this.options.strokeStyle === "dashed"
                ? `${this.options.strokeWidth * 3} ${this.options.strokeWidth * 2}`
                : `${this.options.strokeWidth * 0.5} ${this.options.strokeWidth * 2}`;
            const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            overlay.setAttribute('d', this.getCenterlinePathData());
            overlay.setAttribute('fill', 'none');
            overlay.setAttribute('stroke', this.options.stroke);
            overlay.setAttribute('stroke-width', this.options.strokeWidth);
            overlay.setAttribute('stroke-linecap', 'round');
            overlay.setAttribute('stroke-linejoin', 'round');
            overlay.setAttribute('stroke-dasharray', dashArray);
            overlay.setAttribute('stroke-opacity', this.options.strokeOpacity);
            this.group.appendChild(overlay);
        }

        if (patternedFill) {
            const fillGroup = rough.svg(svg).path(pathData, {
                stroke: 'none',
                fill: closedFill,
                fillStyle: closedFillStyle,
                fillWeight: Math.max(1, (this.options.strokeWidth || 2) / 2),
                roughness: 0.8,
            });
            fillGroup.setAttribute('data-freehand-fill-pattern', closedFillStyle);
            this.group.appendChild(fillGroup);
        }

        this.element = path;
        this.group.appendChild(path);

        // Calculate and store bounding box
        this.boundingBox = this.calculateBoundingBox();

        // Apply rotation
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;

        // Ensure centerX and centerY are valid numbers
        if (!isNaN(centerX) && !isNaN(centerY)) {
            this.group.setAttribute('transform', `rotate(${this.rotation} ${centerX} ${centerY})`);
        }

        if (this.isSelected) {
            this.addAnchors();
        }
    }

    move(dx, dy) {
        // Diagram polygons (currently pie sectors) are redrawn by their parent
        // frame after every movement step. Moving them with a deferred SVG
        // transform therefore loses the visible transform on that redraw while
        // leaving a hidden offset behind, which makes sectors detach from the
        // frame and jump the next time they are selected. Keep their geometry
        // authoritative instead.
        if (this.options.closedFill) {
            this.points = this.points.map(point => [
                point[0] + dx,
                point[1] + dy,
                point[2] || 0.5
            ]);
            this._moveOffsetX = 0;
            this._moveOffsetY = 0;
            this.draw();
            return;
        }

        // Accumulate offset for transform-based movement (avoids full path rebuild)
        this._moveOffsetX = (this._moveOffsetX || 0) + dx;
        this._moveOffsetY = (this._moveOffsetY || 0) + dy;
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;
        const rot = this.rotation ? `rotate(${this.rotation} ${centerX} ${centerY})` : '';
        this.group.setAttribute('transform', `translate(${this._moveOffsetX}, ${this._moveOffsetY}) ${rot}`);
    }

    // Call after drag ends to bake the offset into actual point coordinates
    finalizeMove() {
        if (this._moveOffsetX || this._moveOffsetY) {
            const ox = this._moveOffsetX || 0;
            const oy = this._moveOffsetY || 0;
            this.points = this.points.map(point => [point[0] + ox, point[1] + oy, point[2] || 0.5]);
            this._moveOffsetX = 0;
            this._moveOffsetY = 0;
            this.draw();
        }
    }

    updateAttachedArrows() {
        if (typeof window.__updateArrowsForShape === 'function') {
            window.__updateArrowsForShape(this);
        }
    }

    selectStroke() {
        this.isSelected = true;
        this.draw();
        // Show sidebar and update it with current stroke properties
        disableAllSideBars();
        paintBrushSideBar.classList.remove("hidden");
        if (window.__showSidebarForShape) window.__showSidebarForShape('freehandStroke');
        this.updateSidebar();
    }

    deselectStroke() {
        this.isSelected = false;
        this.anchors = [];
        this.rotationAnchor = null;
        this.draw();
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
        if (this.rotationLine && this.rotationLine.parentNode === this.group) {
            this.group.removeChild(this.rotationLine);
        }
        if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
            this.group.removeChild(this.selectionOutline);
        }
        this.anchors = [];
        this.rotationAnchor = null;
        this.rotationLine = null;
        this.selectionOutline = null;
        this.isSelected = false;
    }

    // No-op: React sidebar handles UI updates via Zustand store
    updateSidebar() {}

    contains(x, y) {
        // Account for pending move offset (during drag, points aren't updated yet)
        const ox = this._moveOffsetX || 0;
        const oy = this._moveOffsetY || 0;
        const bbX = this.boundingBox.x + ox;
        const bbY = this.boundingBox.y + oy;
        const centerX = bbX + this.boundingBox.width / 2;
        const centerY = bbY + this.boundingBox.height / 2;

        // Adjust for rotation
        const dx = x - centerX;
        const dy = y - centerY;

        const angleRad = -this.rotation * Math.PI / 180;
        const rotatedX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
        const rotatedY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;

        if (this.options.closedFill && this.points.length >= 3) {
            const localX = rotatedX - ox;
            const localY = rotatedY - oy;
            let inside = false;
            for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                const xi = this.points[i][0], yi = this.points[i][1];
                const xj = this.points[j][0], yj = this.points[j][1];
                const crosses = ((yi > localY) !== (yj > localY))
                    && (localX < (xj - xi) * (localY - yi) / ((yj - yi) || Number.EPSILON) + xi);
                if (crosses) inside = !inside;
            }
            return inside;
        }

        return rotatedX >= bbX &&
               rotatedX <= bbX + this.boundingBox.width &&
               rotatedY >= bbY &&
               rotatedY <= bbY + this.boundingBox.height;
    }

  isNearAnchor(x, y) {
    if (!this.isSelected) return null;
    const buffer = 10;
    const anchorSize = 10 / currentZoom;

    // Account for pending move offset
    const ox = this._moveOffsetX || 0;
    const oy = this._moveOffsetY || 0;

    // Transform the input coordinates to account for rotation
    const centerX = this.boundingBox.x + ox + this.boundingBox.width / 2;
    const centerY = this.boundingBox.y + oy + this.boundingBox.height / 2;

    // Rotate the mouse coordinates to the shape's local coordinate system
    const angleRad = -this.rotation * Math.PI / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
    const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;

    // Check resize anchors in local space
    const expandedX = this.boundingBox.x + ox - this.selectionPadding;
    const expandedY = this.boundingBox.y + oy - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    const anchorPositions = [
        { x: expandedX, y: expandedY }, // top-left
        { x: expandedX + expandedWidth, y: expandedY }, // top-right
        { x: expandedX, y: expandedY + expandedHeight }, // bottom-left
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight }, // bottom-right
        { x: expandedX + expandedWidth / 2, y: expandedY }, // top-center
        { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight }, // bottom-center
        { x: expandedX, y: expandedY + expandedHeight / 2 }, // left-center
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight / 2 } // right-center
    ];

    for (let i = 0; i < anchorPositions.length; i++) {
        const anchor = anchorPositions[i];
        const distance = Math.sqrt(Math.pow(localX - anchor.x, 2) + Math.pow(localY - anchor.y, 2));
        if (distance <= anchorSize / 2 + buffer) {
            return { type: 'resize', index: i };
        }
    }
    
    // Check rotation anchor (this one stays in world coordinates)
    if (this.rotationAnchor) {
        const rotationX = parseFloat(this.rotationAnchor.getAttribute('cx'));
        const rotationY = parseFloat(this.rotationAnchor.getAttribute('cy'));
        const distance = Math.sqrt(Math.pow(x - rotationX, 2) + Math.pow(y - rotationY, 2));
        if (distance <= anchorSize / 2 + buffer) {
            return { type: 'rotate' };
        }
    }
    
    return null;
}

   rotate(angle) {
    this.rotation = angle;
    // If anchors exist, update their cursors for the new rotation
    if (this.isSelected && this.anchors.length > 0) {
        const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize', 'n-resize', 's-resize', 'w-resize', 'e-resize'];
        this.anchors.forEach((anchor, i) => {
            if (anchor) {
                const originalCursor = cursors[i];
                const rotatedCursor = this.getRotatedCursor(originalCursor, this.rotation);
                anchor.style.cursor = rotatedCursor;
            }
        });
    }
}

    addAnchors() {
    const anchorSize = 10 / currentZoom;
    const anchorStrokeWidth = 2;
    
    const expandedX = this.boundingBox.x - this.selectionPadding;
    const expandedY = this.boundingBox.y - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    const positions = [
        { x: expandedX, y: expandedY, cursor: 'nw-resize' }, // top-left
        { x: expandedX + expandedWidth, y: expandedY, cursor: 'ne-resize' }, // top-right
        { x: expandedX, y: expandedY + expandedHeight, cursor: 'sw-resize' }, // bottom-left
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight, cursor: 'se-resize' }, // bottom-right
        { x: expandedX + expandedWidth / 2, y: expandedY, cursor: 'n-resize' }, // top-center
        { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight, cursor: 's-resize' }, // bottom-center
        { x: expandedX, y: expandedY + expandedHeight / 2, cursor: 'w-resize' }, // left-center
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight / 2, cursor: 'e-resize' } // right-center
    ];
    
    // Create resize anchors
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

        // Set proper cursor for each anchor direction, accounting for rotation
        const rotatedCursor = this.getRotatedCursor(pos.cursor, this.rotation);
        anchor.style.cursor = rotatedCursor;
        anchor.style.pointerEvents = 'all';
        
        this.group.appendChild(anchor);
        this.anchors[i] = anchor;
    });

    // Create rotation anchor
    const rotationAnchorDistance = 30 / currentZoom;
    const rotationX = expandedX + expandedWidth / 2;
    const rotationY = expandedY - rotationAnchorDistance;
    
    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationX);
    rotationAnchor.setAttribute('cy', rotationY);
    rotationAnchor.setAttribute('r', anchorSize / 2);
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationAnchor.setAttribute('class', 'rotation-anchor');
    rotationAnchor.style.cursor = 'grab';
    rotationAnchor.style.pointerEvents = 'all';
    
    this.group.appendChild(rotationAnchor);
    registerRotationAnchor(rotationAnchor, { radius: 5, edgeY: expandedY });
    this.rotationAnchor = rotationAnchor;

    // Create selection outline
    const outlinePoints = [
        [expandedX, expandedY],
        [expandedX + expandedWidth, expandedY],
        [expandedX + expandedWidth, expandedY + expandedHeight],
        [expandedX, expandedY + expandedHeight],
        [expandedX, expandedY]
    ];
    
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    outline.setAttribute('class', 'selection-outline');
    outline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#5B57D1');
    outline.setAttribute('stroke-width', 1.5);
    outline.setAttribute('vector-effect', 'non-scaling-stroke');
    outline.setAttribute('stroke-dasharray', '4 2');
    outline.setAttribute('style', 'pointer-events: none;');
    this.group.appendChild(outline);
    this.selectionOutline = outline;

    // Add line from rotation anchor to shape
    const rotationLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rotationLine.setAttribute('x1', rotationX);
    rotationLine.setAttribute('y1', rotationY);
    rotationLine.setAttribute('x2', expandedX + expandedWidth / 2);
    rotationLine.setAttribute('y2', expandedY);
    rotationLine.setAttribute('stroke', '#5B57D1');
    rotationLine.setAttribute('stroke-width', 1);
    rotationLine.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationLine.setAttribute('stroke-dasharray', '2 2');
    rotationLine.setAttribute('style', 'pointer-events: none;');
    this.group.appendChild(rotationLine);
    this.rotationLine = rotationLine;

    // Show sidebar when anchors are added (when shape is selected)
    disableAllSideBars();
    paintBrushSideBar.classList.remove("hidden");
    if (window.__showSidebarForShape) window.__showSidebarForShape('freehandStroke');
    this.updateSidebar();
}

getRotatedCursor(direction, angle) {
    // Normalize angle to 0-360
    const normalizedAngle = ((angle % 360) + 360) % 360;
    
    // Map of cursor directions
    const cursors = ['n-resize', 'ne-resize', 'e-resize', 'se-resize', 's-resize', 'sw-resize', 'w-resize', 'nw-resize'];
    const directionMap = {
        'n-resize': 0,
        'ne-resize': 1,
        'e-resize': 2,
        'se-resize': 3,
        's-resize': 4,
        'sw-resize': 5,
        'w-resize': 6,
        'nw-resize': 7
    };
    
    if (!(direction in directionMap)) return direction;
    
    // Calculate how many 45-degree increments to rotate
    const rotationSteps = Math.round(normalizedAngle / 45);
    const currentIndex = directionMap[direction];
    const newIndex = (currentIndex + rotationSteps) % 8;
    
    return cursors[newIndex];
}

    updatePosition(anchorIndex, newX, newY) {
    const centerX = this.boundingBox.x + this.boundingBox.width / 2;
    const centerY = this.boundingBox.y + this.boundingBox.height / 2;
    
    // Transform new coordinates to local space (accounting for rotation)
    const angleRad = -this.rotation * Math.PI / 180;
    const dx = newX - centerX;
    const dy = newY - centerY;
    const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
    const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;
    
    // Calculate scale factors based on anchor movement in local space
    const expandedX = this.boundingBox.x - this.selectionPadding;
    const expandedY = this.boundingBox.y - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    let scaleX = 1, scaleY = 1;
    switch(anchorIndex) {
        case 0: // top-left
            scaleX = (centerX - localX) / (centerX - expandedX);
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 1: // top-right
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 2: // bottom-left
            scaleX = (centerX - localX) / (centerX - expandedX);
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 3: // bottom-right
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 4: // top-center
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 5: // bottom-center
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 6: // left-center
            scaleX = (centerX - localX) / (centerX - expandedX);
            break;
        case 7: // right-center
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            break;
    }
    
    // Prevent negative scaling
    scaleX = Math.max(0.1, Math.abs(scaleX));
    scaleY = Math.max(0.1, Math.abs(scaleY));
    
    // Apply scaling to all points relative to center
    this.points = this.points.map(point => {
        const relX = point[0] - centerX;
        const relY = point[1] - centerY;
        return [
            centerX + relX * scaleX,
            centerY + relY * scaleY,
            point[2] || 0.5
        ];
    });
    
    this.draw();
}
}

export { FreehandStroke };
