/* eslint-disable */
// Eraser trail visualization - smooth trail with fade
// Depends on globals: svg, currentZoom

let isErasing = false;
let eraserPath = null;
let eraserGlow = null;
let eraserPoints = [];
let targetedElements = new Set();

const MAX_TRAIL_LENGTH = 28;
const FADE_DURATION = 320;
const MIN_POINT_DISTANCE = 1;
const SMOOTHING_WINDOW = 5;

let fadeAnimationId = null;
let fadeStartTime = null;
let fadeInitialPoints = null;
let renderAnimationId = null;

function trailPalette() {
    const isLight = document.documentElement.dataset.canvasTheme === 'light' || document.body?.classList.contains('theme-light');
    return isLight
        ? { core: '49, 40, 63', glow: '124, 89, 195' }
        : { core: '245, 239, 251', glow: '199, 164, 255' };
}

// Getter/setter for isErasing so eraserTool can share state
function getIsErasing() { return isErasing; }
function setIsErasing(val) { isErasing = val; }
function getTargetedElements() { return targetedElements; }

// --- Convert screen coordinates to SVG viewBox coordinates ---
function screenToSVGEraser(clientX, clientY) {
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    try {
        const inv = CTM.inverse();
        return {
            x: (clientX - CTM.e) * inv.a + (clientY - CTM.f) * inv.c,
            y: (clientX - CTM.e) * inv.b + (clientY - CTM.f) * inv.d
        };
    } catch (e) {
        return {
            x: (clientX - CTM.e) / CTM.a,
            y: (clientY - CTM.f) / CTM.d
        };
    }
}

// Smooth points using moving average to remove micro-jitter
function smoothPoints(points) {
    if (points.length <= 2) return points;
    const half = Math.floor(SMOOTHING_WINDOW / 2);
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        let sx = 0, sy = 0, count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
            sx += points[j].x;
            sy += points[j].y;
            count++;
        }
        result.push({ x: sx / count, y: sy / count });
    }
    result.push(points[points.length - 1]);
    return result;
}

// Build smooth SVG path using Catmull-Rom → cubic bezier
function buildSmoothPath(rawPoints) {
    if (rawPoints.length === 0) return '';
    if (rawPoints.length === 1) return `M ${rawPoints[0].x} ${rawPoints[0].y}`;

    const points = smoothPoints(rawPoints);

    let d = `M ${points[0].x} ${points[0].y}`;

    if (points.length === 2) {
        d += ` L ${points[1].x} ${points[1].y}`;
        return d;
    }

    const tension = 0.4;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 3;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

// Safely remove an SVG element
function safeRemove(el) {
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
    }
}

// Remove all trail elements and reset state
function cleanupTrail() {
    if (renderAnimationId) {
        cancelAnimationFrame(renderAnimationId);
        renderAnimationId = null;
    }
    if (fadeAnimationId) {
        cancelAnimationFrame(fadeAnimationId);
        fadeAnimationId = null;
    }
    fadeStartTime = null;
    fadeInitialPoints = null;
    safeRemove(eraserPath);
    safeRemove(eraserGlow);
    eraserPath = null;
    eraserGlow = null;
    eraserPoints = [];
}

// --- Create the eraser trail ---
function createEraserTrail(x, y) {
    // Clean up any leftover trail first
    cleanupTrail();

    // Outer glow
    eraserGlow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    eraserGlow.setAttribute("fill", "none");
    const palette = trailPalette();
    eraserGlow.setAttribute("stroke", `rgba(${palette.glow}, 0.20)`);
    eraserGlow.setAttribute("stroke-width", 14 / currentZoom);
    eraserGlow.setAttribute("stroke-linecap", "round");
    eraserGlow.setAttribute("stroke-linejoin", "round");
    eraserGlow.style.pointerEvents = "none";
    svg.appendChild(eraserGlow);

    // Core path
    eraserPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    eraserPath.setAttribute("fill", "none");
    eraserPath.setAttribute("stroke", `rgba(${palette.core}, 0.62)`);
    eraserPath.setAttribute("stroke-width", 5 / currentZoom);
    eraserPath.setAttribute("stroke-linecap", "round");
    eraserPath.setAttribute("stroke-linejoin", "round");
    eraserPath.style.pointerEvents = "none";
    svg.appendChild(eraserPath);

    const svgPt = screenToSVGEraser(x, y);
    eraserPoints = [svgPt];
}

// --- Update the eraser trail with new point ---
function updateEraserTrail(x, y) {
    if (!eraserPath) return;

    const svgPt = screenToSVGEraser(x, y);
    const last = eraserPoints[eraserPoints.length - 1];

    if (last) {
        const dist = Math.hypot(last.x - svgPt.x, last.y - svgPt.y);
        if (dist < MIN_POINT_DISTANCE / currentZoom) return;
    }

    eraserPoints.push(svgPt);

    if (eraserPoints.length > MAX_TRAIL_LENGTH) {
        eraserPoints.shift();
    }

    if (!renderAnimationId) {
        renderAnimationId = requestAnimationFrame(() => {
            renderAnimationId = null;
            renderTrail(eraserPoints, 1.0);
        });
    }
}

// Render the trail with given points and opacity multiplier
function renderTrail(points, opacityMul) {
    if (!eraserPath || points.length < 2) return;

    const pathD = buildSmoothPath(points);
    const coreW = Math.max(1.5 / currentZoom, (5 / currentZoom) * opacityMul);
    const glowW = Math.max(3 / currentZoom, (14 / currentZoom) * opacityMul);
    const coreOpacity = 0.62 * opacityMul;
    const glowOpacity = 0.20 * opacityMul;
    const palette = trailPalette();

    eraserPath.setAttribute("d", pathD);
    eraserPath.setAttribute("stroke", `rgba(${palette.core}, ${coreOpacity})`);
    eraserPath.setAttribute("stroke-width", coreW);

    if (eraserGlow) {
        eraserGlow.setAttribute("d", pathD);
        eraserGlow.setAttribute("stroke", `rgba(${palette.glow}, ${glowOpacity})`);
        eraserGlow.setAttribute("stroke-width", glowW);
    }
}

// --- Fade out the eraser trail using rAF ---
function fadeOutEraserTrail() {
    if (!eraserPath) {
        cleanupTrail();
        return;
    }

    if (renderAnimationId) {
        cancelAnimationFrame(renderAnimationId);
        renderAnimationId = null;
        renderTrail(eraserPoints, 1.0);
    }

    // Cancel any existing fade
    if (fadeAnimationId) {
        cancelAnimationFrame(fadeAnimationId);
    }

    fadeStartTime = performance.now();
    fadeInitialPoints = [...eraserPoints];

    function fadeStep() {
        const now = performance.now();
        const elapsed = now - fadeStartTime;
        const progress = Math.min(1, elapsed / FADE_DURATION);

        // Cubic ease out for smooth fade
        const opacity = 1 - progress * progress * progress;

        if (opacity <= 0.01 || progress >= 1) {
            cleanupTrail();
            return;
        }

        renderTrail(fadeInitialPoints, opacity);
        fadeAnimationId = requestAnimationFrame(fadeStep);
    }

    fadeAnimationId = requestAnimationFrame(fadeStep);
}

// Failsafe: force cleanup any lingering trails (called on tool switch, etc.)
function forceCleanupEraserTrail() {
    cleanupTrail();
    isErasing = false;
}

export {
    createEraserTrail,
    updateEraserTrail,
    fadeOutEraserTrail,
    forceCleanupEraserTrail,
    getIsErasing,
    setIsErasing,
    getTargetedElements
};
