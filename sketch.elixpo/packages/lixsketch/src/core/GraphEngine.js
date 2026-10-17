/* eslint-disable */
/**
 * GraphEngine - bridge between graph rendering and the sketch canvas.
 *
 * Canvas graphs use ImageShape with an SVG data URL. This keeps the graph a
 * single crisp vector element while reusing the engine's established select,
 * translate, resize, rotate, copy/paste, and frame-containment behaviour.
 */

import { parseExpression, isValidExpression } from './GraphMathParser.js';
import { renderGraphSVG, renderGraphPreviewSVG, GRAPH_COLORS } from './GraphRenderer.js';

const NS = 'http://www.w3.org/2000/svg';
const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 420;
const MAX_PLACED_SCREEN_WIDTH = 480;
const MAX_VIEWPORT_WIDTH_RATIO = 0.68;
const MAX_VIEWPORT_HEIGHT_RATIO = 0.58;

function cloneGraphData(equations, settings) {
    return {
        equations: (equations || []).map((equation) => ({
            expression: equation.expression,
            color: equation.color,
        })),
        settings: { ...(settings || {}) },
    };
}

function graphSvgDataUrl(svgMarkup) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

function refreshGraphImage(shape) {
    if (!shape?._graphData || !shape.element) return false;
    const svgMarkup = renderGraphSVG(shape._graphData.equations, {
        ...shape._graphData.settings,
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
    });
    if (!svgMarkup) return false;
    const href = graphSvgDataUrl(svgMarkup);
    shape.element.setAttribute('href', href);
    shape.element.setAttribute('data-href', href);
    return true;
}

/** Attach graph behaviour to a regular ImageShape, including restored and
 * pasted graphs. The function is intentionally idempotent. */
function hydrateGraphShape(shape, graphData) {
    if (!shape?.element || !graphData) return shape;
    shape._frameType = 'graph';
    shape._graphData = cloneGraphData(graphData.equations, graphData.settings);
    shape.uploadStatus = 'done';
    shape.element.setAttribute('data-graph-shape', 'true');
    shape.element.setAttribute('preserveAspectRatio', 'none');
    shape.element.style.cursor = 'move';
    shape._refreshGraphImage = () => refreshGraphImage(shape);
    shape.adaptToBackground = () => refreshGraphImage(shape);
    return shape;
}

function selectOnlyGraph(shape) {
    if (!shape) return;

    if (window.multiSelection?.selectedShapes?.size) {
        window.multiSelection.clearSelection();
    }
    if (window.currentShape && window.currentShape !== shape
        && typeof window.currentShape.removeSelection === 'function') {
        window.currentShape.removeSelection();
    }

    // Generated content always lands ready to manipulate. Use the store bridge
    // so the toolbar and legacy engine flags change together.
    window.__sketchStoreApi?.setActiveTool?.('select');
    window.currentShape = shape;
    shape.selectShape?.();
}

function placedGraphSize(viewBox) {
    const zoom = Math.max(0.001, Number(window.currentZoom) || 1);
    const byScreen = MAX_PLACED_SCREEN_WIDTH / zoom;
    const byViewportWidth = viewBox.width * MAX_VIEWPORT_WIDTH_RATIO;
    const byViewportHeight = viewBox.height * MAX_VIEWPORT_HEIGHT_RATIO * (GRAPH_WIDTH / GRAPH_HEIGHT);
    const width = Math.max(80 / zoom, Math.min(GRAPH_WIDTH, byScreen, byViewportWidth, byViewportHeight));
    return { width, height: width * (GRAPH_HEIGHT / GRAPH_WIDTH) };
}

/**
 * Place a graph as one editable vector-image shape, or update an existing
 * graph in place without losing its canvas position, size, or rotation.
 */
function renderGraphOnCanvas(equations, settings, existingShape = null) {
    const validEquations = (equations || []).filter((equation) => equation?.expression?.trim());
    if (validEquations.length === 0) return false;
    if (!window.svg || !window.ImageShape) {
        console.error('[GraphEngine] Engine not initialized');
        return false;
    }

    const graphData = cloneGraphData(validEquations, settings);

    if (existingShape?._frameType === 'graph' && existingShape.element) {
        hydrateGraphShape(existingShape, graphData);
        if (!refreshGraphImage(existingShape)) return false;
        selectOnlyGraph(existingShape);
        window.__adaptCanvasContrast?.(
            window.getComputedStyle(window.svg).backgroundColor || '#15111f'
        );
        return true;
    }

    const viewBox = window.currentViewBox || {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
    };
    const size = placedGraphSize(viewBox);
    const x = viewBox.x + (viewBox.width - size.width) / 2;
    const y = viewBox.y + (viewBox.height - size.height) / 2;

    try {
        const image = document.createElementNS(NS, 'image');
        image.setAttribute('x', x);
        image.setAttribute('y', y);
        image.setAttribute('width', size.width);
        image.setAttribute('height', size.height);
        image.setAttribute('data-shape-x', x);
        image.setAttribute('data-shape-y', y);
        image.setAttribute('data-shape-width', size.width);
        image.setAttribute('data-shape-height', size.height);

        const graphShape = hydrateGraphShape(new window.ImageShape(image), graphData);
        if (!refreshGraphImage(graphShape)) {
            graphShape.group?.remove();
            return false;
        }

        window.shapes.push(graphShape);
        window.pushCreateAction?.(graphShape);
        selectOnlyGraph(graphShape);
        window.__adaptCanvasContrast?.(
            window.getComputedStyle(window.svg).backgroundColor || '#15111f'
        );
        return true;
    } catch (error) {
        console.error('[GraphEngine] SVG insertion failed:', error);
        return false;
    }
}

/** Initialize graph bridges used by the modal and scene restoration. */
export function initGraphEngine() {
    window.__graphPreview = (equations, settings) => renderGraphPreviewSVG(equations, settings);
    window.__graphRenderer = renderGraphOnCanvas;
    window.__hydrateGraphShape = hydrateGraphShape;
    window.__graphParser = (expression) => Boolean(parseExpression(expression));
    window.__graphValidate = isValidExpression;
    window.__graphColors = GRAPH_COLORS;
}
