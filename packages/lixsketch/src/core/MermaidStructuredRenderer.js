/* eslint-disable */
/**
 * Native renderers for Mermaid ER and chart diagrams.
 *
 * Preview is SVG, while canvas placement deliberately creates ordinary
 * LixSketch shapes. That keeps entities, attributes, relationships, bars,
 * points, and legend items independently selectable and editable.
 */

const NS = 'http://www.w3.org/2000/svg';
const PALETTE = [
    { fill: '#8b7abb', stroke: '#665793' },
    { fill: '#a992cf', stroke: '#7762a6' },
    { fill: '#c2addc', stroke: '#8974aa' },
    { fill: '#7765a6', stroke: '#584883' },
    { fill: '#9d83c1', stroke: '#725b9a' },
    { fill: '#d1c3e7', stroke: '#927daf' },
];

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function contrastText(fill) {
    const raw = String(fill || '').replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw;
    if (!/^[0-9a-f]{6}$/i.test(hex)) return theme().text;
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = .299 * red + .587 * green + .114 * blue;
    return luminance > 145 ? '#34304a' : '#ffffff';
}

function isDark() {
    if (typeof document === 'undefined') return true;
    if (document.body) {
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
    }
    return !document.documentElement || document.documentElement.classList.contains('dark');
}

function theme() {
    return isDark()
        ? { bg: '#20232a', text: '#f0eee8', line: '#aaa89f', frame: '#77766f', panel: '#292d34' }
        : { bg: '#fbfaf6', text: '#343832', line: '#6e746c', frame: '#b9b7ac', panel: '#f5f2ea' };
}

function sourceLines(src) {
    return src.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'));
}

export function detectStructuredMermaid(src) {
    const header = sourceLines(src)[0]?.toLowerCase() || '';
    if (header === 'erdiagram') return 'er';
    if (/^pie(?:\s|$)/.test(header) || /^xychart(?:-beta)?(?:\s|$)/.test(header)) return 'chart';
    return null;
}

// ---------------------------------------------------------------------
// Entity relationship diagrams
// ---------------------------------------------------------------------

export function parseERDiagram(src) {
    const lines = sourceLines(src);
    if (lines[0]?.toLowerCase() !== 'erdiagram') return null;

    const entityMap = new Map();
    const relationships = [];
    let current = null;

    const ensureEntity = (name) => {
        if (!entityMap.has(name)) entityMap.set(name, { name, attributes: [] });
        return entityMap.get(name);
    };

    for (let index = 1; index < lines.length; index++) {
        const line = lines[index];
        const entityStart = line.match(/^([\w-]+)\s*\{$/);
        if (entityStart) {
            current = ensureEntity(entityStart[1]);
            continue;
        }
        if (line === '}') {
            current = null;
            continue;
        }
        if (current) {
            const attribute = line.match(/^(\S+)\s+(\S+)(?:\s+(.+))?$/);
            if (attribute) {
                current.attributes.push({
                    type: attribute[1],
                    name: attribute[2],
                    key: attribute[3] || '',
                });
            }
            continue;
        }

        // CUSTOMER ||--o{ ORDER : places
        const relation = line.match(/^([\w-]+)\s+([|o}{.]+)(?:--|\.\.)([|o}{.]+)\s+([\w-]+)\s*:\s*(.+)$/);
        if (relation) {
            ensureEntity(relation[1]);
            ensureEntity(relation[4]);
            relationships.push({
                from: relation[1],
                fromCardinality: relation[2],
                toCardinality: relation[3],
                to: relation[4],
                label: relation[5],
            });
        }
    }

    if (entityMap.size === 0) return null;
    return { type: 'erDiagram', title: 'Entity relationship diagram', entities: [...entityMap.values()], relationships };
}

function layoutER(diagram) {
    const width = 230;
    const headerHeight = 44;
    const rowHeight = 30;
    const columns = Math.max(1, Math.ceil(Math.sqrt(diagram.entities.length)));
    return diagram.entities.map((entity, index) => ({
        ...entity,
        x: 60 + (index % columns) * 330,
        y: 55 + Math.floor(index / columns) * 270,
        width,
        headerHeight,
        rowHeight,
        height: headerHeight + Math.max(1, entity.attributes.length) * rowHeight,
        color: PALETTE[index % PALETTE.length],
    }));
}

export function renderERPreviewSVG(diagram) {
    if (!diagram?.entities?.length) return '';
    const TK = theme();
    const entities = layoutER(diagram);
    const byName = new Map(entities.map(entity => [entity.name, entity]));
    const maxX = Math.max(...entities.map(entity => entity.x + entity.width)) + 60;
    const maxY = Math.max(...entities.map(entity => entity.y + entity.height)) + 55;
    let content = `<rect width="${maxX}" height="${maxY}" rx="10" fill="${TK.bg}"/>`;
    content += `<defs><marker id="er-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><path d="M1 1 L8 3.5 L1 6" fill="none" stroke="${TK.line}" stroke-width="1.4"/></marker></defs>`;

    for (const relation of diagram.relationships) {
        const from = byName.get(relation.from);
        const to = byName.get(relation.to);
        if (!from || !to) continue;
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height / 2;
        const x2 = to.x + to.width / 2;
        const y2 = to.y + to.height / 2;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${TK.line}" stroke-width="1.6" marker-end="url(#er-arrow)"/>`;
        content += `<text x="${mx}" y="${my - 8}" text-anchor="middle" fill="${TK.text}" font-size="12" font-family="lixFont">${escapeXml(`${relation.fromCardinality} ${relation.label} ${relation.toCardinality}`)}</text>`;
    }

    for (const entity of entities) {
        content += `<g><rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" rx="8" fill="${TK.panel}" stroke="${entity.color.stroke}" stroke-width="1.5"/>`;
        content += `<rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.headerHeight}" rx="8" fill="${entity.color.fill}" stroke="${entity.color.stroke}" stroke-width="1.5"/>`;
        content += `<text x="${entity.x + entity.width / 2}" y="${entity.y + 27}" text-anchor="middle" fill="${contrastText(entity.color.fill)}" font-size="14" font-weight="600" font-family="lixFont">${escapeXml(entity.name)}</text>`;
        const attributes = entity.attributes.length ? entity.attributes : [{ type: '', name: 'No attributes', key: '' }];
        attributes.forEach((attribute, row) => {
            const y = entity.y + entity.headerHeight + row * entity.rowHeight;
            content += `<line x1="${entity.x}" y1="${y}" x2="${entity.x + entity.width}" y2="${y}" stroke="${TK.frame}" stroke-width="0.8"/>`;
            content += `<text x="${entity.x + 10}" y="${y + 20}" fill="${TK.text}" font-size="11" font-family="lixCode">${escapeXml([attribute.type, attribute.name, attribute.key].filter(Boolean).join('  '))}</text>`;
        });
        content += '</g>';
    }
    return `<svg xmlns="${NS}" width="600" height="450" viewBox="0 0 ${maxX} ${maxY}">${content}</svg>`;
}

// ---------------------------------------------------------------------
// Pie and XY charts
// ---------------------------------------------------------------------

function numberList(value) {
    return value.replace(/^\[|\]$/g, '').split(',').map(item => Number(item.trim())).filter(Number.isFinite);
}

export function parseChartDiagram(src) {
    const lines = sourceLines(src);
    const header = lines[0]?.toLowerCase() || '';
    if (/^pie(?:\s|$)/.test(header)) {
        let title = lines[0].replace(/^pie(?:\s+showData)?\s*/i, '').replace(/^title\s+/i, '').trim() || 'Pie chart';
        const values = [];
        for (let index = 1; index < lines.length; index++) {
            const titleMatch = lines[index].match(/^title\s+(.+)$/i);
            if (titleMatch) { title = titleMatch[1]; continue; }
            const item = lines[index].match(/^"?(.+?)"?\s*:\s*(-?\d+(?:\.\d+)?)$/);
            if (item) values.push({ label: item[1], value: Number(item[2]) });
        }
        return values.length ? { type: 'chart', kind: 'pie', title, categories: values.map(v => v.label), series: [{ name: title, values: values.map(v => v.value) }] } : null;
    }
    if (!/^xychart(?:-beta)?(?:\s|$)/.test(header)) return null;
    let title = 'Chart';
    let categories = [];
    const series = [];
    for (let index = 1; index < lines.length; index++) {
        const titleMatch = lines[index].match(/^title\s+"?(.+?)"?$/i);
        const axisMatch = lines[index].match(/^x-axis(?:\s+".*?")?\s+(\[.+\])/i);
        const seriesMatch = lines[index].match(/^(bar|line)(?:\s+"?([^"\[]+)"?)?\s+(\[.+\])$/i);
        if (titleMatch) title = titleMatch[1];
        else if (axisMatch) categories = axisMatch[1].replace(/^\[|\]$/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        else if (seriesMatch) series.push({ kind: seriesMatch[1].toLowerCase(), name: seriesMatch[2]?.trim() || seriesMatch[1], values: numberList(seriesMatch[3]) });
    }
    const maxItems = Math.max(0, ...series.map(item => item.values.length));
    if (!categories.length) categories = Array.from({ length: maxItems }, (_, index) => String(index + 1));
    return series.length ? { type: 'chart', kind: 'xy', title, categories, series } : null;
}

// Mermaid permits bar and line declarations in one xychart. LixSketch keeps a
// bar chart visually bar-only: when at least one bar series exists, line
// series (and their point markers) are omitted consistently from preview and
// canvas placement. A chart made only from line declarations remains a line
// chart.
function renderedSeries(chart) {
    if (chart?.kind !== 'xy') return chart?.series || [];
    const bars = chart.series.filter(series => series.kind === 'bar');
    return bars.length ? bars : chart.series.filter(series => series.kind === 'line');
}

export function renderChartPreviewSVG(chart) {
    if (!chart?.series?.length) return '';
    const TK = theme();
    const width = 720;
    const height = 450;

    if (chart.kind === 'pie') {
        const values = chart.series[0].values.map(value => Math.max(0, value));
        const total = values.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return '';
        const cx = 255;
        const cy = 235;
        const radius = 145;
        let startAngle = -Math.PI / 2;
        let content = `<rect width="${width}" height="${height}" rx="10" fill="${TK.bg}"/><text x="${width / 2}" y="32" text-anchor="middle" fill="${TK.text}" font-size="18" font-family="lixFont">${escapeXml(chart.title)}</text>`;

        values.forEach((value, index) => {
            const endAngle = startAngle + value / total * Math.PI * 2;
            const x1 = cx + Math.cos(startAngle) * radius;
            const y1 = cy + Math.sin(startAngle) * radius;
            const x2 = cx + Math.cos(endAngle) * radius;
            const y2 = cy + Math.sin(endAngle) * radius;
            const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
            const color = PALETTE[index % PALETTE.length];
            content += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color.fill}" stroke="${TK.bg}" stroke-width="3"/>`;
            const percent = Math.round(value / total * 100);
            const legendY = 125 + index * 42;
            content += `<rect x="460" y="${legendY - 14}" width="18" height="18" rx="4" fill="${color.fill}" stroke="${color.stroke}"/><text x="488" y="${legendY}" fill="${TK.text}" font-size="12" font-family="lixFont">${escapeXml(chart.categories[index] || index + 1)} — ${value} (${percent}%)</text>`;
            startAngle = endAngle;
        });
        return `<svg xmlns="${NS}" width="600" height="450" viewBox="0 0 ${width} ${height}">${content}</svg>`;
    }

    const left = 70;
    const top = 60;
    const plotWidth = 580;
    const plotHeight = 300;
    const seriesToRender = renderedSeries(chart);
    const values = seriesToRender.flatMap(series => series.values);
    const maximum = Math.max(1, ...values.map(Math.abs));
    const categoryCount = Math.max(1, chart.categories.length);
    const slot = plotWidth / categoryCount;
    let content = `<rect width="${width}" height="${height}" rx="10" fill="${TK.bg}"/><text x="${width / 2}" y="32" text-anchor="middle" fill="${TK.text}" font-size="18" font-family="lixFont">${escapeXml(chart.title)}</text>`;
    content += `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="${TK.line}"/><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="${TK.line}"/>`;

    chart.categories.forEach((category, index) => {
        content += `<text x="${left + slot * (index + .5)}" y="${top + plotHeight + 24}" text-anchor="middle" fill="${TK.text}" font-size="11" font-family="lixFont">${escapeXml(category)}</text>`;
    });

    seriesToRender.forEach((series, seriesIndex) => {
        const color = PALETTE[seriesIndex % PALETTE.length];
        if (series.kind === 'line') {
            const points = series.values.map((value, index) => `${left + slot * (index + .5)},${top + plotHeight - Math.abs(value) / maximum * plotHeight}`).join(' ');
            content += `<polyline points="${points}" fill="none" stroke="${color.stroke}" stroke-width="3"/>`;
            series.values.forEach((value, index) => content += `<circle cx="${left + slot * (index + .5)}" cy="${top + plotHeight - Math.abs(value) / maximum * plotHeight}" r="5" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2"/>`);
        } else {
            const barWidth = Math.max(12, slot * .7 / seriesToRender.length);
            series.values.forEach((value, index) => {
                const barHeight = Math.abs(value) / maximum * plotHeight;
                const x = left + slot * index + slot * .15 + seriesIndex * barWidth;
                content += `<rect x="${x}" y="${top + plotHeight - barHeight}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.5"/><text x="${x + barWidth / 2}" y="${top + plotHeight - barHeight - 7}" text-anchor="middle" fill="${TK.text}" font-size="10" font-family="lixFont">${value}</text>`;
            });
        }
    });
    return `<svg xmlns="${NS}" width="600" height="450" viewBox="0 0 ${width} ${height}">${content}</svg>`;
}

// ---------------------------------------------------------------------
// Native canvas placement helpers
// ---------------------------------------------------------------------

function push(shape, frame) {
    if (!shape) return null;
    window.shapes.push(shape);
    if (frame?.addShapeToFrame) frame.addShapeToFrame(shape);
    if (window.pushCreateAction) window.pushCreateAction(shape);
    return shape;
}

function pushText(text, x, y, fontSize, fill, frame, textAnchor = 'start') {
    if (!window.TextShape || !window.svg) return null;
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-type', 'text-group');
    group.setAttribute('transform', `translate(${x}, ${y})`);
    group.setAttribute('data-x', x);
    group.setAttribute('data-y', y);

    const element = document.createElementNS(NS, 'text');
    element.setAttribute('x', 0);
    element.setAttribute('y', 0);
    element.setAttribute('dominant-baseline', 'central');
    element.setAttribute('text-anchor', textAnchor);
    element.setAttribute('fill', fill);
    element.setAttribute('font-size', fontSize);
    element.setAttribute('font-family', 'lixFont, sans-serif');
    element.setAttribute('data-initial-font', 'lixFont');
    element.setAttribute('data-initial-color', fill);
    element.setAttribute('data-initial-size', `${fontSize}px`);
    element.textContent = text;
    group.appendChild(element);
    window.svg.appendChild(group);
    return push(new window.TextShape(group), frame);
}

function canvasOrigin(width, height) {
    const vb = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    return { x: vb.x + vb.width / 2 - width / 2, y: vb.y + vb.height / 2 - height / 2 };
}

function createFrame(x, y, width, height, name, type) {
    const TK = theme();
    const frame = new window.Frame(x - 45, y - 45, width + 90, height + 90, {
        stroke: TK.frame, strokeWidth: 1, fill: 'transparent', opacity: .75,
        frameName: name, labelColor: TK.text,
    });
    frame._diagramType = type;
    window.shapes.push(frame);
    if (window.pushCreateAction) window.pushCreateAction(frame, { frameCreation: true, containedShapes: [] });
    return frame;
}

function selectOnlyFrame(frame) {
    if (!frame) return;
    if (window.multiSelection?.clearSelection) window.multiSelection.clearSelection();
    if (window.currentShape && window.currentShape !== frame && typeof window.currentShape.removeSelection === 'function') {
        window.currentShape.removeSelection();
    }
    if (window.__deselectTextElement) window.__deselectTextElement();
    window.currentShape = frame;
    if (typeof frame.selectFrame === 'function') frame.selectFrame();
}

export function renderEROnCanvas(diagram) {
    if (!diagram?.entities?.length || !window.Rectangle || !window.Arrow || !window.Frame) return false;
    const undoBatch = window.beginUndoBatch?.();
    const TK = theme();
    const entities = layoutER(diagram);
    const width = Math.max(...entities.map(entity => entity.x + entity.width)) + 40;
    const height = Math.max(...entities.map(entity => entity.y + entity.height)) + 40;
    const origin = canvasOrigin(width, height);
    const frame = createFrame(origin.x, origin.y, width, height, diagram.title, 'mermaid-er');
    const entityShapes = new Map();
    let first = null;

    for (const entity of entities) {
        const x = origin.x + entity.x;
        const y = origin.y + entity.y;
        const header = push(new window.Rectangle(x, y, entity.width, entity.headerHeight, {
            stroke: entity.color.stroke, strokeWidth: 1.5, fill: entity.color.fill, fillStyle: 'solid', roughness: 0, fillWeight: 0.5,
            label: entity.name, labelColor: contrastText(entity.color.fill), labelFontSize: 15, labelBg: false,
        }), frame);
        if (!first) first = header;
        entityShapes.set(entity.name, { shape: header, x, y, width: entity.width, height: entity.headerHeight });
        const attributes = entity.attributes.length ? entity.attributes : [{ type: '', name: 'No attributes', key: '' }];
        attributes.forEach((attribute, row) => push(new window.Rectangle(
            x, y + entity.headerHeight + row * entity.rowHeight, entity.width, entity.rowHeight,
            { stroke: TK.frame, strokeWidth: 1, fill: TK.panel, fillStyle: 'solid', roughness: 0, fillWeight: 0.5,
                label: [attribute.type, attribute.name, attribute.key].filter(Boolean).join('  '), labelColor: TK.text, labelFontSize: 11, labelBg: false }
        ), frame));
    }

    for (const relation of diagram.relationships) {
        const from = entityShapes.get(relation.from);
        const to = entityShapes.get(relation.to);
        if (!from || !to) continue;
        const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
        const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
        // Anchor the arrow at the actual box boundary (not the box center) so
        // it terminates at the entity edge instead of drawing through — and
        // over — the header label, and so autoAttach's nearest-side check
        // (which compares against this point) resolves to the side actually
        // facing the other entity rather than whichever side happens to be
        // closest to the geometric center on a short, wide header box.
        const start = rectBoundaryPoint(from, toCenter);
        const end = rectBoundaryPoint(to, fromCenter);
        const arrow = push(new window.Arrow(start, end, {
            stroke: TK.line, strokeWidth: 1.5, roughness: 0,
            label: `${relation.fromCardinality} ${relation.label} ${relation.toCardinality}`,
            labelColor: TK.text, labelBg: false, labelOffsetY: -12,
        }), frame);
        if (arrow && window.__autoAttach) {
            window.__autoAttach(arrow, from.shape, true, start);
            window.__autoAttach(arrow, to.shape, false, end);
        }
    }
    if (first?.selectShape) { window.currentShape = first; first.selectShape(); }
    window.endUndoBatch?.(undoBatch, 'mermaid-er-create');
    return true;
}

// Intersection of the line from `box`'s center toward `target` with box's
// own rectangular boundary. Used to anchor ER relationship arrows exactly
// at the entity edge instead of the entity center.
function rectBoundaryPoint(box, target) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const hw = box.width / 2;
    const hh = box.height / 2;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    return { x: cx + dx * scale, y: cy + dy * scale };
}

export function renderChartOnCanvas(chart) {
    if (!chart?.series?.length || !window.Rectangle || !window.Circle || !window.Line || !window.FreehandStroke || !window.Frame) return false;
    if (chart.kind === 'pie') return renderPieOnCanvas(chart);
    const undoBatch = window.beginUndoBatch?.();
    const TK = theme();
    const width = 720;
    const height = 450;
    const origin = canvasOrigin(width, height);
    const frame = createFrame(origin.x, origin.y, width, height, chart.title, 'mermaid-chart');
    const left = origin.x + 70;
    const top = origin.y + 65;
    const plotWidth = 580;
    const plotHeight = 300;
    const seriesToRender = renderedSeries(chart);
    const values = seriesToRender.flatMap(series => series.values);
    const maximum = Math.max(1, ...values.map(Math.abs));
    const slot = plotWidth / Math.max(1, chart.categories.length);
    push(new window.Line({ x: left, y: top }, { x: left, y: top + plotHeight }, { stroke: TK.line, strokeWidth: 1.5, roughness: 0 }), frame);
    push(new window.Line({ x: left, y: top + plotHeight }, { x: left + plotWidth, y: top + plotHeight }, { stroke: TK.line, strokeWidth: 1.5, roughness: 0 }), frame);

    // Match the preview layout: categories live below the axis and values sit
    // above bars. Embedding both strings in the rectangle used to add an
    // opaque canvas-coloured label pill through the middle of every bar,
    // visually splitting it and changing the perceived series colour.
    chart.categories.forEach((category, index) => pushText(
        category,
        left + slot * (index + .5),
        top + plotHeight + 24,
        11,
        TK.text,
        frame,
        'middle',
    ));

    seriesToRender.forEach((series, seriesIndex) => {
        const color = PALETTE[seriesIndex % PALETTE.length];
        if (series.kind === 'line') {
            const linePoints = series.values.map((value, index) => {
                const point = { x: left + slot * (index + .5), y: top + plotHeight - Math.abs(value) / maximum * plotHeight };
                push(new window.Circle(point.x, point.y, 8, 8, {
                    stroke: color.stroke, strokeWidth: 2, fill: color.fill,
                    fillStyle: 'solid', roughness: 0, disableMultiStroke: true,
                }), frame);
                return [point.x, point.y, .5];
            });
            if (linePoints.length > 1) {
                push(new window.FreehandStroke(linePoints, {
                    stroke: color.stroke,
                    strokeWidth: 3,
                    thinning: 0,
                    roughness: 0,
                    strokeStyle: 'solid',
                }), frame);
            }
        } else {
            const barWidth = Math.max(18, slot * .7 / seriesToRender.length);
            series.values.forEach((value, index) => {
                const barHeight = Math.max(8, Math.abs(value) / maximum * plotHeight);
                const x = left + slot * index + slot * .15 + seriesIndex * barWidth;
                push(new window.Rectangle(x, top + plotHeight - barHeight, barWidth, barHeight, {
                    stroke: color.stroke, strokeWidth: 1.5, fill: color.fill,
                    fillStyle: 'solid', roughness: 0, disableMultiStroke: true,
                    disableMultiStrokeFill: true, preserveVertices: true,
                }), frame);
                pushText(String(value), x + barWidth / 2, top + plotHeight - barHeight - 7, 10, TK.text, frame, 'middle');
            });
        }
    });
    selectOnlyFrame(frame);
    window.endUndoBatch?.(undoBatch, 'mermaid-chart-create');
    return true;
}

function renderPieOnCanvas(chart) {
    if (!window.FreehandStroke || !window.TextShape) return false;
    const values = chart.series[0].values.map(value => Math.max(0, value));
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return false;
    const undoBatch = window.beginUndoBatch?.();
    const width = 720;
    const height = 450;
    const origin = canvasOrigin(width, height);
    const frame = createFrame(origin.x, origin.y, width, height, chart.title, 'mermaid-pie');

    const cx = origin.x + 255;
    const cy = origin.y + 235;
    const radius = 145;
    let startAngle = -Math.PI / 2;

    values.forEach((value, index) => {
        const sweep = value / total * Math.PI * 2;
        const endAngle = startAngle + sweep;
        const steps = Math.max(6, Math.ceil(sweep / (Math.PI / 60)));
        const points = [[cx, cy, .5]];
        for (let step = 0; step <= steps; step++) {
            const angle = startAngle + sweep * (step / steps);
            points.push([
                cx + Math.cos(angle) * radius,
                cy + Math.sin(angle) * radius,
                .5,
            ]);
        }
        const color = PALETTE[index % PALETTE.length];
        push(new window.FreehandStroke(points, {
            stroke: color.fill,
            strokeWidth: 3,
            outlineStroke: theme().bg,
            outlineWidth: 3,
            closedFill: true,
            roughness: 0,
            strokeStyle: 'solid',
        }), frame);
        const percent = Math.round(value / total * 100);
        const legendY = origin.y + 125 + index * 42;
        push(new window.Rectangle(origin.x + 460, legendY - 14, 18, 18, {
            stroke: color.stroke,
            strokeWidth: 1,
            fill: color.fill,
            fillStyle: 'solid',
            roughness: .5,
        }), frame);
        pushText(
            `${chart.categories[index] || index + 1} — ${value} (${percent}%)`,
            origin.x + 488,
            legendY,
            12,
            theme().text,
            frame,
        );
        startAngle = endAngle;
    });

    selectOnlyFrame(frame);
    window.endUndoBatch?.(undoBatch, 'mermaid-pie-create');
    return true;
}
