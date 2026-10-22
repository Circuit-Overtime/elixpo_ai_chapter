/* eslint-disable */

const ROTATION_SELECTOR = '[data-screen-space-rotation-anchor="true"]';
const OUTLINE_SELECTOR = '.selection-outline, .selection-box, .multi-selection-outline';
const HANDLE_SELECTOR = '.anchor, .resize-anchor, .resize-handle, .multi-selection-anchor';

export const SELECTION_CHROME = Object.freeze({
    outlineWidth: 1.5,
    outlineDash: '4 2',
    handleSize: 10,
    handleStrokeWidth: 2,
    rotationRadius: 8,
    rotationGap: 30,
});

export function getSelectionChromeMetrics(zoom = 1) {
    const normalizedZoom = Math.max(0.001, Number(zoom) || 1);
    return {
        outlineWidth: SELECTION_CHROME.outlineWidth,
        outlineDash: SELECTION_CHROME.outlineDash,
        handleSize: SELECTION_CHROME.handleSize / normalizedZoom,
        rotationRadius: SELECTION_CHROME.rotationRadius / normalizedZoom,
        rotationGap: SELECTION_CHROME.rotationGap / normalizedZoom,
    };
}

function getZoom() {
    return Math.max(0.001, Number(globalThis.window?.currentZoom) || 1);
}

export function registerRotationAnchor(anchor, options = {}) {
    if (!anchor) return;
    const zoom = getZoom();
    const radius = SELECTION_CHROME.rotationRadius;
    const gap = SELECTION_CHROME.rotationGap;
    const edgeY = Number(options.edgeY);

    anchor.setAttribute('data-screen-space-rotation-anchor', 'true');
    anchor.setAttribute('data-screen-radius', String(radius));
    anchor.setAttribute('data-screen-gap', String(gap));
    anchor.setAttribute('data-applied-zoom', String(zoom));
    anchor.setAttribute('r', String(radius / zoom));
    anchor.setAttribute('stroke', '#5B57D1');
    anchor.setAttribute('stroke-width', String(SELECTION_CHROME.handleStrokeWidth));
    anchor.setAttribute('vector-effect', 'non-scaling-stroke');
    if (Number.isFinite(edgeY)) anchor.setAttribute('cy', String(edgeY - gap / zoom));

    anchor.__rotationConnector = options.line || null;
    anchor.__rotationConnectorEnd = options.lineEnd || '2';
    syncRotationConnector(anchor);
}

function syncRotationConnector(anchor) {
    const line = anchor.__rotationConnector;
    if (!line) return;
    const end = anchor.__rotationConnectorEnd === '1' ? '1' : '2';
    line.setAttribute(`x${end}`, anchor.getAttribute('cx'));
    line.setAttribute(`y${end}`, anchor.getAttribute('cy'));
    line.setAttribute('stroke', '#5B57D1');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', SELECTION_CHROME.outlineDash);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
}

function resizeHandleInScreenSpace(handle, zoom) {
    const size = SELECTION_CHROME.handleSize / zoom;
    const tagName = handle.tagName?.toLowerCase();

    if (tagName === 'rect') {
        const oldWidth = Number(handle.getAttribute('width')) || size;
        const oldHeight = Number(handle.getAttribute('height')) || size;
        const centerX = (Number(handle.getAttribute('x')) || 0) + oldWidth / 2;
        const centerY = (Number(handle.getAttribute('y')) || 0) + oldHeight / 2;
        handle.setAttribute('x', String(centerX - size / 2));
        handle.setAttribute('y', String(centerY - size / 2));
        handle.setAttribute('width', String(size));
        handle.setAttribute('height', String(size));
    } else if (tagName === 'circle' && !handle.matches(ROTATION_SELECTOR)) {
        handle.setAttribute('r', String(size / 2));
    }

    handle.setAttribute('stroke', '#5B57D1');
    handle.setAttribute('stroke-width', String(SELECTION_CHROME.handleStrokeWidth));
    handle.setAttribute('vector-effect', 'non-scaling-stroke');
}

export function syncSelectionChromeToZoom(root = document) {
    if (!root?.querySelectorAll) return;
    const zoom = getZoom();

    root.querySelectorAll(OUTLINE_SELECTOR).forEach((outline) => {
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', '#5B57D1');
        outline.setAttribute('stroke-width', String(SELECTION_CHROME.outlineWidth));
        outline.setAttribute('stroke-dasharray', SELECTION_CHROME.outlineDash);
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
    });

    root.querySelectorAll(HANDLE_SELECTOR).forEach((handle) => {
        resizeHandleInScreenSpace(handle, zoom);
    });
}

export function syncRotationAnchorsToZoom() {
    if (typeof document === 'undefined') return;
    const zoom = getZoom();
    document.querySelectorAll(ROTATION_SELECTOR).forEach((anchor) => {
        const previousZoom = Math.max(0.001, Number(anchor.getAttribute('data-applied-zoom')) || zoom);
        const radius = SELECTION_CHROME.rotationRadius;
        const gap = SELECTION_CHROME.rotationGap;
        if (Math.abs(previousZoom - zoom) >= 0.000001) {
            const currentY = Number(anchor.getAttribute('cy')) || 0;
            const edgeY = currentY + gap / previousZoom;
            anchor.setAttribute('cy', String(edgeY - gap / zoom));
            anchor.setAttribute('data-applied-zoom', String(zoom));
        }
        anchor.setAttribute('r', String(radius / zoom));
        anchor.setAttribute('stroke', '#5B57D1');
        anchor.setAttribute('stroke-width', String(SELECTION_CHROME.handleStrokeWidth));
        anchor.setAttribute('vector-effect', 'non-scaling-stroke');
        syncRotationConnector(anchor);
    });
    syncSelectionChromeToZoom(document);
}

export function installScreenSpaceControlSync(svgElement) {
    if (!svgElement || typeof MutationObserver === 'undefined') return;
    window.__screenSpaceControlObserver?.disconnect?.();
    let scheduled = false;
    const scheduleSync = () => {
        if (scheduled) return;
        scheduled = true;
        const run = () => {
            scheduled = false;
            syncRotationAnchorsToZoom();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else queueMicrotask(run);
    };
    const observer = new MutationObserver(scheduleSync);
    observer.observe(svgElement, {
        attributes: true,
        attributeFilter: ['viewBox'],
        childList: true,
        subtree: true,
    });
    window.__screenSpaceControlObserver = observer;
    scheduleSync();
}
