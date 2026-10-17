/* eslint-disable */
/**
 * AIRenderer - Converts diagram JSON into shapes on the canvas.
 *
 * Two entry points:
 * 1. renderAIDiagram(diagram) - from AI text-to-diagram response
 * 2. window.__mermaidRenderer(src) - direct algorithmic Mermaid parser
 *
 * Smart edge routing:
 * - Straight arrows/lines for vertically or horizontally aligned nodes
 * - Curved arrows for diagonal connections or when edges would overlap
 * - Elbow connections for right-angle routing when appropriate
 *
 * All created shapes belong to a Frame with auto-attachment so
 * moving nodes keeps edges connected.
 */

const PADDING = 80;
const NODE_W = 160;
const NODE_H = 60;
const H_SPACING = 260;
const V_SPACING = 180;
const NS = 'http://www.w3.org/2000/svg';

// Alignment threshold — if nodes are within this many pixels
// of being aligned, treat them as aligned (use straight edge)
const ALIGN_THRESHOLD = 30;

// ============================================================
// MERMAID PARSER
// ============================================================

export function parseMermaid(src) {
    const lines = src.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
    if (lines.length === 0) return null;

    const headerMatch = lines[0].match(/^(graph|flowchart)\s+(TD|TB|LR|RL|BT)/i);
    const direction = headerMatch ? headerMatch[2].toUpperCase() : 'TD';
    const isHorizontal = direction === 'LR' || direction === 'RL';
    const startIdx = headerMatch ? 1 : 0;

    const nodesMap = new Map();
    const edges = [];
    const classDefs = new Map();   // classDef name -> { fill, stroke, strokeWidth }
    const classAssigns = [];        // { nodeIds: [...], className }
    const nodeStyles = new Map();   // Mermaid `style A fill:...,stroke:...`
    const darkTheme = (() => {
        if (typeof document === 'undefined') return true;
        if (document.body) {
            if (document.body.classList.contains('theme-dark')) return true;
            if (document.body.classList.contains('theme-light')) return false;
        }
        return !document.documentElement || document.documentElement.classList.contains('dark');
    })();
    const palette = darkTheme
        ? [
            { fill: '#352b52', stroke: '#9d86df' },
            { fill: '#403260', stroke: '#ad92ed' },
            { fill: '#2f2948', stroke: '#927fd1' },
            { fill: '#493568', stroke: '#b195e8' },
            { fill: '#322747', stroke: '#9b83d7' },
            { fill: '#3d2e58', stroke: '#a88add' },
        ]
        : [
            { fill: '#eee9f7', stroke: '#7667a8' },
            { fill: '#e6def2', stroke: '#8875b5' },
            { fill: '#ddd2eb', stroke: '#6f5f9c' },
            { fill: '#f2edf8', stroke: '#9a88bf' },
            { fill: '#e2daf0', stroke: '#806cab' },
            { fill: '#ebe4f5', stroke: '#705d9c' },
        ];

    function parseStyleProps(value) {
        const props = {};
        for (const part of value.split(',')) {
            const separator = part.indexOf(':');
            if (separator < 0) continue;
            const key = part.slice(0, separator).trim().toLowerCase();
            const val = part.slice(separator + 1).trim();
            if (key === 'fill') props.fill = val;
            else if (key === 'stroke') props.stroke = val;
            else if (key === 'stroke-width') props.strokeWidth = parseFloat(val);
            else if (key === 'color') props.labelColor = val;
        }
        return props;
    }

    // Clean <br/> and <br> tags in labels → newline marker
    function cleanLabel(label) {
        return label.replace(/<br\s*\/?>/gi, '\n').replace(/"/g, '');
    }

    function parseNodeRef(raw) {
        raw = raw.trim();
        if (!raw) return null;
        let id, label, type;

        // Circle: id((label))
        let m = raw.match(/^(\w+)\(\((.+?)\)\)$/);
        if (m) { id = m[1]; label = m[2]; type = 'circle'; }
        // Diamond: id{label}
        if (!m) { m = raw.match(/^(\w+)\{(.+?)\}$/); if (m) { id = m[1]; label = m[2]; type = 'diamond'; } }
        // Asymmetric/flag: id>label]
        if (!m) { m = raw.match(/^(\w+)>(.+?)\]$/); if (m) { id = m[1]; label = m[2]; type = 'asymmetric'; } }
        // Rounded rect: id(label)
        if (!m) { m = raw.match(/^(\w+)\((.+?)\)$/); if (m) { id = m[1]; label = m[2]; type = 'roundrect'; } }
        // Rectangle: id[label]
        if (!m) { m = raw.match(/^(\w+)\[(.+?)\]$/); if (m) { id = m[1]; label = m[2]; type = 'rectangle'; } }
        // Plain id
        if (!m) { id = raw; label = raw; type = 'rectangle'; }

        label = cleanLabel(label);

        if (!nodesMap.has(id)) {
            nodesMap.set(id, { id, type, label });
        } else if (label !== id) {
            nodesMap.get(id).label = label;
            nodesMap.get(id).type = type;
        }
        return id;
    }

    // Parse subgraphs
    const subgraphs = [];
    let currentSubgraph = null;

    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].replace(/;$/, '').trim();
        if (!line) continue;

        // classDef: classDef green fill:#9f6,stroke:#333,stroke-width:2px;
        const classDefMatch = line.match(/^classDef\s+(\w+)\s+(.+)$/i);
        if (classDefMatch) {
            const name = classDefMatch[1];
            classDefs.set(name, parseStyleProps(classDefMatch[2].replace(/;$/, '')));
            continue;
        }

        // Direct node styling must be consumed before node/edge parsing.
        // Previously these lines fell through to `parseNodeRef`, producing
        // visible boxes containing the raw `style A fill:...` source.
        const styleMatch = line.match(/^style\s+([\w,-]+)\s+(.+)$/i);
        if (styleMatch) {
            const props = parseStyleProps(styleMatch[2].replace(/;$/, ''));
            styleMatch[1].split(',').map(id => id.trim()).filter(Boolean)
                .forEach(id => nodeStyles.set(id, props));
            continue;
        }

        // Presentation-only directives do not represent diagram nodes.
        if (/^(linkStyle|click)\b/i.test(line)) continue;

        // class assignment: class sq,e green
        const classMatch = line.match(/^class\s+(.+?)\s+(\w+)$/i);
        if (classMatch) {
            const nodeIds = classMatch[1].split(',').map(s => s.trim());
            classAssigns.push({ nodeIds, className: classMatch[2] });
            continue;
        }

        // Subgraph start: subgraph ID ["Label"]
        const sgMatch = line.match(/^subgraph\s+(\w+)(?:\s*\[?"?(.+?)"?\]?)?$/i);
        if (sgMatch) {
            currentSubgraph = {
                id: sgMatch[1],
                label: sgMatch[2] || sgMatch[1],
                nodeIds: [],
            };
            continue;
        }

        // Subgraph end
        if (line.toLowerCase() === 'end' && currentSubgraph) {
            subgraphs.push(currentSubgraph);
            currentSubgraph = null;
            continue;
        }

        // Helper to add edge nodes to current subgraph
        function addToSubgraph(fromId, toId) {
            if (currentSubgraph) {
                if (fromId && !currentSubgraph.nodeIds.includes(fromId)) currentSubgraph.nodeIds.push(fromId);
                if (toId && !currentSubgraph.nodeIds.includes(toId)) currentSubgraph.nodeIds.push(toId);
            }
        }

        // Labeled edge: A -- text --> B
        let match = line.match(/^(.+?)\s*--\s*(.+?)\s*-->\s*(.+)$/);
        if (match) {
            const fromId = parseNodeRef(match[1].trim());
            const toId = parseNodeRef(match[3].trim());
            if (fromId && toId) edges.push({ from: fromId, to: toId, label: cleanLabel(match[2].trim()), directed: true, style: 'normal' });
            addToSubgraph(fromId, toId);
            continue;
        }

        // Dotted arrow: A -.-> B (with optional |label|)
        match = line.match(/^(.+?)\s*-\.->?\s*(?:\|([^|]*)\|)?\s*(.+)$/);
        if (match) {
            const fromId = parseNodeRef(match[1].trim());
            const toId = parseNodeRef(match[3].trim());
            const edgeLabel = match[2] ? cleanLabel(match[2].trim()) : undefined;
            if (fromId && toId) edges.push({ from: fromId, to: toId, label: edgeLabel, directed: true, style: 'dotted' });
            addToSubgraph(fromId, toId);
            continue;
        }

        // Thick arrow: A ==> B (with optional |label|)
        match = line.match(/^(.+?)\s*==>\s*(?:\|([^|]*)\|)?\s*(.+)$/);
        if (match) {
            const fromId = parseNodeRef(match[1].trim());
            const toId = parseNodeRef(match[3].trim());
            const edgeLabel = match[2] ? cleanLabel(match[2].trim()) : undefined;
            if (fromId && toId) edges.push({ from: fromId, to: toId, label: edgeLabel, directed: true, style: 'thick' });
            addToSubgraph(fromId, toId);
            continue;
        }

        // Undirected line: A --- B
        match = line.match(/^(.+?)\s*(-{3,})\s*(?:\|([^|]*)\|)?\s*(.+)$/);
        if (match && !match[2].includes('>')) {
            const fromId = parseNodeRef(match[1].trim());
            const toId = parseNodeRef(match[4].trim());
            const edgeLabel = match[3] ? cleanLabel(match[3].trim()) : undefined;
            if (fromId && toId) edges.push({ from: fromId, to: toId, label: edgeLabel, directed: false, style: 'normal' });
            addToSubgraph(fromId, toId);
            continue;
        }

        // Directed edge: A --> B (with optional |label|)
        match = line.match(/^(.+?)\s*(-{1,2}>|-->)\s*(?:\|([^|]*)\|)?\s*(.+)$/);
        if (match) {
            const fromId = parseNodeRef(match[1].trim());
            const toId = parseNodeRef(match[4].trim());
            const edgeLabel = match[3] ? cleanLabel(match[3].trim()) : undefined;
            if (fromId && toId) edges.push({ from: fromId, to: toId, label: edgeLabel, directed: true, style: 'normal' });
            addToSubgraph(fromId, toId);
            continue;
        }

        // Plain node reference
        const nodeId = parseNodeRef(line);
        if (nodeId && currentSubgraph) {
            if (!currentSubgraph.nodeIds.includes(nodeId)) currentSubgraph.nodeIds.push(nodeId);
        }
    }

    if (nodesMap.size === 0) return null;

    // Apply classDef styles to nodes
    for (const assign of classAssigns) {
        const style = classDefs.get(assign.className);
        if (!style) continue;
        for (const nid of assign.nodeIds) {
            const node = nodesMap.get(nid);
            if (node) {
                if (style.fill) node.fill = style.fill;
                if (style.stroke) node.stroke = style.stroke;
                if (style.strokeWidth) node.strokeWidth = style.strokeWidth;
            }
        }
    }


    for (const [nid, style] of nodeStyles) {
        const node = nodesMap.get(nid);
        if (node) Object.assign(node, style);
    }

    // Topological BFS layering
    const nodeIds = Array.from(nodesMap.keys());
    const children = new Map();
    const parents = new Map();
    nodeIds.forEach(id => { children.set(id, []); parents.set(id, []); });
    edges.forEach(e => {
        if (children.has(e.from)) children.get(e.from).push(e.to);
        if (parents.has(e.to)) parents.get(e.to).push(e.from);
    });

    const layers = new Map();
    const roots = nodeIds.filter(id => parents.get(id).length === 0);
    if (roots.length === 0) roots.push(nodeIds[0]);

    const queue = roots.map(id => ({ id, layer: 0 }));
    const visited = new Set();
    while (queue.length > 0) {
        const { id, layer } = queue.shift();
        if (visited.has(id)) { if (layer > (layers.get(id) || 0)) layers.set(id, layer); continue; }
        visited.add(id);
        layers.set(id, Math.max(layer, layers.get(id) || 0));
        for (const child of children.get(id) || []) queue.push({ id: child, layer: layer + 1 });
    }
    nodeIds.forEach(id => { if (!visited.has(id)) layers.set(id, 0); });

    const layerGroups = new Map();
    layers.forEach((layer, id) => {
        if (!layerGroups.has(layer)) layerGroups.set(layer, []);
        layerGroups.get(layer).push(id);
    });

    // Compute dynamic node sizes based on label length
    const nodes = [];
    let paletteIndex = 0;
    Array.from(layerGroups.keys()).sort((a, b) => a - b).forEach((layerIdx, li) => {
        const group = layerGroups.get(layerIdx);
        const startOffset = -(group.length * H_SPACING) / 2 + H_SPACING / 2;
        group.forEach((id, gi) => {
            const nd = nodesMap.get(id);
            const x = isHorizontal ? li * H_SPACING : startOffset + gi * H_SPACING;
            const y = isHorizontal ? startOffset + gi * V_SPACING : li * V_SPACING;
            // Compute node size based on label lines
            const labelLines = (nd.label || '').split('\n');
            const maxLineLen = Math.max(...labelLines.map(l => l.length));
            const nw = Math.max(NODE_W, maxLineLen * 10 + 40);
            const nh = Math.max(NODE_H, labelLines.length * 20 + 20);
            nodes.push({
                id: nd.id, type: nd.type, label: nd.label,
                x, y, width: nw, height: nh,
                fill: nd.fill || palette[paletteIndex % palette.length].fill,
                stroke: nd.stroke || palette[paletteIndex % palette.length].stroke,
                strokeWidth: nd.strokeWidth,
                labelColor: nd.labelColor,
            });
            paletteIndex += 1;
        });
    });

    return {
        title: 'Mermaid Diagram',
        direction,
        nodes,
        edges: edges.map(e => ({
            from: e.from, to: e.to, label: e.label,
            directed: e.directed !== false,
            style: e.style || 'normal',
        })),
        subgraphs: subgraphs.length > 0 ? subgraphs.map(sg => ({
            id: sg.id, label: sg.label, nodes: sg.nodeIds,
        })) : undefined,
    };
}

// ============================================================
// RENDER
// ============================================================

export function renderAIDiagram(diagram) {
    if (!diagram?.nodes?.length) { console.error('[AIRenderer] Invalid diagram'); return false; }

    const nodes = diagram.nodes;
    const edges = diagram.edges || [];
    const title = diagram.title || 'AI Diagram';

    if (!window.svg || !window.Frame || !window.Rectangle) {
        console.error('[AIRenderer] Engine not initialized');
        return false;
    }

    // Viewport center
    const vb = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const vcx = vb.x + vb.width / 2;
    const vcy = vb.y + vb.height / 2;

    // Diagram bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || NODE_W));
        maxY = Math.max(maxY, n.y + (n.height || NODE_H));
    });

    const dw = maxX - minX, dh = maxY - minY;
    const ox = vcx - dw / 2 - minX;
    const oy = vcy - dh / 2 - minY;

    // Phase 5 (issue #22): no outer wrapper frame. Each generated shape
    // (node, edge, subgraph container) gets the same `groupId` so the whole
    // diagram behaves as one selectable group via Selection.js's existing
    // group-expansion path. Drops the "solid background frame" symptom and
    // makes the rendered content as interactive as user-drawn shapes.
    const groupId = `aidiag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    // Kept under the same name `frame` to minimise the diff inside this
    // 600-line function — it's now a thin shim that catches `addShapeToFrame`
    // calls and re-routes them to a groupId assignment. `selectFrame` /
    // `removeSelection` no-op; selection is on the first node below.
    const frame = {
        addShapeToFrame(s) { if (s) s.groupId = groupId; },
        selectFrame() {},
        removeSelection() {},
        shapeName: 'frame',
    };

    const nodeMap = new Map();

    // --- NODES ---
    for (const node of nodes) {
        const nx = node.x + ox, ny = node.y + oy;
        const nw = node.width || NODE_W, nh = node.height || NODE_H;
        const cx = nx + nw / 2, cy = ny + nh / 2;
        let shape = null;

        // Build style options from AI-specified properties (with defaults)
        const nodeOpts = {
            stroke: node.stroke || '#e0e0e0',
            strokeWidth: node.strokeWidth ?? 1.5,
            fill: node.fill || 'transparent',
            fillStyle: node.fillStyle || 'none',
            roughness: node.roughness ?? 1,
            strokeDasharray: node.strokeDasharray || '',
            // Shading support
            shadeColor: node.shadeColor || null,
            shadeOpacity: node.shadeOpacity !== undefined ? node.shadeOpacity : 0.15,
            shadeDirection: node.shadeDirection || 'bottom',
            // Label styling
            labelColor: node.labelColor || undefined,
            labelFontSize: node.labelFontSize || undefined,
        };

        try {
            if (node.type === 'icon' && node.iconKeyword) {
                // Icon nodes are placed asynchronously — create a placeholder rectangle
                // and kick off icon fetch in the background
                shape = new window.Rectangle(nx, ny, nw, nh, {
                    ...nodeOpts, stroke: nodeOpts.stroke, strokeDasharray: '4 3',
                });
                // Async fetch & replace with actual icon
                fetchAndPlaceIcon(node.iconKeyword, nx, ny, nw, nh, shape, frame);
            } else if (node.type === 'circle' && window.Circle) {
                shape = new window.Circle(cx, cy, nw / 2, nh / 2, nodeOpts);
            } else if (node.type === 'diamond' && window.Rectangle) {
                const sz = Math.max(nw, nh) * 0.7;
                shape = new window.Rectangle(cx - sz / 2, cy - sz / 2, sz, sz, nodeOpts);
                shape.rotation = 45;
                shape.draw();
            } else if (node.type === 'roundrect' && window.Rectangle) {
                shape = new window.Rectangle(nx, ny, nw, nh, { ...nodeOpts, cornerRadius: Math.min(nw, nh) * 0.2 });
            } else if (window.Rectangle) {
                shape = new window.Rectangle(nx, ny, nw, nh, nodeOpts);
            }
        } catch (err) {
            console.warn('[AIRenderer] Node creation failed:', node.id, err);
            continue;
        }

        if (!shape) continue;

        // Apply rotation if specified (skip for diamonds — they already have rotation=45)
        if (node.rotation && shape.rotation !== undefined && node.type !== 'diamond') {
            shape.rotation = node.rotation;
        }

        window.shapes.push(shape);
        if (window.pushCreateAction) window.pushCreateAction(shape);
        if (frame.addShapeToFrame) frame.addShapeToFrame(shape);

        nodeMap.set(node.id, { shape, x: nx, y: ny, width: nw, height: nh, centerX: cx, centerY: cy });

        // Node label — use embedded label for rect/circle, separate TextShape for icons
        if (node.label) {
            let labelColor = node.labelColor || node.stroke || '#e0e0e0';
            if (isColorTooDark(labelColor)) {
                labelColor = '#e0e0e0';
            }
            const labelFontSize = node.labelFontSize || 14;

            if (node.type === 'icon') {
                // Icons: place label below the icon as a separate TextShape
                const labelY = cy + nh / 2 + 18;
                createLabel(node.label, cx, labelY, labelFontSize, labelColor, frame);
            } else if (shape && typeof shape.setLabel === 'function') {
                // Rectangles, circles, diamonds: use embedded label
                shape.setLabel(node.label, labelColor, labelFontSize);
            } else {
                // Fallback: separate TextShape
                createLabel(node.label, cx, cy, labelFontSize, labelColor, frame);
            }
        }
    }

    // --- EDGES ---
    // Pre-compute fan-out counts per source node so we can spread edges
    const fanOut = new Map();
    const fanIdx = new Map();
    edges.forEach(e => {
        fanOut.set(e.from, (fanOut.get(e.from) || 0) + 1);
        fanIdx.set(e, fanOut.get(e.from) - 1);
    });

    // Collect all node bounds for overlap checking
    const allNodeBounds = [];
    nodeMap.forEach(n => {
        allNodeBounds.push({ x: n.x, y: n.y, width: n.width, height: n.height });
    });

    for (const edge of edges) {
        const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to);
        if (!from || !to) continue;

        const count = fanOut.get(edge.from) || 1;
        const idx = fanIdx.get(edge);
        const isDirected = edge.directed !== false;

        // Determine edge routing style based on node alignment and context
        const edgeStyle = chooseEdgeStyle(from, to, count, idx, allNodeBounds, nodeMap, edges);

        // Spread connection ports along the exit edge when fan-out > 1
        const sp = getSpreadEdgePoint(from, to, count, idx);
        const ep = getEdgePoint(to, from);

        // Nudge slightly away from node boundaries
        const adx = ep.x - sp.x, ady = ep.y - sp.y;
        const alen = Math.sqrt(adx * adx + ady * ady) || 1;
        const nudge = 6;
        const spN = { x: sp.x + (adx / alen) * nudge, y: sp.y + (ady / alen) * nudge };
        const epN = { x: ep.x - (adx / alen) * nudge, y: ep.y - (ady / alen) * nudge };

        let connector = null;

        // Edge style from AI (with defaults)
        const edgeStroke = edge.stroke || '#e0e0e0';
        const edgeStrokeWidth = edge.strokeWidth ?? 1.5;
        const edgeLineStyle = edge.lineStyle || 'solid';

        // Map lineStyle to arrowOutlineStyle / strokeDasharray
        const dashMap = { solid: '', dashed: '5 3', dotted: '2 2' };
        const dashValue = dashMap[edgeLineStyle] || '';

        if (isDirected && window.Arrow) {
            // Use Arrow for directed edges
            try {
                const opts = {
                    stroke: edgeStroke, strokeWidth: edgeStrokeWidth, roughness: 1,
                    arrowOutlineStyle: edgeLineStyle,
                    arrowHeadStyle: edge.arrowHeadStyle || 'default',
                };

                if (edgeStyle.type === 'curved') {
                    opts.arrowCurved = 'curved';
                    opts.arrowCurveAmount = edgeStyle.curveAmount;
                } else if (edgeStyle.type === 'elbow') {
                    opts.arrowCurved = 'elbow';
                }
                // 'straight' — no arrowCurved needed (default)

                connector = new window.Arrow(spN, epN, opts);
                window.shapes.push(connector);
                if (window.pushCreateAction) window.pushCreateAction(connector);
                if (frame.addShapeToFrame) frame.addShapeToFrame(connector);

                // Auto-attach arrow to source and target shapes
                autoAttach(connector, from.shape, true, sp);
                autoAttach(connector, to.shape, false, ep);
            } catch (err) {
                console.warn('[AIRenderer] Arrow creation failed:', edge, err);
            }
        } else if (!isDirected && window.Line) {
            // Use Line for undirected edges
            try {
                const opts = {
                    stroke: edgeStroke, strokeWidth: edgeStrokeWidth, roughness: 1,
                    strokeDasharray: dashValue,
                };

                connector = new window.Line(spN, epN, opts);

                if (edgeStyle.type === 'curved') {
                    connector.isCurved = true;
                    if (typeof connector.initializeCurveControlPoint === 'function') {
                        connector.initializeCurveControlPoint();
                    }
                    // Re-draw with curve since constructor drew it straight
                    if (typeof connector.draw === 'function') connector.draw();
                }

                window.shapes.push(connector);
                if (window.pushCreateAction) window.pushCreateAction(connector);
                if (frame.addShapeToFrame) frame.addShapeToFrame(connector);
            } catch (err) {
                console.warn('[AIRenderer] Line creation failed:', edge, err);
            }
        } else if (window.Arrow) {
            // Fallback: use Arrow if Line not available
            try {
                connector = new window.Arrow(spN, epN, {
                    stroke: edgeStroke, strokeWidth: edgeStrokeWidth, roughness: 1,
                });
                window.shapes.push(connector);
                if (window.pushCreateAction) window.pushCreateAction(connector);
                if (frame.addShapeToFrame) frame.addShapeToFrame(connector);
            } catch (err) {
                console.warn('[AIRenderer] Fallback arrow creation failed:', edge, err);
            }
        }

        // Edge label — use embedded label on connector if available
        if (edge.label && connector) {
            const edgeLabelColor = edgeStroke === '#e0e0e0' ? '#a0a0b0' : edgeStroke;
            if (typeof connector.setLabel === 'function') {
                connector.setLabel(edge.label, edgeLabelColor, 11);
            } else {
                // Fallback: separate TextShape
                const mx = (spN.x + epN.x) / 2;
                const my = (spN.y + epN.y) / 2 - 18;
                createLabel(edge.label, mx, my, 11, edgeLabelColor, frame);
            }
        }
    }

    // --- SUBGRAPHS ---
    const subgraphs = diagram.subgraphs || [];
    for (const sg of subgraphs) {
        if (!sg.nodes || sg.nodes.length === 0) continue;

        // Compute bounds of all nodes in this subgraph
        let sgMinX = Infinity, sgMinY = Infinity, sgMaxX = -Infinity, sgMaxY = -Infinity;
        let hasNodes = false;
        for (const nid of sg.nodes) {
            const n = nodeMap.get(nid);
            if (!n) continue;
            hasNodes = true;
            sgMinX = Math.min(sgMinX, n.x);
            sgMinY = Math.min(sgMinY, n.y);
            sgMaxX = Math.max(sgMaxX, n.x + n.width);
            sgMaxY = Math.max(sgMaxY, n.y + n.height);
        }
        if (!hasNodes) continue;

        const sgPad = 30;
        try {
            const subFrame = new window.Frame(
                sgMinX - sgPad, sgMinY - sgPad - 20,
                (sgMaxX - sgMinX) + sgPad * 2, (sgMaxY - sgMinY) + sgPad * 2 + 20,
                {
                    stroke: sg.stroke || '#555',
                    strokeWidth: 1,
                    fill: 'transparent',
                    opacity: 0.6,
                    frameName: sg.label || sg.id,
                }
            );
            window.shapes.push(subFrame);
            if (window.pushCreateAction) window.pushCreateAction(subFrame);
            if (frame.addShapeToFrame) frame.addShapeToFrame(subFrame);

            // Add nodes to the sub-frame
            for (const nid of sg.nodes) {
                const n = nodeMap.get(nid);
                if (n && n.shape && subFrame.addShapeToFrame) {
                    subFrame.addShapeToFrame(n.shape);
                }
            }
        } catch (err) {
            console.warn('[AIRenderer] Subgraph frame failed:', sg.id, err);
        }
    }

    // Phase 5: select the first generated node — group expansion in
    // Selection.js will pick up the rest via the shared groupId.
    const first = nodeMap.values().next().value;
    if (first && first.shape) {
        window.currentShape = first.shape;
        if (typeof first.shape.selectShape === 'function') first.shape.selectShape();
    }

    console.log(`[AIRenderer] Done: ${nodes.length} nodes, ${edges.length} edges, ${subgraphs.length} subgraphs → "${title}" (groupId=${groupId})`);
    return true;
}

// ============================================================
// SMART EDGE ROUTING
// ============================================================

/**
 * Choose the best edge style based on node positions and context.
 * Returns { type: 'straight'|'curved'|'elbow', curveAmount?: number }
 */
function chooseEdgeStyle(from, to, fanCount, fanIdx, allNodeBounds, nodeMap, edges) {
    const dx = Math.abs(from.centerX - to.centerX);
    const dy = Math.abs(from.centerY - to.centerY);

    // Multiple edges from same source — must curve to avoid overlap
    if (fanCount > 1) {
        const curveAmount = 40 + (fanIdx - (fanCount - 1) / 2) * 35;
        return { type: 'curved', curveAmount };
    }

    // Check if nodes are aligned (horizontally or vertically)
    const isHAligned = dx < ALIGN_THRESHOLD;
    const isVAligned = dy < ALIGN_THRESHOLD;

    // If aligned on either axis, use straight line
    if (isHAligned || isVAligned) {
        // But check if a straight line would cross through any other node
        const sp = getEdgePoint(from, to);
        const ep = getEdgePoint(to, from);
        const blocked = wouldCrossNode(sp, ep, from, to, allNodeBounds);

        if (blocked) {
            // Use curved to route around
            return { type: 'curved', curveAmount: 40 };
        }
        return { type: 'straight' };
    }

    // Diagonal connection — check if elbow or curve is better
    // Elbow works well when nodes are in a grid-like arrangement
    const isGridLike = (dx > ALIGN_THRESHOLD * 2) && (dy > ALIGN_THRESHOLD * 2);

    if (isGridLike) {
        // Check if elbow would cross another node
        // Elbow goes horizontal then vertical (or vice versa)
        const elbowMidX = to.centerX;
        const elbowMidY = from.centerY;
        const elbowMid = { x: elbowMidX, y: elbowMidY };

        const seg1Blocked = wouldCrossNode(
            { x: from.centerX, y: from.centerY }, elbowMid, from, to, allNodeBounds
        );
        const seg2Blocked = wouldCrossNode(
            elbowMid, { x: to.centerX, y: to.centerY }, from, to, allNodeBounds
        );

        if (!seg1Blocked && !seg2Blocked) {
            return { type: 'elbow' };
        }
    }

    // Default: gentle curve for diagonal connections
    return { type: 'curved', curveAmount: 25 };
}

/**
 * Check if a straight line between two points would cross through any node
 * (excluding the source and target nodes themselves).
 */
function wouldCrossNode(p1, p2, fromNode, toNode, allNodeBounds) {
    const margin = 10;
    for (const bounds of allNodeBounds) {
        // Skip source and target nodes
        if (bounds.x === fromNode.x && bounds.y === fromNode.y) continue;
        if (bounds.x === toNode.x && bounds.y === toNode.y) continue;

        // Inflate node bounds slightly for margin
        const bx = bounds.x - margin;
        const by = bounds.y - margin;
        const bw = bounds.width + margin * 2;
        const bh = bounds.height + margin * 2;

        if (lineIntersectsRect(p1.x, p1.y, p2.x, p2.y, bx, by, bw, bh)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a line segment intersects a rectangle.
 */
function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    // Check if line segment intersects any of the 4 edges of the rect
    const left = rx, right = rx + rw, top = ry, bottom = ry + rh;

    // Quick bounding box rejection
    if (Math.max(x1, x2) < left || Math.min(x1, x2) > right) return false;
    if (Math.max(y1, y2) < top || Math.min(y1, y2) > bottom) return false;

    // Check if either endpoint is inside the rect
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;
    if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true;

    // Check line intersection with each edge
    return (
        segmentsIntersect(x1, y1, x2, y2, left, top, right, top) ||
        segmentsIntersect(x1, y1, x2, y2, right, top, right, bottom) ||
        segmentsIntersect(x1, y1, x2, y2, left, bottom, right, bottom) ||
        segmentsIntersect(x1, y1, x2, y2, left, top, left, bottom)
    );
}

function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const d1 = cross(bx1, by1, bx2, by2, ax1, ay1);
    const d2 = cross(bx1, by1, bx2, by2, ax2, ay2);
    const d3 = cross(ax1, ay1, ax2, ay2, bx1, by1);
    const d4 = cross(ax1, ay1, ax2, ay2, bx2, by2);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    return false;
}

function cross(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// ============================================================
// AUTO-ATTACHMENT
// ============================================================

/**
 * Automatically attach an arrow endpoint to a shape.
 * This makes edges follow nodes when they're moved.
 */
export function autoAttach(arrow, shape, isStart, contactPoint) {
    if (!arrow || !shape) return;
    if (typeof arrow.attachToShape !== 'function') return;

    try {
        // Determine attachment side based on contact point relative to shape
        let side, offset;

        if (shape.shapeName === 'rectangle' || shape.shapeName === 'frame') {
            const sx = shape.x, sy = shape.y, sw = shape.width, sh = shape.height;
            const cx = sx + sw / 2, cy = sy + sh / 2;

            // Determine which edge the contact point is closest to
            const distTop = Math.abs(contactPoint.y - sy);
            const distBottom = Math.abs(contactPoint.y - (sy + sh));
            const distLeft = Math.abs(contactPoint.x - sx);
            const distRight = Math.abs(contactPoint.x - (sx + sw));
            const minDist = Math.min(distTop, distBottom, distLeft, distRight);

            if (minDist === distTop) {
                side = 'top';
                offset = { x: contactPoint.x - sx, y: 0, side: 'top' };
            } else if (minDist === distBottom) {
                side = 'bottom';
                offset = { x: contactPoint.x - sx, y: sh, side: 'bottom' };
            } else if (minDist === distLeft) {
                side = 'left';
                offset = { x: 0, y: contactPoint.y - sy, side: 'left' };
            } else {
                side = 'right';
                offset = { x: sw, y: contactPoint.y - sy, side: 'right' };
            }

            const attachment = { side, point: contactPoint, offset };
            arrow.attachToShape(isStart, shape, attachment);
        } else if (shape.shapeName === 'circle') {
            const angle = Math.atan2(
                contactPoint.y - shape.y,
                contactPoint.x - shape.x
            );
            const attachment = {
                side: 'perimeter',
                point: contactPoint,
                offset: { angle, side: 'perimeter' },
            };
            arrow.attachToShape(isStart, shape, attachment);
        }
    } catch (err) {
        // Attachment is optional — don't fail the render
        console.warn('[AIRenderer] Auto-attach failed:', err);
    }
}

// ============================================================
// ICON FETCHING
// ============================================================

/**
 * Fetch an icon by keyword from the icon API and replace the placeholder shape.
 * Runs asynchronously so it doesn't block diagram rendering.
 */
async function fetchAndPlaceIcon(keyword, x, y, w, h, placeholderShape, frame) {
    try {
        const res = await fetch(`/api/icons/search?q=${encodeURIComponent(keyword)}&inline=1`);
        if (!res.ok) return;
        const data = await res.json();
        const results = data.results;
        if (!results || results.length === 0 || !results[0].svg) return;

        const svgContent = results[0].svg;

        // Use the engine's icon placement bridge if available
        if (window.svg && window.IconShape) {
            const svg = window.svg;

            // Parse SVG to extract paths
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgContent, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (!svgEl) return;

            const vbWidth = parseFloat(svgEl.getAttribute('width') || svgEl.viewBox?.baseVal?.width || 24);
            const vbHeight = parseFloat(svgEl.getAttribute('height') || svgEl.viewBox?.baseVal?.height || 24);
            const scale = Math.min(w / vbWidth, h / vbHeight);

            // Create icon group
            const g = document.createElementNS(NS, 'g');
            g.setAttribute('type', 'icon');
            g.setAttribute('x', x);
            g.setAttribute('y', y);
            g.setAttribute('width', w);
            g.setAttribute('height', h);
            g.setAttribute('data-shape-x', x);
            g.setAttribute('data-shape-y', y);
            g.setAttribute('data-shape-width', w);
            g.setAttribute('data-shape-height', h);
            g.setAttribute('data-shape-rotation', '0');
            g.setAttribute('data-viewbox-width', vbWidth);
            g.setAttribute('data-viewbox-height', vbHeight);
            g.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`);

            // Copy SVG content into group, apply white fill
            const children = svgEl.querySelectorAll('path, circle, rect, polygon, polyline, line, ellipse');
            children.forEach(child => {
                const clone = child.cloneNode(true);
                // Make visible on dark canvas
                if (!clone.getAttribute('fill') || clone.getAttribute('fill') === 'none' || clone.getAttribute('fill') === 'black' || clone.getAttribute('fill') === '#000' || clone.getAttribute('fill') === '#000000') {
                    clone.setAttribute('fill', '#ffffff');
                }
                if (clone.getAttribute('stroke') === 'black' || clone.getAttribute('stroke') === '#000' || clone.getAttribute('stroke') === '#000000') {
                    clone.setAttribute('stroke', '#ffffff');
                }
                g.appendChild(clone);
            });

            // Add hit detection rect
            const hitRect = document.createElementNS(NS, 'rect');
            hitRect.setAttribute('x', '0');
            hitRect.setAttribute('y', '0');
            hitRect.setAttribute('width', vbWidth);
            hitRect.setAttribute('height', vbHeight);
            hitRect.setAttribute('fill', 'transparent');
            hitRect.setAttribute('stroke', 'none');
            g.insertBefore(hitRect, g.firstChild);

            svg.appendChild(g);

            // Wrap as IconShape
            const iconShape = new window.IconShape(g);
            window.shapes.push(iconShape);
            if (window.pushCreateAction) window.pushCreateAction(iconShape);
            if (frame?.addShapeToFrame) frame.addShapeToFrame(iconShape);

            // Remove placeholder
            if (placeholderShape) {
                const idx = window.shapes.indexOf(placeholderShape);
                if (idx !== -1) window.shapes.splice(idx, 1);
                if (placeholderShape.group && placeholderShape.group.parentNode) {
                    placeholderShape.group.parentNode.removeChild(placeholderShape.group);
                }
            }
        }
    } catch (err) {
        console.warn('[AIRenderer] Icon fetch failed for keyword:', keyword, err);
        // Placeholder rectangle remains visible as fallback
    }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Create an interactive TextShape label at (x, y) and add it to the frame.
 * Sets data-type="text-group" so the text tool recognizes it for
 * click-to-select and double-click-to-edit.
 */
function createLabel(text, x, y, fontSize, fill, frame) {
    const svg = window.svg;
    if (!svg || !window.TextShape) return null;

    try {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('data-type', 'text-group');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        g.setAttribute('data-x', x);
        g.setAttribute('data-y', y);

        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', 0);
        t.setAttribute('y', 0);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('fill', fill);
        t.setAttribute('font-size', fontSize);
        t.setAttribute('font-family', 'lixFont, sans-serif');
        t.setAttribute('data-initial-font', 'lixFont');
        t.setAttribute('data-initial-color', fill);
        t.setAttribute('data-initial-size', fontSize + 'px');
        t.textContent = text;

        g.appendChild(t);
        svg.appendChild(g);

        const shape = new window.TextShape(g);
        window.shapes.push(shape);
        if (window.pushCreateAction) window.pushCreateAction(shape);
        if (frame?.addShapeToFrame) frame.addShapeToFrame(shape);
        return shape;
    } catch (err) {
        console.warn('[AIRenderer] Label creation failed:', err);
        return null;
    }
}

/**
 * Like getEdgePoint but spreads multiple connections along the exit edge.
 * count = total edges leaving this side, idx = 0-based index of this edge.
 */
function getSpreadEdgePoint(node, targetNode, count, idx) {
    if (count <= 1) return getEdgePoint(node, targetNode);

    const dx = targetNode.centerX - node.centerX;
    const dy = targetNode.centerY - node.centerY;
    const hw = node.width / 2;
    const hh = node.height / 2;

    // Spread ratio: distribute along 60% of the edge length
    const spread = 0.6;
    const t = count === 1 ? 0.5 : idx / (count - 1);
    const offset = (t - 0.5) * spread;

    if (Math.abs(dx) < 0.001 || Math.abs(dy) * hw > Math.abs(dx) * hh) {
        const px = node.centerX + offset * node.width;
        const py = dy > 0 ? node.y + node.height : node.y;
        return { x: px, y: py };
    }
    const px = dx > 0 ? node.x + node.width : node.x;
    const py = node.centerY + offset * node.height;
    return { x: px, y: py };
}

/**
 * Get the connection point on a node's boundary toward another node.
 * Uses the angle between centers to pick the closest edge (top/bottom/left/right).
 */
function getEdgePoint(node, targetNode) {
    const dx = targetNode.centerX - node.centerX;
    const dy = targetNode.centerY - node.centerY;
    const hw = node.width / 2;
    const hh = node.height / 2;

    if (Math.abs(dx) < 0.001 || Math.abs(dy) * hw > Math.abs(dx) * hh) {
        if (dy > 0) return { x: node.centerX, y: node.y + node.height };
        return { x: node.centerX, y: node.y };
    }
    if (dx > 0) return { x: node.x + node.width, y: node.centerY };
    return { x: node.x, y: node.centerY };
}

// ============================================================
// PREVIEW (for AI Modal)
// ============================================================

/**
 * Generate a simple SVG preview string from a diagram JSON.
 * Used inside the AI modal before placing on canvas.
 */
export function generatePreviewSVG(diagram, width = 500, height = 350) {
    if (!diagram?.nodes?.length) return '';

    const nodes = diagram.nodes;
    const edges = diagram.edges || [];

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || NODE_W));
        maxY = Math.max(maxY, n.y + (n.height || NODE_H));
    });

    const dw = maxX - minX || 1;
    const dh = maxY - minY || 1;
    const pad = 40;
    const scale = Math.min((width - pad * 2) / dw, (height - pad * 2) / dh, 1.5);
    const offX = (width - dw * scale) / 2 - minX * scale;
    const offY = (height - dh * scale) / 2 - minY * scale;

    // Build node lookup for edge rendering
    const nodeById = new Map();
    nodes.forEach(n => {
        const nx = n.x * scale + offX;
        const ny = n.y * scale + offY;
        const nw = (n.width || NODE_W) * scale;
        const nh = (n.height || NODE_H) * scale;
        nodeById.set(n.id, { x: nx, y: ny, w: nw, h: nh, cx: nx + nw / 2, cy: ny + nh / 2 });
    });

    let svgContent = '';

    // Draw edges
    edges.forEach(e => {
        const f = nodeById.get(e.from);
        const t = nodeById.get(e.to);
        if (!f || !t) return;

        const directed = e.directed !== false;
        const eColor = e.stroke || '#666';
        const markerId = directed ? `url(#preview-arrow-${eColor.replace('#', '')})` : '';

        // Add a per-color marker if needed
        if (directed && !svgContent.includes(`id="preview-arrow-${eColor.replace('#', '')}"`)) {
            svgContent = `<marker id="preview-arrow-${eColor.replace('#', '')}" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="none" stroke="${eColor}" stroke-width="1" /></marker>` + svgContent;
        }

        const eDash = e.lineStyle === 'dashed' ? ' stroke-dasharray="5 3"' : e.lineStyle === 'dotted' ? ' stroke-dasharray="2 2"' : '';

        // Render curved path if nodes aren't aligned (creates a natural curve)
        const dx = t.cx - f.cx;
        const dy = t.cy - f.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let mx = (f.cx + t.cx) / 2;
        let my = (f.cy + t.cy) / 2;

        if (dist > 0 && Math.abs(dy) > 10 && Math.abs(dx) > 10) {
            // Curved edge: perpendicular offset for a quadratic Bezier
            const perpX = -dy / dist;
            const perpY = dx / dist;
            const curveAmt = dist * 0.15;
            const cpx = mx + perpX * curveAmt;
            const cpy = my + perpY * curveAmt;
            // Quadratic bezier midpoint for label
            mx = 0.25 * f.cx + 0.5 * cpx + 0.25 * t.cx;
            my = 0.25 * f.cy + 0.5 * cpy + 0.25 * t.cy;
            svgContent += `<path d="M ${f.cx} ${f.cy} Q ${cpx} ${cpy} ${t.cx} ${t.cy}" fill="none" stroke="${eColor}" stroke-width="1.5"${eDash} marker-end="${markerId}" />`;
        } else {
            svgContent += `<line x1="${f.cx}" y1="${f.cy}" x2="${t.cx}" y2="${t.cy}" stroke="${eColor}" stroke-width="1.5"${eDash} marker-end="${markerId}" />`;
        }

        if (e.label) {
            svgContent += `<text x="${mx}" y="${my - 8}" text-anchor="middle" fill="${eColor === '#666' ? '#888' : eColor}" font-size="9" font-family="lixFont, sans-serif">${escapeXml(e.label)}</text>`;
        }
    });

    // Draw nodes
    nodes.forEach(n => {
        const d = nodeById.get(n.id);
        if (!d) return;

        const nStroke = n.stroke || '#9090c0';
        const nFill = n.fill || 'transparent';
        const nDash = n.strokeDasharray ? ` stroke-dasharray="${n.strokeDasharray}"` : '';

        if (n.type === 'circle') {
            svgContent += `<ellipse cx="${d.cx}" cy="${d.cy}" rx="${d.w / 2}" ry="${d.h / 2}" fill="${nFill}" stroke="${nStroke}" stroke-width="1.5"${nDash} />`;
        } else if (n.type === 'diamond') {
            const sz = Math.min(d.w, d.h) * 0.7;
            svgContent += `<rect x="${d.cx - sz / 2}" y="${d.cy - sz / 2}" width="${sz}" height="${sz}" fill="${nFill}" stroke="${nStroke}" stroke-width="1.5"${nDash} transform="rotate(45, ${d.cx}, ${d.cy})" />`;
        } else if (n.type === 'roundrect') {
            svgContent += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${Math.min(d.w, d.h) * 0.2}" fill="${nFill}" stroke="${nStroke}" stroke-width="1.5"${nDash} />`;
        } else {
            svgContent += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="4" fill="${nFill}" stroke="${nStroke}" stroke-width="1.5"${nDash} />`;
        }

        // Label — ensure readable color
        if (n.label) {
            const fontSize = Math.max(8, Math.min(12, 11 * scale));
            let labelFill = nStroke === '#9090c0' ? '#d0d0d0' : nStroke;
            if (isColorTooDark(labelFill)) labelFill = '#d0d0d0';
            // Icon nodes: label below the icon
            const labelY = n.type === 'icon' ? d.cy + d.h / 2 + 12 * scale : d.cy;
            svgContent += `<text x="${d.cx}" y="${labelY}" text-anchor="middle" dominant-baseline="central" fill="${labelFill}" font-size="${fontSize}" font-family="lixFont, sans-serif">${escapeXml(n.label)}</text>`;
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${svgContent.match(/<marker[^]*?<\/marker>/g)?.join('') || ''}</defs>
  ${svgContent.replace(/<marker[^]*?<\/marker>/g, '')}
</svg>`;
}

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Check if a hex color is too dark to read on a dark canvas (#1a1a2e).
 * Returns true if perceived luminance is below threshold.
 */
function isColorTooDark(hex) {
    if (!hex || hex === 'transparent' || hex === 'none') return false;
    const c = hex.replace('#', '');
    if (c.length < 6) return false;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    // Relative luminance (perceived brightness)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);
    return lum < 80; // Below ~31% brightness — unreadable on dark bg
}

/**
 * Generate a preview SVG from an existing Frame's DOM contents.
 * Used when the user opens the AI edit dialog for a frame —
 * shows the current state of the frame as an SVG preview.
 */
export function generateFramePreviewSVG(frame, width = 500, height = 350) {
    if (!frame || !frame.clipGroup) return '';

    const fx = frame.x, fy = frame.y, fw = frame.width, fh = frame.height;
    if (fw <= 0 || fh <= 0) return '';

    const pad = 30;
    const scale = Math.min((width - pad * 2) / fw, (height - pad * 2) / fh, 1.5);
    const offX = (width - fw * scale) / 2 - fx * scale;
    const offY = (height - fh * scale) / 2 - fy * scale;

    let svgContent = '';

    // Frame border
    svgContent += `<rect x="${fx * scale + offX}" y="${fy * scale + offY}" width="${fw * scale}" height="${fh * scale}" rx="6" fill="transparent" stroke="#555" stroke-width="1.5" stroke-dasharray="6 3" />`;

    // Frame label
    if (frame.frameName) {
        svgContent += `<text x="${fx * scale + offX + 10}" y="${fy * scale + offY + 16}" fill="#888" font-size="11" font-family="lixFont, sans-serif">${escapeXml(frame.frameName)}</text>`;
    }

    // Render contained shapes
    if (frame.containedShapes) {
        frame.containedShapes.forEach(shape => {
            if (!shape) return;

            if (shape.shapeName === 'rectangle') {
                const sx = shape.x * scale + offX;
                const sy = shape.y * scale + offY;
                const sw = shape.width * scale;
                const sh = shape.height * scale;
                const stroke = shape.options?.stroke || '#e0e0e0';
                const fill = shape.options?.fill || 'transparent';
                if (shape.rotation === 45) {
                    const sz = Math.min(sw, sh) * 0.7;
                    const rcx = sx + sw / 2, rcy = sy + sh / 2;
                    svgContent += `<rect x="${rcx - sz / 2}" y="${rcy - sz / 2}" width="${sz}" height="${sz}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" transform="rotate(45, ${rcx}, ${rcy})" />`;
                    // Embedded label for diamond
                    if (shape.label) {
                        let lf = shape.labelColor || stroke;
                        if (isColorTooDark(lf)) lf = '#d0d0d0';
                        const fs = Math.max(8, (shape.labelFontSize || 14) * scale);
                        svgContent += `<text x="${rcx}" y="${rcy}" text-anchor="middle" dominant-baseline="central" fill="${lf}" font-size="${fs}" font-family="lixFont, sans-serif">${escapeXml(shape.label)}</text>`;
                    }
                } else {
                    svgContent += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
                    // Embedded label
                    if (shape.label) {
                        let lf = shape.labelColor || stroke;
                        if (isColorTooDark(lf)) lf = '#d0d0d0';
                        const fs = Math.max(8, (shape.labelFontSize || 14) * scale);
                        svgContent += `<text x="${sx + sw / 2}" y="${sy + sh / 2}" text-anchor="middle" dominant-baseline="central" fill="${lf}" font-size="${fs}" font-family="lixFont, sans-serif">${escapeXml(shape.label)}</text>`;
                    }
                }
            } else if (shape.shapeName === 'circle') {
                const ccx = shape.x * scale + offX;
                const ccy = shape.y * scale + offY;
                const crx = (shape.rx || 30) * scale;
                const cry = (shape.ry || 30) * scale;
                const stroke = shape.options?.stroke || '#e0e0e0';
                const fill = shape.options?.fill || 'transparent';
                svgContent += `<ellipse cx="${ccx}" cy="${ccy}" rx="${crx}" ry="${cry}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
                // Embedded label
                if (shape.label) {
                    let lf = shape.labelColor || stroke;
                    if (isColorTooDark(lf)) lf = '#d0d0d0';
                    const fs = Math.max(8, (shape.labelFontSize || 14) * scale);
                    svgContent += `<text x="${ccx}" y="${ccy}" text-anchor="middle" dominant-baseline="central" fill="${lf}" font-size="${fs}" font-family="lixFont, sans-serif">${escapeXml(shape.label)}</text>`;
                }
            } else if (shape.shapeName === 'text') {
                const textEl = shape.group?.querySelector('text');
                if (textEl) {
                    const tx = parseFloat(shape.group.getAttribute('data-x') || '0');
                    const ty = parseFloat(shape.group.getAttribute('data-y') || '0');
                    const fill = textEl.getAttribute('fill') || '#e0e0e0';
                    const fontSize = Math.max(8, (parseFloat(textEl.getAttribute('font-size')) || 14) * scale);
                    const text = textEl.textContent || '';
                    let labelFill = fill;
                    if (isColorTooDark(labelFill)) labelFill = '#d0d0d0';
                    svgContent += `<text x="${tx * scale + offX}" y="${ty * scale + offY}" text-anchor="middle" dominant-baseline="central" fill="${labelFill}" font-size="${fontSize}" font-family="lixFont, sans-serif">${escapeXml(text)}</text>`;
                }
            } else if (shape.shapeName === 'arrow') {
                const sp = shape.startPoint, ep = shape.endPoint;
                if (sp && ep) {
                    const stroke = shape.options?.stroke || '#e0e0e0';
                    const sx1 = sp.x * scale + offX, sy1 = sp.y * scale + offY;
                    const sx2 = ep.x * scale + offX, sy2 = ep.y * scale + offY;
                    // Render curved if arrow has control points
                    if (shape.arrowCurved === 'curved' && shape.controlPoint1 && shape.controlPoint2) {
                        const cp1x = shape.controlPoint1.x * scale + offX;
                        const cp1y = shape.controlPoint1.y * scale + offY;
                        const cp2x = shape.controlPoint2.x * scale + offX;
                        const cp2y = shape.controlPoint2.y * scale + offY;
                        svgContent += `<path d="M ${sx1} ${sy1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${sx2} ${sy2}" fill="none" stroke="${stroke}" stroke-width="1.5" marker-end="url(#frame-preview-arrow)" />`;
                    } else {
                        svgContent += `<line x1="${sx1}" y1="${sy1}" x2="${sx2}" y2="${sy2}" stroke="${stroke}" stroke-width="1.5" marker-end="url(#frame-preview-arrow)" />`;
                    }
                    // Arrow label
                    if (shape.label) {
                        const amx = (sx1 + sx2) / 2, amy = (sy1 + sy2) / 2 - 8;
                        const afs = Math.max(7, (shape.labelFontSize || 11) * scale);
                        svgContent += `<text x="${amx}" y="${amy}" text-anchor="middle" fill="${shape.labelColor || stroke}" font-size="${afs}" font-family="lixFont, sans-serif">${escapeXml(shape.label)}</text>`;
                    }
                }
            } else if (shape.shapeName === 'line') {
                const sp = shape.startPoint, ep = shape.endPoint;
                if (sp && ep) {
                    const stroke = shape.options?.stroke || '#e0e0e0';
                    const sx1 = sp.x * scale + offX, sy1 = sp.y * scale + offY;
                    const sx2 = ep.x * scale + offX, sy2 = ep.y * scale + offY;
                    // Render curved if line has control point
                    if (shape.isCurved && shape.controlPoint) {
                        const cpx = shape.controlPoint.x * scale + offX;
                        const cpy = shape.controlPoint.y * scale + offY;
                        svgContent += `<path d="M ${sx1} ${sy1} Q ${cpx} ${cpy} ${sx2} ${sy2}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
                    } else {
                        svgContent += `<line x1="${sx1}" y1="${sy1}" x2="${sx2}" y2="${sy2}" stroke="${stroke}" stroke-width="1.5" />`;
                    }
                    // Line label
                    if (shape.label) {
                        const lmx = (sx1 + sx2) / 2, lmy = (sy1 + sy2) / 2 - 8;
                        const lfs = Math.max(7, (shape.labelFontSize || 11) * scale);
                        svgContent += `<text x="${lmx}" y="${lmy}" text-anchor="middle" fill="${shape.labelColor || stroke}" font-size="${lfs}" font-family="lixFont, sans-serif">${escapeXml(shape.label)}</text>`;
                    }
                }
            } else if (shape.shapeName === 'icon') {
                const ix = parseFloat(shape.group?.getAttribute('data-shape-x') || '0');
                const iy = parseFloat(shape.group?.getAttribute('data-shape-y') || '0');
                const iw = parseFloat(shape.group?.getAttribute('data-shape-width') || '40');
                const ih = parseFloat(shape.group?.getAttribute('data-shape-height') || '40');
                const pix = ix * scale + offX;
                const piy = iy * scale + offY;
                const piw = iw * scale;
                const pih = ih * scale;

                // Try to extract actual icon SVG paths from the shape's group
                const iconPaths = shape.group?.querySelectorAll('path, circle, rect, polygon, polyline, line, ellipse');
                if (iconPaths && iconPaths.length > 0) {
                    // Get viewbox dimensions for proper scaling
                    const vbW = parseFloat(shape.group?.getAttribute('data-viewbox-width') || iw);
                    const vbH = parseFloat(shape.group?.getAttribute('data-viewbox-height') || ih);
                    const iconScale = Math.min(piw / vbW, pih / vbH);
                    svgContent += `<g transform="translate(${pix}, ${piy}) scale(${iconScale})">`;
                    iconPaths.forEach(p => {
                        // Skip hit-detection rects (transparent fill, no stroke)
                        if (p.tagName === 'rect' && p.getAttribute('fill') === 'transparent' && p.getAttribute('stroke') === 'none') return;
                        const clone = p.cloneNode(true);
                        svgContent += clone.outerHTML;
                    });
                    svgContent += `</g>`;
                } else {
                    // Fallback: dashed bounding box with "icon" text
                    svgContent += `<rect x="${pix}" y="${piy}" width="${piw}" height="${pih}" rx="4" fill="transparent" stroke="#9090c0" stroke-width="1" stroke-dasharray="3 2" />`;
                    svgContent += `<text x="${pix + piw / 2}" y="${piy + pih / 2}" text-anchor="middle" dominant-baseline="central" fill="#9090c0" font-size="9" font-family="lixFont">icon</text>`;
                }
            } else if (shape.shapeName === 'frame') {
                // Sub-frame
                const sx = shape.x * scale + offX;
                const sy = shape.y * scale + offY;
                const sw = shape.width * scale;
                const sh = shape.height * scale;
                svgContent += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="4" fill="transparent" stroke="${shape.options?.stroke || '#555'}" stroke-width="1" stroke-dasharray="4 2" opacity="0.6" />`;
                if (shape.frameName) {
                    svgContent += `<text x="${sx + 6}" y="${sy + 12}" fill="#888" font-size="9" font-family="lixFont">${escapeXml(shape.frameName)}</text>`;
                }
            }
        });
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><marker id="frame-preview-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="none" stroke="#e0e0e0" stroke-width="1" /></marker></defs>
  ${svgContent}
</svg>`;
}

// ============================================================
// CANVAS BACKGROUND CONTRAST
// ============================================================

function colorRgb(value) {
    if (!value || typeof value !== 'string') return null;
    const rgbMatch = value.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    if (rgbMatch) {
        return {
            r: Math.min(255, Number(rgbMatch[1])),
            g: Math.min(255, Number(rgbMatch[2])),
            b: Math.min(255, Number(rgbMatch[3])),
        };
    }
    let hex = value.trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

function relativeLuminance(value) {
    const rgb = colorRgb(value);
    if (!rgb) return null;
    const channel = component => {
        const normalized = component / 255;
        return normalized <= .03928 ? normalized / 12.92 : Math.pow((normalized + .055) / 1.055, 2.4);
    };
    return .2126 * channel(rgb.r) + .7152 * channel(rgb.g) + .0722 * channel(rgb.b);
}

function contrastRatio(a, b) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    if (first == null || second == null) return 1;
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

function readableForeground(background) {
    return contrastRatio('#34304a', background) >= contrastRatio('#f6f2fb', background)
        ? '#34304a'
        : '#f6f2fb';
}

function readableColor(color, background, minimum = 3) {
    if (!colorRgb(color) || contrastRatio(color, background) >= minimum) return color;
    return readableForeground(background);
}

export function adaptCanvasContrast(background) {
    if (typeof window === 'undefined' || !Array.isArray(window.shapes)) return;
    const foreground = readableForeground(background);
    const muted = foreground === '#34304a' ? '#716a7d' : '#c8bddb';

    window.__canvasContrastColor = foreground;
    window.__ensureCanvasContrast = readableColor;

    for (const shape of window.shapes) {
        if (!shape) continue;
        if (typeof shape.adaptToBackground === 'function') {
            shape.adaptToBackground(background, foreground, muted);
            continue;
        }

        const owner = shape.parentFrame;
        const generated = !!(shape._diagramType || shape._frameType === 'graph' || owner?._diagramType || owner?._frameType === 'graph');
        const fill = shape.options?.fill;
        const solidFill = fill && fill !== 'transparent' && fill !== 'none';

        if (shape.options?.closedFill) {
            shape.options.outlineStroke = background;
            if (typeof shape.draw === 'function') shape.draw();
            continue;
        }

        if (shape.options?.stroke && (generated || ['#fff', '#ffffff', '#000', '#000000', '#1a1a2e'].includes(shape.options.stroke.toLowerCase()))) {
            shape.options.stroke = readableColor(shape.options.stroke, background, 3);
        }
        if (shape.shapeName === 'frame' && generated && shape.options) {
            shape.options.stroke = muted;
            shape.options.labelColor = foreground;
        }
        if ('labelColor' in shape && generated) {
            shape.labelColor = solidFill ? readableColor(shape.labelColor || foreground, fill, 4.5) : foreground;
        }
        if (shape.group && generated) {
            shape.group.querySelectorAll('text').forEach(text => {
                const current = text.getAttribute('fill') || foreground;
                text.setAttribute('fill', solidFill ? readableColor(current, fill, 4.5) : readableColor(current, background, 4.5));
            });
        }
        if (typeof shape.draw === 'function') shape.draw();
    }
}

// ============================================================
// INIT
// ============================================================

export function initAIRenderer() {
    // Expose the autoAttach helper so sibling renderers (Mermaid flowchart,
    // Graph, LixScript) can wire arrow endpoints into shapes without
    // import-cycling through this large module.
    window.__autoAttach = autoAttach;
    window.__adaptCanvasContrast = adaptCanvasContrast;

    // Lazy-load sequence renderer
    let _seqParser = null;
    let _seqPreview = null;
    let _seqCanvas = null;

    // Lazy-load flowchart renderer
    let _fcPreview = null;
    let _fcCanvas = null;

    // Lazy-load ER / chart renderer
    let _structured = null;

    async function loadSequenceRenderer() {
        if (_seqParser) return;
        const mod = await import('./MermaidSequenceParser.js');
        const rend = await import('./MermaidSequenceRenderer.js');
        _seqParser = mod.parseSequenceDiagram;
        _seqPreview = rend.renderSequencePreviewSVG;
        _seqCanvas = rend.renderSequenceOnCanvas;
    }

    async function loadFlowchartRenderer() {
        if (_fcPreview) return;
        const mod = await import('./MermaidFlowchartRenderer.js');
        _fcPreview = mod.renderFlowchartPreviewSVG;
        _fcCanvas = mod.renderFlowchartOnCanvas;
    }

    async function loadStructuredRenderer() {
        if (_structured) return;
        _structured = await import('./MermaidStructuredRenderer.js');
    }

    function mermaidHeader(src) {
        return src.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('%%'))?.toLowerCase() || '';
    }

    // Detect if source is a sequence diagram
    function isSequenceDiagram(src) {
        return mermaidHeader(src) === 'sequencediagram';
    }

    function structuredType(src) {
        const header = mermaidHeader(src);
        if (header === 'erdiagram') return 'er';
        if (/^pie(?:\s|$)/.test(header) || /^xychart(?:-beta)?(?:\s|$)/.test(header)) return 'chart';
        return null;
    }

    window.__aiRenderer = renderAIDiagram;
    window.__aiPreview = generatePreviewSVG;
    window.__aiFramePreview = generateFramePreviewSVG;

    // Unified mermaid parser: supports graph/flowchart + sequenceDiagram
    window.__mermaidParser = (src) => {
        if (isSequenceDiagram(src)) {
            try {
                if (_seqParser) return _seqParser(src);
                loadSequenceRenderer();
                return { _pendingSequence: true, src };
            } catch {
                return null;
            }
        }
        if (structuredType(src)) {
            if (!_structured) {
                loadStructuredRenderer();
                return { _pendingStructured: true, src };
            }
            return structuredType(src) === 'er'
                ? _structured.parseERDiagram(src)
                : _structured.parseChartDiagram(src);
        }
        return parseMermaid(src);
    };

    // Unified mermaid preview: returns SVG for both flowchart and sequence
    window.__mermaidPreview = async (src) => {
        if (isSequenceDiagram(src)) {
            await loadSequenceRenderer();
            const diagram = _seqParser(src);
            if (!diagram) return '';
            return _seqPreview(diagram);
        }
        const type = structuredType(src);
        if (type) {
            await loadStructuredRenderer();
            const diagram = type === 'er' ? _structured.parseERDiagram(src) : _structured.parseChartDiagram(src);
            if (!diagram) return '';
            return type === 'er' ? _structured.renderERPreviewSVG(diagram) : _structured.renderChartPreviewSVG(diagram);
        }
        // Flowchart: use unified flowchart renderer
        await loadFlowchartRenderer();
        const diagram = parseMermaid(src);
        if (!diagram) return '';
        return _fcPreview(diagram);
    };

    // Unified mermaid renderer: places on canvas
    window.__mermaidRenderer = async (src) => {
        if (isSequenceDiagram(src)) {
            await loadSequenceRenderer();
            const diagram = _seqParser(src);
            if (!diagram) { console.error('[AIRenderer] Sequence parse failed'); return false; }
            return _seqCanvas(diagram);
        }
        const type = structuredType(src);
        if (type) {
            await loadStructuredRenderer();
            const diagram = type === 'er' ? _structured.parseERDiagram(src) : _structured.parseChartDiagram(src);
            if (!diagram) { console.error('[AIRenderer] Structured Mermaid parse failed'); return false; }
            return type === 'er' ? _structured.renderEROnCanvas(diagram) : _structured.renderChartOnCanvas(diagram);
        }
        // Flowchart: use unified flowchart renderer (same SVG as preview)
        await loadFlowchartRenderer();
        const diagram = parseMermaid(src);
        if (!diagram) { console.error('[AIRenderer] Mermaid parse failed'); return false; }
        return _fcCanvas(diagram);
    };

    // Pre-load renderers so they're ready
    loadSequenceRenderer();
    loadFlowchartRenderer();
    loadStructuredRenderer();
}
