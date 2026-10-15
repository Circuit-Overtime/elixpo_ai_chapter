/* eslint-disable */
// Laser tool - smooth laser pointer with fade trail
// Depends on globals: svg, currentZoom, isLaserToolActive

const lazerCursor = `data:image/svg+xml;base64,${btoa('<svg viewBox="0 0 24 24" stroke-width="1" width="28" height="28" xmlns="http://www.w3.org/2000/svg"><path d="M6.164 11.755a5.314 5.314 0 0 1-4.932-5.298 5.314 5.314 0 0 1 5.311-5.311 5.314 5.314 0 0 1 5.307 5.113l8.773 8.773a3.322 3.322 0 0 1 0 4.696l-.895.895a3.322 3.322 0 0 1-4.696 0l-8.868-8.868Z" style="fill:#fff"/><path stroke="#1b1b1f" fill="#fff" d="m7.868 11.113 7.773 7.774a2.359 2.359 0 0 0 1.667.691 2.368 2.368 0 0 0 2.357-2.358c0-.625-.248-1.225-.69-1.667L11.201 7.78 9.558 9.469l-1.69 1.643v.001Zm10.273 3.606-3.333 3.333m-3.25-6.583 2 2m-7-7 3 3M3.664 3.625l1 1M2.529 6.922l1.407-.144m5.735-2.932-1.118.866M4.285 9.823l.758-1.194m1.863-6.207-.13 1.408"/></svg>')}`;

let isDrawing = false;
let lasers = [];
let fadingLasers = [];

const fadeOutDuration = 1200;
const baseLaserOpacity = 0.85;
const baseLaserWidth = 3.5;
const glowWidth = 10;
const minDistanceThreshold = 0.75;
const smoothingWindow = 5; // points to average for smoothing

let drawingAnimationId = null;
let fadingAnimationId = null;
let activePointerId = null;

function screenToViewBoxPoint(x, y) {
    const CTM = svg.getScreenCTM();
    if (!CTM) return null;
    try {
        const inverseCTM = CTM.inverse();
        return {
            x: (x - CTM.e) * inverseCTM.a + (y - CTM.f) * inverseCTM.c,
            y: (x - CTM.e) * inverseCTM.b + (y - CTM.f) * inverseCTM.d
        };
    } catch (e) {
        return {
            x: (x - CTM.e) / CTM.a,
            y: (y - CTM.f) / CTM.d
        };
    }
}

function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Smooth points using a moving average to eliminate micro-jitter
function smoothPoints(points) {
    if (points.length <= 2) return points;
    const result = [points[0]]; // keep first point
    const half = Math.floor(smoothingWindow / 2);
    for (let i = 1; i < points.length - 1; i++) {
        let sx = 0, sy = 0, count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
            sx += points[j].x;
            sy += points[j].y;
            count++;
        }
        result.push({ x: sx / count, y: sy / count, timestamp: points[i].timestamp });
    }
    result.push(points[points.length - 1]); // keep last point
    return result;
}

// Build a smooth SVG path using Catmull-Rom → cubic bezier conversion
function buildSmoothPath(rawPoints) {
    if (rawPoints.length === 0) return '';
    if (rawPoints.length === 1) return `M ${rawPoints[0].x} ${rawPoints[0].y}`;

    const points = smoothPoints(rawPoints);

    let d = `M ${points[0].x} ${points[0].y}`;

    if (points.length === 2) {
        d += ` L ${points[1].x} ${points[1].y}`;
        return d;
    }

    // Catmull-Rom to cubic bezier with tension=0.5 for rounder curves
    const tension = 0.5;
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

// Create SVG group with glow + core path elements
function createLaserGroup(id) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("id", id);
    group.style.pointerEvents = "none";

    // Outer glow
    const glowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    glowPath.setAttribute("fill", "none");
    glowPath.setAttribute("stroke-linecap", "round");
    glowPath.setAttribute("stroke-linejoin", "round");
    glowPath.classList.add("laser-glow");
    group.appendChild(glowPath);

    // Core line
    const corePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    corePath.setAttribute("fill", "none");
    corePath.setAttribute("stroke-linecap", "round");
    corePath.setAttribute("stroke-linejoin", "round");
    corePath.classList.add("laser-core");
    group.appendChild(corePath);

    svg.insertBefore(group, svg.firstChild);
    return group;
}

function updateLaserAppearance(laser, isFinalFade = false) {
    let laserGroup = document.getElementById(laser.id);

    const currentTime = performance.now();
    let points = isFinalFade ? laser.initialPoints : [...laser.points];

    if (!isFinalFade) {
        points = points.filter(p => (currentTime - p.timestamp) < fadeOutDuration);
        laser.points = points;
    }

    if (points.length === 0) {
        if (laserGroup) laserGroup.remove();
        if (isFinalFade) fadingLasers = fadingLasers.filter(l => l.id !== laser.id);
        else lasers = lasers.filter(l => l.id !== laser.id);
        return;
    }

    if (!laserGroup) {
        laserGroup = createLaserGroup(laser.id);
    }

    const glowPath = laserGroup.querySelector('.laser-glow');
    const corePath = laserGroup.querySelector('.laser-core');

    // Compute overall opacity from age + fade
    const oldestAge = currentTime - points[0].timestamp;
    const newestAge = currentTime - points[points.length - 1].timestamp;
    const avgAge = (oldestAge + newestAge) / 2;
    const ageProgress = Math.min(1, avgAge / fadeOutDuration);
    const easedFade = 1 - ageProgress * ageProgress; // quadratic ease

    let opacity = baseLaserOpacity * easedFade;
    let coreW = baseLaserWidth / currentZoom;
    let glowW = glowWidth / currentZoom;

    if (isFinalFade) {
        opacity *= laser.fadeProgress;
        coreW *= laser.fadeProgress;
        glowW *= laser.fadeProgress;
    }

    opacity = Math.max(0.02, opacity);
    coreW = Math.max(0.5 / currentZoom, coreW);
    glowW = Math.max(1 / currentZoom, glowW);

    const pathD = buildSmoothPath(points);

    // Update glow
    glowPath.setAttribute("d", pathD);
    glowPath.setAttribute("stroke", `rgba(255, 50, 50, ${opacity * 0.25})`);
    glowPath.setAttribute("stroke-width", glowW);

    // Update core
    corePath.setAttribute("d", pathD);
    corePath.setAttribute("stroke", `rgba(255, 50, 50, ${opacity})`);
    corePath.setAttribute("stroke-width", coreW);
}


// Add a point directly from mousemove (high frequency capture)
function addPointToCurrentLaser(screenX, screenY) {
    const currentLaser = lasers[lasers.length - 1];
    if (!currentLaser) return;

    const svgPoint = screenToViewBoxPoint(screenX, screenY);
    if (!svgPoint) return;

    const lastPt = currentLaser.points[currentLaser.points.length - 1];
    const adjustedThreshold = minDistanceThreshold / currentZoom;
    if (!lastPt || distance(svgPoint, lastPt) >= adjustedThreshold) {
        currentLaser.points.push({ x: svgPoint.x, y: svgPoint.y, timestamp: performance.now() });
    }
}

function drawingLoop() {
    if (!isDrawing) {
        drawingAnimationId = null;
        return;
    }

    const currentLaser = lasers[lasers.length - 1];
    if (currentLaser) {
        updateLaserAppearance(currentLaser, false);
    }
    drawingAnimationId = requestAnimationFrame(drawingLoop);
}


function fadingLasersLoop() {
    if (fadingLasers.length === 0) {
        fadingAnimationId = null;
        return;
    }

    const currentTime = performance.now();

    for (let i = fadingLasers.length - 1; i >= 0; i--) {
        const laser = fadingLasers[i];
        const elapsed = currentTime - laser.fadeStartTime;
        const rawProgress = Math.min(1, elapsed / fadeOutDuration);
        laser.fadeProgress = 1 - rawProgress * rawProgress * rawProgress; // cubic ease out

        updateLaserAppearance(laser, true);

        if (laser.fadeProgress <= 0.01) {
            const laserGroup = document.getElementById(laser.id);
            if (laserGroup) laserGroup.remove();
            fadingLasers.splice(i, 1);
        }
    }

    fadingAnimationId = requestAnimationFrame(fadingLasersLoop);
}


function fadeLaserTrail(laser) {
    lasers = lasers.filter(l => l.id !== laser.id);

    laser.fadeStartTime = performance.now();
    laser.initialPoints = [...laser.points];
    laser.fadeProgress = 1;

    fadingLasers.push(laser);

    if (!fadingAnimationId) {
        fadingAnimationId = requestAnimationFrame(fadingLasersLoop);
    }
}


svg.addEventListener("pointerdown", (e) => {
    if (!isLaserToolActive) return;

    if (e.target !== svg) {
        const isUIElement = e.target.closest('.selection-box, .resize-handle');
        if (isUIElement) return;
    }

    let screenPoint = { x: e.clientX, y: e.clientY };
    let startSvgPoint = screenToViewBoxPoint(screenPoint.x, screenPoint.y);
    if (!startSvgPoint) return;

    // If a drawing is already in progress, trigger its fade-out
    if (isDrawing && lasers.length > 0) {
        fadeLaserTrail(lasers[lasers.length - 1]);
    }

    isDrawing = true;
    activePointerId = e.pointerId;
    svg.setPointerCapture?.(e.pointerId);

    const laserId = "laserGroup_" + Date.now() + "_" + Math.random().toString(16).slice(2);
    const newLaser = {
        id: laserId,
        points: [{ x: startSvgPoint.x, y: startSvgPoint.y, timestamp: performance.now() }],
    };
    lasers.push(newLaser);

    if (!drawingAnimationId) {
        drawingAnimationId = requestAnimationFrame(drawingLoop);
    }
});

svg.addEventListener("pointermove", (e) => {
    if (isLaserToolActive) {
        svg.style.cursor = `url(${lazerCursor}) 0 0, auto`;
    }

    if (!isDrawing) return;

    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    events.forEach((point) => addPointToCurrentLaser(point.clientX, point.clientY));
});

svg.addEventListener("pointerup", (e) => {
    if (!isDrawing) return;

    isDrawing = false;
    if (activePointerId !== null) svg.releasePointerCapture?.(activePointerId);
    activePointerId = null;

    if (lasers.length > 0) {
        fadeLaserTrail(lasers[lasers.length - 1]);
    }

    if (isLaserToolActive) {
        svg.style.cursor = `url(${lazerCursor}) 0 0, auto`;
    } else {
        svg.style.cursor = 'default';
    }
});

svg.addEventListener("pointercancel", () => {
    if (!isDrawing) return;

    isDrawing = false;
    activePointerId = null;

    if (lasers.length > 0) {
        fadeLaserTrail(lasers[lasers.length - 1]);
    }
});
