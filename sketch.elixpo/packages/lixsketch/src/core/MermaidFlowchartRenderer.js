/* eslint-disable */
/**
 * MermaidFlowchartRenderer - Renders parsed flowchart diagrams as high-quality SVG.
 *
 * One renderer for both preview and canvas — ensures they always match.
 * Supports: rectangle [], rounded rectangle (), circle (()), diamond/rhombus {},
 * directed/undirected edges with labels, subgraphs, all directions (TD/TB/LR/RL/BT).
 *
 * Dark theme matching the app aesthetic.
 */

// Layout constants
const NODE_W = 150;
const NODE_H = 50;
const H_SPACING = 200;
const V_SPACING = 120;
const SIDE_MARGIN = 50;
const TOP_MARGIN = 40;
const FONT_FAMILY = 'lixFont, sans-serif';

// Issue #38 follow-up: theme-aware stroke / fill. Resolved at draw time
// so a single render call uses whichever palette is active.
function isThemeDark() {
    if (typeof document === 'undefined') return true;
    if (document.body) {
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
    }
    return !document.documentElement || document.documentElement.classList.contains('dark');
}
function nodeStrokeColor() { return isThemeDark() ? '#fff' : '#1a1a2e'; }
function edgeStrokeColor() { return isThemeDark() ? '#888' : '#444'; }

const DARK_THEME = {
    bg: '#1e1e28',
    nodeBg: 'transparent',
    nodeStroke: '#9090c0',
    nodeText: '#e0e0e0',
    edgeStroke: '#888',
    edgeText: '#a0a0b0',
    subgraphBg: 'rgba(80,80,120,0.08)',
    subgraphBorder: '#555',
    subgraphLabel: '#888',
};

const LIGHT_THEME = {
    bg: '#fbfaf6',
    nodeBg: '#f5f2ea',
    nodeStroke: '#6e746c',
    nodeText: '#343832',
    edgeStroke: '#6e746c',
    edgeText: '#4f554e',
    subgraphBg: 'rgba(117, 135, 119, 0.06)',
    subgraphBorder: '#aaa99f',
    subgraphLabel: '#666b64',
};

function previewTheme() { return isThemeDark() ? DARK_THEME : LIGHT_THEME; }

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function measureText(text, fontSize) {
    return text.length * fontSize * 0.55;
}

/**
 * Render a parsed flowchart diagram to SVG markup.
 *
 * @param {Object} diagram - Parsed from parseMermaid()
 * @param {Object} opts - { width?, height?, fitToContent? }
 * @returns {string} SVG markup string
 */
export function renderFlowchartSVG(diagram, opts = {}) {
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) return '';

    const THEME = previewTheme();

    const nodes = diagram.nodes;
    const edges = diagram.edges || [];
    const subgraphs = diagram.subgraphs || [];
    const direction = diagram.direction || 'TD';

    // Compute bounds of laid-out nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        const nw = n.width || NODE_W;
        const nh = n.height || NODE_H;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + nw);
        maxY = Math.max(maxY, n.y + nh);
    });

    const dw = maxX - minX || 1;
    const dh = maxY - minY || 1;

    // If fitToContent or explicit size, scale to fit
    const targetW = opts.width || dw + SIDE_MARGIN * 2;
    const targetH = opts.height || dh + TOP_MARGIN * 2;

    let scale, offX, offY;
    if (opts.width || opts.height) {
        const pad = 40;
        scale = Math.min(
            (targetW - pad * 2) / dw,
            (targetH - pad * 2) / dh,
            1.8
        );
        offX = (targetW - dw * scale) / 2 - minX * scale;
        offY = (targetH - dh * scale) / 2 - minY * scale;
    } else {
        scale = 1;
        offX = SIDE_MARGIN - minX;
        offY = TOP_MARGIN - minY;
    }

    const totalWidth = opts.width || Math.round(dw * scale + SIDE_MARGIN * 2);
    const totalHeight = opts.height || Math.round(dh * scale + TOP_MARGIN * 2);

    // Build node lookup for edge rendering
    const nodeById = new Map();
    nodes.forEach(n => {
        const nw = (n.width || NODE_W) * scale;
        const nh = (n.height || NODE_H) * scale;
        const nx = n.x * scale + offX;
        const ny = n.y * scale + offY;
        nodeById.set(n.id, {
            x: nx, y: ny, w: nw, h: nh,
            cx: nx + nw / 2, cy: ny + nh / 2,
            type: n.type, label: n.label,
            fill: n.fill, stroke: n.stroke, strokeWidth: n.strokeWidth,
        });
    });

    let svg = '';
    const defs = [];

    // Arrow markers (normal, dotted, thick)
    defs.push(`<marker id="fc-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <path d="M1,1 L9,3.5 L1,6" fill="none" stroke="${THEME.edgeStroke}" stroke-width="1.5" stroke-linejoin="round" />
    </marker>`);
    defs.push(`<marker id="fc-arrow-thick" markerWidth="12" markerHeight="9" refX="11" refY="4.5" orient="auto">
      <path d="M1,1 L11,4.5 L1,8" fill="none" stroke="${THEME.edgeStroke}" stroke-width="2" stroke-linejoin="round" />
    </marker>`);

    // Background
    svg += `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${THEME.bg}" rx="8" />`;

    // --- Subgraphs (rendered first, behind everything) ---
    for (const sg of subgraphs) {
        if (!sg.nodes || sg.nodes.length === 0) continue;

        let sgMinX = Infinity, sgMinY = Infinity, sgMaxX = -Infinity, sgMaxY = -Infinity;
        let hasNodes = false;
        for (const nid of sg.nodes) {
            const nd = nodeById.get(nid);
            if (!nd) continue;
            hasNodes = true;
            sgMinX = Math.min(sgMinX, nd.x);
            sgMinY = Math.min(sgMinY, nd.y);
            sgMaxX = Math.max(sgMaxX, nd.x + nd.w);
            sgMaxY = Math.max(sgMaxY, nd.y + nd.h);
        }
        if (!hasNodes) continue;

        const sgPad = 20 * scale;
        const sgX = sgMinX - sgPad;
        const sgY = sgMinY - sgPad - 16 * scale;
        const sgW = (sgMaxX - sgMinX) + sgPad * 2;
        const sgH = (sgMaxY - sgMinY) + sgPad * 2 + 16 * scale;

        svg += `<g data-fc-type="subgraph" data-fc-id="${escapeXml(sg.id)}">`;
        svg += `<rect x="${sgX}" y="${sgY}" width="${sgW}" height="${sgH}" rx="6" fill="${THEME.subgraphBg}" stroke="${THEME.subgraphBorder}" stroke-width="1" stroke-dasharray="4 2" />`;
        if (sg.label) {
            svg += `<text x="${sgX + 8}" y="${sgY + 14}" fill="${THEME.subgraphLabel}" font-size="${Math.max(9, 11 * scale)}" font-family="${FONT_FAMILY}">${escapeXml(sg.label)}</text>`;
        }
        svg += `</g>`;
    }

    // --- Edges ---
    edges.forEach(e => {
        const f = nodeById.get(e.from);
        const t = nodeById.get(e.to);
        if (!f || !t) return;

        const directed = e.directed !== false;
        const edgeStyle = e.style || 'normal';
        let strokeW, dashArr, markerRef;
        if (edgeStyle === 'thick') {
            strokeW = 3;
            dashArr = '';
            markerRef = directed ? ' marker-end="url(#fc-arrow-thick)"' : '';
        } else if (edgeStyle === 'dotted') {
            strokeW = 1.5;
            dashArr = ' stroke-dasharray="5 3"';
            markerRef = directed ? ' marker-end="url(#fc-arrow)"' : '';
        } else {
            strokeW = 1.5;
            dashArr = '';
            markerRef = directed ? ' marker-end="url(#fc-arrow)"' : '';
        }
        const eStroke = e.stroke || THEME.edgeStroke;

        // Compute connection points
        const sp = getEdgePoint(f, t);
        const ep = getEdgePoint(t, f);

        // Determine if we should curve
        const dx = t.cx - f.cx;
        const dy = t.cy - f.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let mx = (sp.x + ep.x) / 2;
        let my = (sp.y + ep.y) / 2;

        svg += `<g data-fc-type="edge" data-fc-from="${escapeXml(e.from)}" data-fc-to="${escapeXml(e.to)}">`;

        if (dist > 0 && Math.abs(dy) > 15 && Math.abs(dx) > 15) {
            // Curved edge
            const perpX = -dy / dist;
            const perpY = dx / dist;
            const curveAmt = dist * 0.12;
            const cpx = mx + perpX * curveAmt;
            const cpy = my + perpY * curveAmt;
            mx = 0.25 * sp.x + 0.5 * cpx + 0.25 * ep.x;
            my = 0.25 * sp.y + 0.5 * cpy + 0.25 * ep.y;
            svg += `<path d="M ${sp.x} ${sp.y} Q ${cpx} ${cpy} ${ep.x} ${ep.y}" fill="none" stroke="${eStroke}" stroke-width="${strokeW}"${dashArr}${markerRef} />`;
        } else {
            svg += `<line x1="${sp.x}" y1="${sp.y}" x2="${ep.x}" y2="${ep.y}" stroke="${eStroke}" stroke-width="${strokeW}"${dashArr}${markerRef} />`;
        }

        // Edge label (supports multi-line via \n)
        if (e.label) {
            const labelFontSize = Math.max(8, 10 * scale);
            const labelLines = e.label.split('\n');
            const maxLineW = Math.max(...labelLines.map(l => measureText(l, labelFontSize)));
            const labelW = maxLineW + 12;
            const labelH = labelLines.length * (labelFontSize + 3) + 6;
            svg += `<rect x="${mx - labelW / 2}" y="${my - labelH / 2}" width="${labelW}" height="${labelH}" rx="3" fill="${THEME.bg}" opacity="0.85" />`;
            if (labelLines.length === 1) {
                svg += `<text x="${mx}" y="${my + 1}" text-anchor="middle" dominant-baseline="central" fill="${THEME.edgeText}" font-size="${labelFontSize}" font-family="${FONT_FAMILY}">${escapeXml(e.label)}</text>`;
            } else {
                const startY = my - ((labelLines.length - 1) * (labelFontSize + 3)) / 2;
                svg += `<text x="${mx}" text-anchor="middle" fill="${THEME.edgeText}" font-size="${labelFontSize}" font-family="${FONT_FAMILY}">`;
                labelLines.forEach((ln, idx) => {
                    svg += `<tspan x="${mx}" dy="${idx === 0 ? 0 : labelFontSize + 3}" y="${idx === 0 ? startY : ''}">${escapeXml(ln)}</tspan>`;
                });
                svg += `</text>`;
            }
        }

        svg += `</g>`;
    });

    // --- Nodes ---
    nodes.forEach(n => {
        const d = nodeById.get(n.id);
        if (!d) return;

        const nStroke = n.stroke || THEME.nodeStroke;
        const nFill = n.fill || THEME.nodeBg;
        const nStrokeWidth = n.strokeWidth || 1.8;
        const fontSize = Math.max(9, Math.min(13, 12 * scale));

        svg += `<g data-fc-type="node" data-fc-id="${escapeXml(n.id)}">`;

        if (n.type === 'circle') {
            const r = Math.min(d.w, d.h) / 2;
            svg += `<circle cx="${d.cx}" cy="${d.cy}" r="${r}" fill="${nFill}" stroke="${nStroke}" stroke-width="${nStrokeWidth}" />`;
        } else if (n.type === 'diamond') {
            const hw = d.w / 2 * 0.85;
            const hh = d.h / 2 * 0.85;
            svg += `<polygon points="${d.cx},${d.cy - hh} ${d.cx + hw},${d.cy} ${d.cx},${d.cy + hh} ${d.cx - hw},${d.cy}" fill="${nFill}" stroke="${nStroke}" stroke-width="${nStrokeWidth}" />`;
        } else if (n.type === 'asymmetric') {
            // Flag/asymmetric shape: pointed left, flat right
            const notchX = d.x + 15 * scale;
            svg += `<polygon points="${d.x},${d.y} ${d.x + d.w},${d.y} ${d.x + d.w},${d.y + d.h} ${d.x},${d.y + d.h} ${notchX},${d.cy}" fill="${nFill}" stroke="${nStroke}" stroke-width="${nStrokeWidth}" />`;
        } else if (n.type === 'roundrect') {
            svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${12 * scale}" fill="${nFill}" stroke="${nStroke}" stroke-width="${nStrokeWidth}" />`;
        } else {
            svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${3 * scale}" fill="${nFill}" stroke="${nStroke}" stroke-width="${nStrokeWidth}" />`;
        }

        // Node label (supports multi-line via \n)
        if (n.label) {
            const hasSolidFill = nFill && nFill !== 'transparent' && nFill !== 'none';
            const labelFill = n.labelColor || (hasSolidFill ? getContrastColor(nFill) : THEME.nodeText);

            const labelLines = n.label.split('\n');
            if (labelLines.length === 1) {
                svg += `<text x="${d.cx}" y="${d.cy}" text-anchor="middle" dominant-baseline="central" fill="${labelFill}" font-size="${fontSize}" font-family="${FONT_FAMILY}" font-weight="500">${escapeXml(n.label)}</text>`;
            } else {
                const lineH = fontSize + 3;
                const startY = d.cy - ((labelLines.length - 1) * lineH) / 2;
                svg += `<text text-anchor="middle" fill="${labelFill}" font-size="${fontSize}" font-family="${FONT_FAMILY}" font-weight="500">`;
                labelLines.forEach((ln, idx) => {
                    svg += `<tspan x="${d.cx}" y="${startY + idx * lineH}">${escapeXml(ln)}</tspan>`;
                });
                svg += `</text>`;
            }
        }

        svg += `</g>`;
    });

    // Build final SVG
    const defsStr = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">${defsStr}${svg}</svg>`;
}

/**
 * Get the connection point on a node's boundary toward another node.
 */
function getEdgePoint(node, target) {
    const dx = target.cx - node.cx;
    const dy = target.cy - node.cy;

    if (node.type === 'circle') {
        const r = Math.min(node.w, node.h) / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: node.cx + (dx / dist) * r, y: node.cy + (dy / dist) * r };
    }

    if (node.type === 'diamond') {
        // Diamond edge intersection
        const hw = node.w / 2 * 0.85;
        const hh = node.h / 2 * 0.85;
        const adx = Math.abs(dx) || 0.001;
        const ady = Math.abs(dy) || 0.001;
        const t = Math.min(hw / adx, hh / ady);
        return { x: node.cx + dx * t * 0.95, y: node.cy + dy * t * 0.95 };
    }

    // Rectangle / rounded rect / asymmetric - exit from edges
    const hw = node.w / 2;
    const hh = node.h / 2;

    if (Math.abs(dx) < 0.001 || Math.abs(dy) * hw > Math.abs(dx) * hh) {
        if (dy > 0) return { x: node.cx, y: node.y + node.h };
        return { x: node.cx, y: node.y };
    }
    if (dx > 0) return { x: node.x + node.w, y: node.cy };
    return { x: node.x, y: node.cy };
}

/**
 * Resolve canvas connector endpoints on the sides facing the other node.
 * Passing node centres to autoAttach leaves short rectangles outside its
 * boundary tolerance, so the connector starts under the label instead.
 */
export function getCanvasFlowchartEdgePoints(fromNode, toNode) {
    const normalize = node => ({
        x: node.x,
        y: node.y,
        w: node.width,
        h: node.height,
        cx: node.centerX,
        cy: node.centerY,
        type: node.type,
    });
    const from = normalize(fromNode);
    const to = normalize(toNode);
    return {
        start: getEdgePoint(from, to),
        end: getEdgePoint(to, from),
    };
}

function parseColor(hex) {
    if (!hex || hex === 'transparent' || hex === 'none') return null;
    let c = hex.replace('#', '');
    // Support 3-char shorthand (#9f6 → #99ff66)
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    if (c.length < 6) return null;
    return {
        r: parseInt(c.substring(0, 2), 16),
        g: parseInt(c.substring(2, 4), 16),
        b: parseInt(c.substring(4, 6), 16),
    };
}

function getLuminance(hex) {
    const rgb = parseColor(hex);
    if (!rgb) return 0;
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

function getContrastColor(bgHex) {
    // Pick dark or light text based on background luminance
    return getLuminance(bgHex) > 140 ? '#1a1a2e' : '#f0f0f0';
}

/**
 * Generate preview SVG for the modal.
 */
export function renderFlowchartPreviewSVG(diagram) {
    return renderFlowchartSVG(diagram, { width: 600, height: 450 });
}

/**
 * Render a flowchart diagram onto the canvas as a real engine `Frame`
 * containing independent shapes — Rectangle nodes (with embedded labels)
 * joined by Arrow edges. Each child is fully independent for click /
 * drag / resize / colour-change, exactly like a user-drawn shape; the
 * Frame's `_diagramType` marker means deleting it pulls every child with
 * it (so the diagram behaves as one logical unit when you're done with
 * it) — see Frame.destroy().
 *
 * Issue #34 bug #3 (follow-up to #22 phase 5): drops the shared `groupId`
 * glue that made selecting one shape select the whole diagram; the Frame
 * is the explicit container instead.
 */
export function renderFlowchartOnCanvas(diagram) {
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) return false;
    if (!window.svg || !window.Rectangle || !window.Frame) {
        console.error('[FlowchartRenderer] Engine not initialized');
        return false;
    }

    const nodes = diagram.nodes;
    const edges = diagram.edges || [];

    // Diagram bounds (in the renderer's natural coordinate space)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
        const nw = n.width || 140;
        const nh = n.height || 60;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + nw);
        maxY = Math.max(maxY, n.y + nh);
    });
    const dw = (maxX - minX) || 1;
    const dh = (maxY - minY) || 1;

    // Center on the current viewport
    const vb = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const vcx = vb.x + vb.width / 2;
    const vcy = vb.y + vb.height / 2;
    const ox = vcx - dw / 2 - minX;
    const oy = vcy - dh / 2 - minY;

    // ── Wrapper frame ──────────────────────────────────────────────────
    // Created up-front so we can call addShapeToFrame as each child is
    // built. _diagramType marks it so Frame.destroy() takes the children
    // along on delete (issue #34 bug #3).
    //
    // PADDING bumped from 40 → 90 so edge labels, rotated diamond nodes,
    // and arrow heads near the diagram boundary stay inside the frame
    // instead of getting clipped at the corners.
    const PADDING = 90;
    const frameTitle = diagram.title || 'Mermaid diagram';
    const undoBatch = window.beginUndoBatch?.();
    const frame = new window.Frame(
        vcx - dw / 2 - PADDING,
        vcy - dh / 2 - PADDING,
        dw + PADDING * 2,
        dh + PADDING * 2,
        {
            stroke: '#888',
            strokeWidth: 1,
            fill: 'transparent',
            opacity: 0.7,
            frameName: frameTitle,
        }
    );
    frame._diagramType = 'mermaid-flowchart';
    window.shapes.push(frame);
    if (window.pushCreateAction) window.pushCreateAction(frame, { frameCreation: true, containedShapes: [] });

    const nodeMap = new Map(); // id → shape

    // ── Nodes ──────────────────────────────────────────────────────────
    for (const n of nodes) {
        const nw = n.width || 140;
        const nh = n.height || 60;
        const nx = n.x + ox;
        const ny = n.y + oy;
        const cx = nx + nw / 2;
        const cy = ny + nh / 2;

        const opts = {
            stroke: n.stroke || nodeStrokeColor(),
            strokeWidth: n.strokeWidth ?? 1.5,
            fill: n.fill || 'transparent',
            fillStyle: n.fill && n.fill !== 'transparent' ? 'solid' : 'none',
            roughness: 1,
            label: n.label || '',
            labelColor: n.labelColor || (n.fill && n.fill !== 'transparent' ? getContrastColor(n.fill) : nodeStrokeColor()),
        };

        let shape = null;
        try {
            if (n.type === 'circle' && window.Circle) {
                shape = new window.Circle(cx, cy, nw / 2, nh / 2, opts);
            } else if (n.type === 'diamond') {
                const sz = Math.max(nw, nh) * 0.75;
                shape = new window.Rectangle(cx - sz / 2, cy - sz / 2, sz, sz, opts);
                shape.rotation = 45;
                if (typeof shape.draw === 'function') shape.draw();
            } else if (n.type === 'roundrect') {
                shape = new window.Rectangle(nx, ny, nw, nh, { ...opts, cornerRadius: Math.min(nw, nh) * 0.2 });
            } else {
                shape = new window.Rectangle(nx, ny, nw, nh, opts);
            }
        } catch (err) {
            console.warn('[FlowchartRenderer] Node creation failed:', n.id, err);
            continue;
        }
        if (!shape) continue;

        window.shapes.push(shape);
        frame.addShapeToFrame(shape);
        if (window.pushCreateAction) window.pushCreateAction(shape);

        nodeMap.set(n.id, { shape, type: n.type, x: nx, y: ny, width: nw, height: nh, centerX: cx, centerY: cy });
    }

    // ── Edges ──────────────────────────────────────────────────────────
    for (const e of edges) {
        const fromNode = nodeMap.get(e.from);
        const toNode = nodeMap.get(e.to);
        if (!fromNode || !toNode) continue;

        // Start on the source side facing the target and finish on the
        // reciprocal target side. For top-to-bottom diagrams this is the
        // source's south centre and the target's north centre.
        const { start: sp, end: ep } = getCanvasFlowchartEdgePoints(fromNode, toNode);

        const directed = e.directed !== false;
        const style = e.style || 'normal';
        const isThick = style === 'thick';
        const isDotted = style === 'dotted';

        const opts = {
            stroke: e.stroke || edgeStrokeColor(),
            strokeWidth: isThick ? 3 : 1.5,
            roughness: 1,
            strokeDasharray: isDotted ? '5 3' : '',
            label: e.label || '',
            labelColor: e.labelColor || edgeStrokeColor(),
        };

        let connector = null;
        try {
            if (directed && window.Arrow) {
                connector = new window.Arrow(sp, ep, opts);
            } else if (window.Line) {
                connector = new window.Line(sp, ep, opts);
            } else if (window.Arrow) {
                connector = new window.Arrow(sp, ep, opts);
            }
        } catch (err) {
            console.warn('[FlowchartRenderer] Edge creation failed:', e, err);
            continue;
        }
        if (!connector) continue;

        window.shapes.push(connector);
        frame.addShapeToFrame(connector);
        if (window.pushCreateAction) window.pushCreateAction(connector);

        // Wire arrow endpoints into the source/target shapes so moving a
        // node drags its connections along. window.__autoAttach is set up
        // by AIRenderer.initAIRenderer() during engine init.
        if (directed && connector.shapeName === 'arrow' && typeof window.__autoAttach === 'function') {
            try {
                window.__autoAttach(connector, fromNode.shape, true, sp);
                window.__autoAttach(connector, toNode.shape, false, ep);
            } catch (err) {
                console.warn('[FlowchartRenderer] autoAttach failed:', err);
            }
        }
    }

    // Select the first node so the user has feedback that something
    // landed. Selecting a child (not the frame) reinforces the
    // "independent shapes inside a frame" model.
    const first = nodeMap.values().next().value;
    if (first) {
        window.currentShape = first.shape;
        if (typeof first.shape.selectShape === 'function') first.shape.selectShape();
    }

    window.endUndoBatch?.(undoBatch, 'mermaid-flowchart-create');

    return true;
}
